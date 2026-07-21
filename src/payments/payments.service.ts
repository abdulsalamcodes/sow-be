import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction, TransactionStatus, TransactionType, TransactionCategory } from '../entities/transaction.entity.js';
import { PaymentsServiceContract, TransferRequest, TransferResult } from '../contracts/financial-services.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';
import { MonnifyError } from '../monnify/monnify-error.js';
import { WalletBalanceResponse, DisbursementWithOtp } from '../monnify/monnify.types.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentsService implements PaymentsServiceContract {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly monnify: MonnifyHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async executeTransfer(request: TransferRequest): Promise<TransferResult> {
    const wallet = await this.walletRepository.findOne({ where: { userId: request.userId } });
    if (!wallet) {
      return { reference: '', status: 'FAILED', failureReason: 'Wallet not found' };
    }

    const monnifyBalance = await this.monnify.get<WalletBalanceResponse>(
      '/api/v2/disbursements/wallet-balance',
      { accountNumber: this.configService.getOrThrow<string>('MONNIFY_WALLET_ACCOUNT_NUMBER') },
    );
    if (monnifyBalance.amount < request.amountKobo) {
      return { reference: '', status: 'FAILED', failureReason: 'Insufficient balance' };
    }

    const debitResult = await this.walletRepository.update(
      { id: wallet.id },
      { balance: () => `balance - ${request.amountKobo}` },
    );
    if (debitResult.affected === 0) {
      return { reference: '', status: 'FAILED', failureReason: 'Insufficient balance' };
    }

    try {
      const responseBody = await this.monnify.post<DisbursementWithOtp>(
        '/api/v2/disbursements/single',
        {
          amount: request.amountKobo,
          reference: request.idempotencyKey,
          narration: request.narration,
          destinationBankCode: request.destinationBankCode,
          destinationAccountNumber: request.destinationAccountNumber,
          destinationAccountName: '',
          sourceAccountNumber: this.configService.getOrThrow<string>('MONNIFY_WALLET_ACCOUNT_NUMBER'),
          currency: 'NGN',
        },
      );

      if ('otpData' in responseBody && responseBody.otpData) {
        const otpData = responseBody.otpData;
        await this.transactionRepository.save(
          this.transactionRepository.create({
            walletId: wallet.id,
            type: TransactionType.DEBIT,
            category: TransactionCategory.TRANSFER,
            amount: String(request.amountKobo),
            fee: '0',
            monnifyReference: otpData.transactionReference,
            status: TransactionStatus.AWAITING_OTP,
            reference: randomUUID(),
            narration: request.narration,
            otpReference: otpData.otpReference,
          }),
        );
        return {
          reference: otpData.transactionReference,
          status: 'PENDING',
          otpRequired: true,
          otpReference: otpData.otpReference,
        };
      }

      const reference = responseBody.reference ?? responseBody.transactionReference ?? request.idempotencyKey;
      await this.transactionRepository.save(
        this.transactionRepository.create({
          walletId: wallet.id,
          type: TransactionType.DEBIT,
          category: TransactionCategory.TRANSFER,
          amount: String(request.amountKobo),
          fee: '0',
          monnifyReference: reference,
          status: TransactionStatus.PENDING,
          reference: randomUUID(),
          narration: request.narration,
        }),
      );

      return { reference, status: 'PENDING' };
    } catch (error) {
      await this.walletRepository.update(
        { id: wallet.id },
        { balance: () => `balance + ${request.amountKobo}` },
      );
      const message = error instanceof MonnifyError ? error.message : 'Transfer failed';
      return { reference: '', status: 'FAILED', failureReason: message };
    }
  }

  async validateOtp(otpReference: string, otp: string): Promise<TransferResult> {
    try {
      const responseBody = await this.monnify.post<{ transactionReference: string; status: string }>(
        '/api/v2/disbursements/single/validate-otp',
        { otpReference, otp },
      );

      const transaction = await this.transactionRepository.findOne({
        where: { otpReference },
      });
      if (transaction) {
        transaction.status = TransactionStatus.SUCCESS;
        transaction.monnifyReference = responseBody.transactionReference;
        await this.transactionRepository.save(transaction);
      }

      return { reference: responseBody.transactionReference, status: 'SUCCESS' };
    } catch (error) {
      const transaction = await this.transactionRepository.findOne({
        where: { otpReference },
      });
      if (transaction) {
        transaction.status = TransactionStatus.FAILED;
        await this.transactionRepository.save(transaction);
        await this.walletRepository.update(
          { id: transaction.walletId },
          { balance: () => `balance + ${Number(transaction.amount)}` },
        );
      }
      const message = error instanceof MonnifyError ? error.message : 'OTP validation failed';
      return { reference: '', status: 'FAILED', failureReason: message };
    }
  }
}
