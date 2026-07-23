import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  TransactionIntent,
  IntentType,
  IntentStatus,
  TransferIntentPayload,
} from '../entities/transaction-intent.entity.js';
import {
  BANKS_SERVICE,
  PAYMENTS_SERVICE,
} from '../contracts/financial-services.js';
import type {
  BanksServiceContract,
  PaymentsServiceContract,
  ResolvedAccount,
} from '../contracts/financial-services.js';
import {
  CreateTransferIntentInput,
  TransferIntentView,
  IntentExecutionResult,
} from './intents.types.js';

const INTENT_TTL_MINUTES = 5;
const NAIRA = 100;

@Injectable()
export class IntentsService {
  constructor(
    @InjectRepository(TransactionIntent)
    private readonly intentRepository: Repository<TransactionIntent>,
    @Inject(BANKS_SERVICE)
    private readonly banksService: BanksServiceContract,
    @Inject(PAYMENTS_SERVICE)
    private readonly paymentsService: PaymentsServiceContract,
  ) {}

  async createTransferIntent(
    userId: string,
    input: CreateTransferIntentInput,
  ): Promise<TransferIntentView> {
    const recipient = await this.resolveRecipient(userId, input);
    const payload: TransferIntentPayload = {
      destinationAccountNumber: recipient.accountNumber,
      destinationBankCode: recipient.bankCode,
      destinationBankName: recipient.bankName,
      accountName: recipient.accountName,
      narration: input.narration ?? 'Sow transfer',
    };

    const intent = await this.intentRepository.save(
      this.intentRepository.create({
        userId,
        type: IntentType.TRANSFER,
        status: IntentStatus.PENDING,
        amountKobo: String(input.amountKobo),
        payload,
        summary: this.buildSummary(input.amountKobo, recipient),
        idempotencyKey: randomUUID(),
        expiresAt: this.buildExpiry(),
        failureReason: null,
        conversationId: input.conversationId ?? null,
      }),
    );

    return {
      intentId: intent.id,
      summary: intent.summary,
      amountKobo: input.amountKobo,
      recipientAccountName: recipient.accountName,
      expiresAt: intent.expiresAt,
    };
  }

  async confirm(
    userId: string,
    intentId: string,
  ): Promise<IntentExecutionResult> {
    // Atomic transition PENDING → CONFIRMED, also checking expiry.
    // This prevents double-execution from concurrent confirm requests.
    const updateResult = await this.intentRepository
      .createQueryBuilder()
      .update(TransactionIntent)
      .set({ status: IntentStatus.CONFIRMED })
      .where(
        'id = :id AND "userId" = :userId AND status = :status AND "expiresAt" > :now',
        { id: intentId, userId, status: IntentStatus.PENDING, now: new Date() },
      )
      .execute();

    if (updateResult.affected === 0) {
      // Load the intent to produce a precise error message
      const intent = await this.intentRepository.findOne({ where: { id: intentId } });
      if (!intent || intent.userId !== userId) {
        throw new NotFoundException('Transaction request not found');
      }
      if (this.isExpired(intent.expiresAt)) {
        throw new ConflictException('This request expired — ask Sow again');
      }
      throw new ConflictException('This request has already been processed');
    }

    const intent = await this.loadOwnedIntent(userId, intentId);
    return this.execute(intent);
  }

  async cancel(
    userId: string,
    intentId: string,
  ): Promise<{ status: IntentStatus }> {
    const intent = await this.loadOwnedIntent(userId, intentId);
    if (intent.status !== IntentStatus.PENDING) {
      throw new ConflictException('This request can no longer be cancelled');
    }
    intent.status = IntentStatus.CANCELLED;
    await this.intentRepository.save(intent);
    return { status: intent.status };
  }

  private async execute(
    intent: TransactionIntent,
  ): Promise<IntentExecutionResult> {
    const result = await this.paymentsService.executeTransfer({
      userId: intent.userId,
      amountKobo: Number(intent.amountKobo),
      destinationAccountNumber: intent.payload.destinationAccountNumber,
      destinationBankCode: intent.payload.destinationBankCode,
      destinationAccountName: intent.payload.accountName,
      narration: intent.payload.narration,
      idempotencyKey: intent.idempotencyKey,
    });

    if (result.status === 'FAILED') {
      intent.status = IntentStatus.FAILED;
      intent.failureReason = result.failureReason ?? 'Transfer failed';
      await this.intentRepository.save(intent);
      return { status: 'FAILED', failureReason: intent.failureReason };
    }

    if (result.otpRequired && result.otpReference) {
      intent.status = IntentStatus.AWAITING_OTP;
      intent.otpReference = result.otpReference;
      await this.intentRepository.save(intent);
      return {
        status: 'PENDING_OTP',
        otpReference: result.otpReference,
      };
    }

    intent.status = IntentStatus.EXECUTED;
    await this.intentRepository.save(intent);
    return { status: 'EXECUTED', reference: result.reference };
  }

  async submitOtp(
    userId: string,
    intentId: string,
    otp: string,
  ): Promise<IntentExecutionResult> {
    const intent = await this.loadOwnedIntent(userId, intentId);
    if (intent.status !== IntentStatus.AWAITING_OTP) {
      throw new ConflictException('This request is not waiting for an OTP');
    }

    if (this.isExpired(intent.expiresAt)) {
      intent.status = IntentStatus.EXPIRED;
      await this.intentRepository.save(intent);
      throw new ConflictException('This request expired — ask Sow again');
    }

    if (!intent.otpReference) {
      throw new ConflictException('No OTP reference found for this request');
    }

    const result = await this.paymentsService.validateOtp(
      intent.otpReference,
      otp,
    );

    if (result.status === 'FAILED') {
      intent.status = IntentStatus.FAILED;
      intent.failureReason = result.failureReason ?? 'OTP validation failed';
      await this.intentRepository.save(intent);
      return { status: 'FAILED', failureReason: intent.failureReason };
    }

    intent.status = IntentStatus.EXECUTED;
    await this.intentRepository.save(intent);
    return { status: 'EXECUTED', reference: result.reference };
  }

  async attachConversation(
    intentId: string,
    conversationId: string,
  ): Promise<void> {
    await this.intentRepository.update(intentId, { conversationId });
  }

  private async resolveRecipient(
    userId: string,
    input: CreateTransferIntentInput,
  ): Promise<ResolvedAccount> {
    if (input.accountNumber && input.bankCode) {
      return this.banksService.resolveAccountName(
        input.accountNumber,
        input.bankCode,
      );
    }

    if (input.recipientName) {
      const beneficiary = await this.banksService.findBeneficiaryByName(
        userId,
        input.recipientName,
      );
      if (!beneficiary) {
        throw new BadRequestException(
          'I could not find that beneficiary — provide an account number and bank',
        );
      }
      return beneficiary;
    }

    throw new BadRequestException(
      'Provide a beneficiary name or an account number and bank',
    );
  }

  private async loadOwnedIntent(
    userId: string,
    intentId: string,
  ): Promise<TransactionIntent> {
    const intent = await this.intentRepository.findOne({
      where: { id: intentId },
    });
    if (!intent || intent.userId !== userId) {
      throw new NotFoundException('Transaction request not found');
    }
    return intent;
  }

  private buildSummary(amountKobo: number, recipient: ResolvedAccount): string {
    const amount = this.formatNaira(amountKobo);
    const maskedAccount = recipient.accountNumber.slice(-4);
    return `Transfer ${amount} to ${recipient.accountName} (${recipient.bankName} ****${maskedAccount})`;
  }

  private formatNaira(amountKobo: number): string {
    const naira = amountKobo / NAIRA;
    return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  }

  private buildExpiry(): Date {
    return new Date(Date.now() + INTENT_TTL_MINUTES * 60 * 1000);
  }

  async findPendingIntent(
    userId: string,
  ): Promise<{
    intentId: string;
    summary: string;
    amountKobo: number;
    recipientAccountName: string;
    expiresAt: Date;
  } | null> {
    const intent = await this.intentRepository.findOne({
      where: { userId, status: IntentStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!intent) return null;
    if (intent.expiresAt.getTime() <= Date.now()) {
      intent.status = IntentStatus.EXPIRED;
      await this.intentRepository.save(intent);
      return null;
    }
    return {
      intentId: intent.id,
      summary: intent.summary,
      amountKobo: Number(intent.amountKobo),
      recipientAccountName: intent.payload.accountName,
      expiresAt: intent.expiresAt,
    };
  }

  private isExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= Date.now();
  }
}
