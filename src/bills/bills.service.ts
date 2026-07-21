import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction, TransactionStatus, TransactionType, TransactionCategory } from '../entities/transaction.entity.js';
import { Bill, BillStatus, BillType } from '../entities/bill.entity.js';
import {
  BillsServiceContract,
  BillerCategory,
  Biller,
  BillerProduct,
  BillPaymentRequest,
  BillPaymentResult,
} from '../contracts/financial-services.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';
import { MonnifyError } from '../monnify/monnify-error.js';
import {
  WalletBalanceResponse,
  MonnifyCategory,
  MonnifyBiller,
  MonnifyProduct,
  CustomerValidationResponse,
  VendResponse,
  RequeryResponse,
  PaginatedContent,
} from '../monnify/monnify.types.js';

@Injectable()
export class BillsService implements BillsServiceContract {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Bill)
    private readonly billRepository: Repository<Bill>,
    private readonly monnify: MonnifyHttpClient,
    private readonly configService: ConfigService,
  ) {}

  private extractArray<T>(response: T[] | PaginatedContent<T>): T[] {
    return Array.isArray(response) ? response : response.content;
  }

  async listCategories(): Promise<BillerCategory[]> {
    const responseBody = await this.monnify.get<PaginatedContent<MonnifyCategory>>(
      '/api/v1/vas/bills-payment/biller-categories',
    );
    return this.extractArray(responseBody).map((item) => ({
      categoryCode: item.code,
      categoryName: item.name,
    }));
  }

  async listBillers(categoryCode?: string): Promise<Biller[]> {
    const query: Record<string, string> = {};
    if (categoryCode) {
      query.categoryCode = categoryCode;
    }
    const responseBody = await this.monnify.get<PaginatedContent<MonnifyBiller>>(
      '/api/v1/vas/bills-payment/billers',
      query,
    );
    return this.extractArray(responseBody).map((item) => ({
      billerCode: item.billerCode,
      billerName: item.billerName,
      categoryCode: item.categoryCode,
    }));
  }

  async getBillerProducts(billerCode: string): Promise<BillerProduct[]> {
    const responseBody = await this.monnify.get<PaginatedContent<MonnifyProduct>>(
      '/api/v1/vas/bills-payment/biller-products',
      { billerCode },
    );
    return this.extractArray(responseBody).map((item) => ({
      productCode: item.productCode,
      productName: item.productName,
      amount: item.amount,
      fixedPrice: item.fixedPrice,
    }));
  }

  async validateCustomer(
    productCode: string,
    customerId: string,
  ): Promise<{ valid: boolean; name?: string; validationReference?: string }> {
    try {
      const responseBody = await this.monnify.post<CustomerValidationResponse>(
        '/api/v1/vas/bills-payment/validate-customer',
        { productCode, customerId },
      );
      return {
        valid: true,
        name: responseBody.responseBody?.customerName,
        validationReference: responseBody.responseBody?.validationReference,
      };
    } catch {
      return { valid: false };
    }
  }

  async executeBillPayment(request: BillPaymentRequest): Promise<BillPaymentResult> {
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
      const responseBody = await this.monnify.post<VendResponse>(
        '/api/v1/vas/bills-payment/vend',
        {
          productCode: request.productCode,
          customerId: request.customerId,
          amount: request.amountKobo,
          reference: request.reference,
          validationReference: request.validationReference,
        },
      );

      const isSuccess = responseBody.status === 'SUCCESS' || responseBody.status === 'success';
      const isPending = responseBody.status === 'PENDING' || responseBody.status === 'pending';
      const transactionStatus = isSuccess ? TransactionStatus.SUCCESS : isPending ? TransactionStatus.PENDING : TransactionStatus.FAILED;
      const billStatus = isSuccess ? BillStatus.SUCCESS : isPending ? BillStatus.PENDING : BillStatus.FAILED;

      const transaction = await this.transactionRepository.save(
        this.transactionRepository.create({
          walletId: wallet.id,
          type: TransactionType.DEBIT,
          category: TransactionCategory.BILL_PAYMENT,
          amount: String(request.amountKobo),
          fee: '0',
          monnifyReference: responseBody.transactionReference,
          status: transactionStatus,
          reference: randomUUID(),
          narration: `Bill payment - ${request.provider}`,
        }),
      );

      await this.billRepository.save(
        this.billRepository.create({
          userId: request.userId,
          provider: request.provider,
          billType: request.billType as BillType,
          customerReference: request.customerId,
          amount: String(request.amountKobo),
          transactionId: transaction.id,
          status: billStatus,
        }),
      );

      if (isPending && responseBody.reference) {
        try {
          const requeryResult = await this.requeryBillPayment(responseBody.reference);
          if (requeryResult.status !== 'PENDING') {
            return requeryResult;
          }
        } catch (error) {
          this.logger.warn('Requery failed for pending bill payment', error as Error);
        }
      }

      return {
        reference: request.reference,
        status: isSuccess ? 'SUCCESS' : isPending ? 'PENDING' : 'FAILED',
        transactionReference: responseBody.transactionReference,
      };
    } catch (error) {
      await this.walletRepository.update(
        { id: wallet.id },
        { balance: () => `balance + ${request.amountKobo}` },
      );
      const message = error instanceof MonnifyError ? error.message : 'Bill payment failed';
      return { reference: '', status: 'FAILED', failureReason: message };
    }
  }

  async requeryBillPayment(reference: string): Promise<BillPaymentResult> {
    try {
      const responseBody = await this.monnify.get<RequeryResponse>(
        '/api/v1/vas/bills-payment/requery',
        { reference },
      );

      const status = responseBody.status === 'SUCCESS' || responseBody.status === 'success'
        ? 'SUCCESS'
        : responseBody.status === 'FAILED' || responseBody.status === 'failed'
          ? 'FAILED'
          : 'PENDING';

      return {
        reference: responseBody.reference ?? reference,
        status,
        transactionReference: responseBody.transactionReference,
      };
    } catch (error) {
      const message = error instanceof MonnifyError ? error.message : 'Requery failed';
      return { reference, status: 'FAILED', failureReason: message };
    }
  }
}
