import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Wallet } from '../entities/wallet.entity.js';
import { Kyc } from '../entities/kyc.entity.js';
import { User } from '../entities/user.entity.js';
import {
  WalletSnapshot,
  WalletServiceContract,
} from '../contracts/financial-services.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';
import { MonnifyError } from '../monnify/monnify-error.js';
import {
  WalletBalanceResponse,
  ReservedAccountResponse,
} from '../monnify/monnify.types.js';
import { UsersService } from '../users/users.service.js';

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
    private readonly usersService: UsersService,
  ) {}

  async exists(userId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({ where: { userId } });
  }

  async createWallet(userId: string): Promise<WalletSnapshot> {
    const existing = await this.exists(userId);
    if (existing) {
      throw new BadRequestException('You already have a wallet');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const kyc = await this.kycRepository.findOne({ where: { userId } });
    if (!kyc?.bvn) {
      throw new BadRequestException(
        'Please provide your BVN so I can create a wallet for you',
      );
    }

    try {
      await this.createVirtualAccount(user, kyc);
      return this.getWallet(userId);
    } catch (error) {
      if (error instanceof MonnifyError) {
        if (
          error.responseCode === 'R42' ||
          error.message.includes('cannot reserve') ||
          error.message.includes('already reserved')
        ) {
          return this.recoverExistingAccount(user, kyc);
        }
        throw new BadRequestException(error.message);
      }
      throw error;
    }
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
        {
          accountNumber: this.configService.getOrThrow<string>(
            'MONNIFY_WALLET_ACCOUNT_NUMBER',
          ),
        },
      );
      const amount = balanceData?.amount;
      if (typeof amount === 'number' && !Number.isNaN(amount)) {
        monnifyBalance = String(amount);
      }
    } catch (error) {
      this.logger.warn(
        'Failed to fetch Monnify balance, using local cache',
        error as Error,
      );
    }

    const balanceKobo = monnifyBalance ?? wallet.balance;
    return {
      balanceKobo: typeof balanceKobo === 'string' ? balanceKobo : '0',
      accountNumber: wallet.accountNumber,
      bankName: wallet.bankName,
      accountName: null,
    };
  }

  async recoverExistingAccount(
    user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>,
    kyc: Kyc,
  ): Promise<WalletSnapshot> {
    this.logger.warn(
      `Monnify account already reserved for ${user.email} — attempting recovery`,
    );

    const ref = `sow-${user.email}`;

    try {
      const existing = await this.monnify.get<ReservedAccountResponse>(
        `/api/v2/bank-transfer/reserved-accounts/${encodeURIComponent(ref)}`,
      );
      const wallet = this.walletRepository.create({
        userId: user.id,
        walletName: `${user.firstName} ${user.lastName}'s Wallet`,
        accountReference: ref,
        accountNumber: existing.accounts[0].accountNumber,
        bankName: existing.accounts[0].bankName,
        currency: 'NGN',
        balance: '0',
      });
      await this.walletRepository.save(wallet);
      this.logger.log(`Recovered existing Monnify account for ${user.email}`);
      return this.getWallet(user.id);
    } catch {
      this.logger.warn(
        `Email-based ref not found on Monnify for ${user.email}`,
      );
    }

    const wallet = await this.walletRepository
      .createQueryBuilder('wallet')
      .innerJoinAndSelect('wallet.user', 'u')
      .where('u.email = :email', { email: user.email })
      .getOne();

    if (wallet) {
      wallet.userId = user.id;
      await this.walletRepository.save(wallet);
      this.logger.log(
        `Reassigned orphaned wallet to user ${user.id}`,
      );
      return this.getWallet(user.id);
    }

    throw new BadRequestException(
      'An account already exists for this email with Monnify. Contact support to release the old account, then try again.',
    );
  }

  async createVirtualAccount(
    user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>,
    kyc: Kyc,
  ): Promise<Wallet> {
    const responseBody = await this.monnify.post<ReservedAccountResponse>(
      '/api/v2/bank-transfer/reserved-accounts',
      {
        accountReference: `sow-${user.email}`,
        accountName: `Sow/${user.firstName} ${user.lastName}`,
        currencyCode: 'NGN',
        contractCode: this.configService.getOrThrow<string>(
          'MONNIFY_CONTRACT_CODE',
        ),
        customerEmail: user.email,
        customerName: `${user.firstName} ${user.lastName}`,
        bvn: kyc.bvn,
        getAllAvailableBanks: false,
        preferredBanks: ['035'],
      },
    );

    const account = responseBody.accounts[0];
    const accountReference = responseBody.accountReference;

    const existingWallet = await this.walletRepository.findOne({
      where: { accountReference },
    });
    if (existingWallet) {
      existingWallet.userId = user.id;
      return this.walletRepository.save(existingWallet);
    }

    const wallet = this.walletRepository.create({
      userId: user.id,
      walletName: `${user.firstName} ${user.lastName}'s Wallet`,
      accountReference,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      currency: 'NGN',
      balance: '0',
    });

    return this.walletRepository.save(wallet);
  }
}
