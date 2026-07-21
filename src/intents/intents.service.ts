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
    const intent = await this.loadOwnedIntent(userId, intentId);
    this.assertPending(intent);

    intent.status = IntentStatus.CONFIRMED;
    await this.intentRepository.save(intent);

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
      narration: intent.payload.narration,
      idempotencyKey: intent.idempotencyKey,
    });

    if (result.status === 'FAILED') {
      intent.status = IntentStatus.FAILED;
      intent.failureReason = result.failureReason ?? 'Transfer failed';
      await this.intentRepository.save(intent);
      return { status: 'FAILED', failureReason: intent.failureReason };
    }

    intent.status = IntentStatus.EXECUTED;
    await this.intentRepository.save(intent);
    return { status: 'EXECUTED', reference: result.reference };
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

  private assertPending(intent: TransactionIntent): void {
    if (
      intent.status === IntentStatus.PENDING &&
      this.isExpired(intent.expiresAt)
    ) {
      intent.status = IntentStatus.EXPIRED;
      void this.intentRepository.save(intent);
      throw new ConflictException('This request expired — ask Sow again');
    }
    if (intent.status !== IntentStatus.PENDING) {
      throw new ConflictException('This request has already been processed');
    }
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
  ): Promise<{ intentId: string; summary: string; expiresAt: Date } | null> {
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
      expiresAt: intent.expiresAt,
    };
  }

  private isExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= Date.now();
  }
}
