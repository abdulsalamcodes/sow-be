import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Wallet } from '../../entities/wallet.entity.js';
import { Transaction, TransactionStatus, TransactionType, TransactionCategory } from '../../entities/transaction.entity.js';
import { Bill, BillStatus } from '../../entities/bill.entity.js';
import { MonnifyWebhookPayload, ReservedAccountWebhookData, DisbursementWebhookData, BillPaymentWebhookData } from './webhooks.types.js';

function normaliseIncomingTransfer(data: Record<string, unknown>): ReservedAccountWebhookData {
  const dest = data.destinationAccountInformation as Record<string, string> | undefined;
  return {
    transactionReference: data.transactionReference as string,
    paymentReference: data.paymentReference as string,
    amountPaid: data.amountPaid as number,
    totalPayable: (data.totalPayable ?? data.amountPaid) as number,
    settlementAmount: data.settlementAmount as number,
    paidOn: data.paidOn as string,
    paymentStatus: data.paymentStatus as string,
    currency: data.currency as string,
    paymentMethod: data.paymentMethod as string,
    accountNumber: dest?.accountNumber ?? (data.accountNumber as string),
    bankCode: dest?.bankCode ?? (data.bankCode as string),
    bankName: dest?.bankName ?? (data.bankName as string),
    customer: data.customer as { email: string; name: string },
  };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly secretKey: string;

  constructor(
    configService: ConfigService,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Bill)
    private readonly billRepository: Repository<Bill>,
  ) {
    this.secretKey = configService.getOrThrow<string>('MONNIFY_SECRET_KEY');
  }

  verifySignature(rawBody: Buffer, signatureHeader: string): void {
    const hmac = createHmac('sha512', this.secretKey);
    const computed = hmac.update(rawBody).digest('hex');
    if (signatureHeader.length !== computed.length) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (!timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader))) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async handleEvent(payload: MonnifyWebhookPayload): Promise<void> {
    try {
      const data = payload.eventData as Record<string, unknown>;
      switch (payload.eventType) {
        case 'RESERVED_ACCOUNT_TRANSACTION':
        case 'SUCCESSFUL_TRANSACTION':
          await this.handleIncomingTransfer(normaliseIncomingTransfer(data));
          break;
        case 'SUCCESSFUL_DISBURSEMENT':
        case 'FAILED_DISBURSEMENT':
          await this.handleDisbursementStatus(payload.eventData as unknown as DisbursementWebhookData);
          break;
        case 'SUCCESSFUL_BILL_PAYMENT':
        case 'FAILED_BILL_PAYMENT':
          await this.handleBillPaymentStatus(payload.eventData as unknown as BillPaymentWebhookData);
          break;
      }
    } catch (error) {
      this.logger.error('Webhook handler error', error as Error);
    }
  }

  private async handleIncomingTransfer(data: ReservedAccountWebhookData): Promise<void> {
    const existingTransaction = await this.transactionRepository.findOne({
      where: { monnifyReference: data.transactionReference },
    });
    if (existingTransaction) {
      return;
    }

    const wallet = await this.walletRepository.findOne({
      where: { accountNumber: data.accountNumber },
    });
    if (!wallet) {
      this.logger.warn('Incoming transfer to unknown account', { accountNumber: data.accountNumber });
      return;
    }

    const amountKobo = data.amountPaid * 100;
    await this.transactionRepository.save(
      this.transactionRepository.create({
        walletId: wallet.id,
        type: TransactionType.CREDIT,
        category: TransactionCategory.FUNDING,
        amount: String(amountKobo),
        fee: '0',
        monnifyReference: data.transactionReference,
        status: TransactionStatus.SUCCESS,
        reference: randomUUID(),
        narration: 'Wallet funding',
      }),
    );

    await this.walletRepository.update(
      { id: wallet.id },
      { balance: () => `balance + ${amountKobo}` },
    );
  }

  private async handleDisbursementStatus(data: DisbursementWebhookData): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { monnifyReference: data.transactionReference },
    });
    if (!transaction) {
      this.logger.warn('Disbursement webhook for unknown transaction', { transactionReference: data.transactionReference });
      return;
    }
    if (transaction.status === TransactionStatus.SUCCESS || transaction.status === TransactionStatus.FAILED) {
      return;
    }

    const newStatus = data.status === 'SUCCESS' ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;
    await this.transactionRepository.update(
      { id: transaction.id },
      { status: newStatus, fee: String(data.fee ?? transaction.fee) },
    );

    if (newStatus === TransactionStatus.FAILED) {
      const amount = Number(transaction.amount);
      await this.walletRepository.update(
      { id: transaction.walletId },
      { balance: () => `balance + ${amount}` },
      );
      this.logger.log('Debit reversed for failed disbursement', { transactionId: transaction.id, amount });
    }
  }

  private async handleBillPaymentStatus(data: BillPaymentWebhookData): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { monnifyReference: data.transactionReference },
    });
    if (!transaction) {
      this.logger.warn('Bill payment webhook for unknown transaction', { transactionReference: data.transactionReference });
      return;
    }
    if (transaction.status === TransactionStatus.SUCCESS || transaction.status === TransactionStatus.FAILED) {
      return;
    }

    const newStatus = data.status === 'SUCCESS' ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;
    await this.transactionRepository.update(
      { id: transaction.id },
      { status: newStatus },
    );

    const bill = await this.billRepository.findOne({
      where: { transactionId: transaction.id },
    });
    if (bill) {
      const billStatus = data.status === 'SUCCESS' ? BillStatus.SUCCESS : BillStatus.FAILED;
      await this.billRepository.update(
        { id: bill.id },
        { status: billStatus },
      );
    }

    if (newStatus === TransactionStatus.FAILED) {
      const amount = Number(transaction.amount);
      await this.walletRepository.update(
        { id: transaction.walletId },
        { balance: () => `balance + ${amount}` },
      );
    }
  }
}
