import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Wallet } from '../entities/wallet.entity.js';
import { Kyc } from '../entities/kyc.entity.js';
import { User } from '../entities/user.entity.js';
import { WalletSnapshot, WalletServiceContract } from '../contracts/financial-services.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';
import { MonnifyError } from '../monnify/monnify-error.js';
import { WalletBalanceResponse, ReservedAccountResponse } from '../monnify/monnify.types.js';

@Injectable()
export class WalletService implements WalletServiceContract {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Kyc)
    private readonly kycRepository: Repository<Kyc>,
    private readonly monnify: MonnifyHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async exists(userId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({ where: { userId } });
  }

  async getWallet(userId: string): Promise<WalletSnapshot> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    let monnifyBalance: string | null = null;
    try {
      const balanceData = await this.monnify.get<WalletBalanceResponse>(
        '/api/v2/disbursements/wallet-balance',
        { accountNumber: this.configService.getOrThrow<string>('MONNIFY_WALLET_ACCOUNT_NUMBER') },
      );
      const amount = balanceData?.amount;
      if (typeof amount === 'number' && !Number.isNaN(amount)) {
        monnifyBalance = String(amount);
      }
    } catch (error) {
      this.logger.warn('Failed to fetch Monnify balance, using local cache', error as Error);
    }

    const balanceKobo = monnifyBalance ?? wallet.balance;
    return {
      balanceKobo: typeof balanceKobo === 'string' ? balanceKobo : '0',
      accountNumber: wallet.accountNumber,
      bankName: wallet.bankName,
      accountName: null,
    };
  }

  async createVirtualAccount(user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>, kyc: Kyc): Promise<Wallet> {
    const responseBody = await this.monnify.post<ReservedAccountResponse>(
      '/api/v2/bank-transfer/reserved-accounts',
      {
        accountReference: `sow-${user.id}`,
        accountName: `Sow/${user.firstName} ${user.lastName}`,
        currencyCode: 'NGN',
        contractCode: this.configService.getOrThrow<string>('MONNIFY_CONTRACT_CODE'),
        customerEmail: user.email,
        customerName: `${user.firstName} ${user.lastName}`,
        bvn: kyc.bvn,
        getAllAvailableBanks: false,
        preferredBanks: ['035'],
      },
    );

    const account = responseBody.accounts[0];
    const wallet = this.walletRepository.create({
      userId: user.id,
      walletName: `${user.firstName} ${user.lastName}'s Wallet`,
      accountReference: responseBody.accountReference,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      currency: 'NGN',
      balance: '0',
    });

    return this.walletRepository.save(wallet);
  }
}
