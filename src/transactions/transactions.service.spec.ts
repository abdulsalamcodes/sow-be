import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TransactionsService } from './transactions.service.js';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction } from '../entities/transaction.entity.js';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let walletRepository: Repository<Wallet>;
  let transactionRepository: Repository<Transaction>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Wallet), useClass: Repository },
        { provide: getRepositoryToken(Transaction), useClass: Repository },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
  });

  describe('listTransactions', () => {
    it('queries by userId and date range, returns mapped LedgerTransaction[]', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue({ id: 'wallet-1' } as Wallet);
      const now = new Date();
      jest.spyOn(transactionRepository, 'find').mockResolvedValue([
        {
          id: 'txn-1',
          walletId: 'wallet-1',
          type: 'DEBIT',
          category: 'TRANSFER',
          amount: '50000',
          fee: '0',
          narration: 'Test',
          status: 'SUCCESS',
          monnifyReference: 'monnify-ref',
          createdAt: now,
        } as Transaction,
      ]);

      const result = await service.listTransactions('user-1', {
        from: new Date('2026-01-01'),
        to: new Date('2026-12-31'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].amountKobo).toBe('50000');
      expect(result[0].monnifyReference).toBe('monnify-ref');
    });

    it('throws NotFoundException when wallet not found', async () => {
      jest.spyOn(walletRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.listTransactions('unknown-user', {
          from: new Date('2026-01-01'),
          to: new Date('2026-12-31'),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
