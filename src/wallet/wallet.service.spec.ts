import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { WalletService } from './wallet.service.js';
import { Wallet } from '../entities/wallet.entity.js';
import { Kyc } from '../entities/kyc.entity.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: Repository<Wallet>;
  let monnify: MonnifyHttpClient;

  const mockConfig = {
    MONNIFY_CONTRACT_CODE: 'test-contract',
    MONNIFY_WALLET_ACCOUNT_NUMBER: '1234567890',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => mockConfig[key as keyof typeof mockConfig],
          },
        },
        {
          provide: MonnifyHttpClient,
          useValue: { get: jest.fn(), post: jest.fn() },
        },
        { provide: getRepositoryToken(Wallet), useClass: Repository },
        { provide: getRepositoryToken(Kyc), useClass: Repository },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    monnify = module.get<MonnifyHttpClient>(MonnifyHttpClient);
  });

  describe('getWallet', () => {
    it('returns WalletSnapshot with balance from DB', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balance: '500000',
        accountNumber: '7010000001',
        bankName: 'Wema Bank',
      } as Wallet);

      jest.spyOn(monnify, 'get').mockRejectedValue(new Error('Network error'));

      const result = await service.getWallet('user-1');

      expect(result.balanceKobo).toBe('500000');
      expect(result.accountNumber).toBe('7010000001');
    });

    it('throws NotFoundException when wallet not found', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getWallet('unknown-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createVirtualAccount', () => {
    it('calls Monnify and persists the wallet', async () => {
      const user = { id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com' };
      const kyc = { bvn: '12345678901' } as Kyc;

      jest.spyOn(monnify, 'post').mockResolvedValue({
        accountReference: 'sow-user-1',
        accounts: [
          { accountNumber: '7010000001', bankName: 'Wema Bank', accountName: 'Sow/Test User' },
        ],
      });

      jest.spyOn(walletRepository, 'create').mockReturnValue({} as Wallet);
      jest.spyOn(walletRepository, 'save').mockResolvedValue({
        id: 'wallet-1',
        accountNumber: '7010000001',
        balance: '0',
      } as Wallet);

      const result = await service.createVirtualAccount(user, kyc);

      expect(monnify.post).toHaveBeenCalledWith(
        '/api/v2/bank-transfer/reserved-accounts',
        expect.objectContaining({ accountReference: 'sow-user-1' }),
      );
      expect(result.accountNumber).toBe('7010000001');
    });
  });
});
