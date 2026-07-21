import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { IntentsService } from './intents.service.js';
import {
  TransactionIntent,
  IntentStatus,
} from '../entities/transaction-intent.entity.js';
import type {
  BanksServiceContract,
  PaymentsServiceContract,
  ResolvedAccount,
  TransferResult,
} from '../contracts/financial-services.js';

const RECIPIENT: ResolvedAccount = {
  accountNumber: '0123456789',
  accountName: 'AISHA BELLO',
  bankCode: '058',
  bankName: 'GTBank',
};

const buildIntent = (
  overrides: Partial<TransactionIntent> = {},
): TransactionIntent =>
  ({
    id: 'intent-1',
    userId: 'user-1',
    status: IntentStatus.PENDING,
    amountKobo: '500000',
    idempotencyKey: 'key-1',
    expiresAt: new Date(Date.now() + 60_000),
    payload: {
      destinationAccountNumber: RECIPIENT.accountNumber,
      destinationBankCode: RECIPIENT.bankCode,
      destinationBankName: RECIPIENT.bankName,
      accountName: RECIPIENT.accountName,
      narration: 'Sow transfer',
    },
    ...overrides,
  }) as TransactionIntent;

const buildRepository = (stored: TransactionIntent | null) => {
  const save = jest.fn((value: TransactionIntent) => Promise.resolve(value));
  const repository = {
    create: (value: Partial<TransactionIntent>) => value as TransactionIntent,
    save,
    findOne: jest.fn(() => Promise.resolve(stored)),
  };
  return {
    repository: repository as unknown as Repository<TransactionIntent>,
    save,
  };
};

const buildBanks = (
  beneficiary: ResolvedAccount | null,
): BanksServiceContract => ({
  resolveAccountName: () => Promise.resolve(RECIPIENT),
  findBeneficiaryByName: () => Promise.resolve(beneficiary),
});

const buildPayments = (
  result: TransferResult,
): PaymentsServiceContract & {
  executeTransfer: jest.Mock;
} => ({
  executeTransfer: jest.fn(() => Promise.resolve(result)),
});

describe('IntentsService', () => {
  describe('createTransferIntent', () => {
    it('resolves a beneficiary by name and creates a pending intent', async () => {
      const { repository } = buildRepository(null);
      const service = new IntentsService(
        repository,
        buildBanks(RECIPIENT),
        buildPayments({ reference: 'r', status: 'SUCCESS' }),
      );

      const view = await service.createTransferIntent('user-1', {
        amountKobo: 500_000,
        recipientName: 'Aisha',
      });

      expect(view.recipientAccountName).toBe('AISHA BELLO');
      expect(view.summary).toContain('AISHA BELLO');
    });

    it('throws when the beneficiary cannot be resolved', async () => {
      const { repository } = buildRepository(null);
      const service = new IntentsService(
        repository,
        buildBanks(null),
        buildPayments({ reference: 'r', status: 'SUCCESS' }),
      );

      await expect(
        service.createTransferIntent('user-1', {
          amountKobo: 500_000,
          recipientName: 'Ghost',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('confirm', () => {
    it('executes the transfer once with the stored idempotency key', async () => {
      const { repository } = buildRepository(buildIntent());
      const payments = buildPayments({
        reference: 'ref-99',
        status: 'SUCCESS',
      });
      const service = new IntentsService(
        repository,
        buildBanks(RECIPIENT),
        payments,
      );

      const result = await service.confirm('user-1', 'intent-1');

      expect(result).toEqual({ status: 'EXECUTED', reference: 'ref-99' });
      expect(payments.executeTransfer).toHaveBeenCalledTimes(1);
      expect(payments.executeTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'key-1',
          amountKobo: 500_000,
        }),
      );
    });

    it('rejects confirming an already-executed intent', async () => {
      const { repository } = buildRepository(
        buildIntent({ status: IntentStatus.EXECUTED }),
      );
      const service = new IntentsService(
        repository,
        buildBanks(RECIPIENT),
        buildPayments({ reference: 'r', status: 'SUCCESS' }),
      );

      await expect(
        service.confirm('user-1', 'intent-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('expires a pending intent that is past its expiry', async () => {
      const { repository } = buildRepository(
        buildIntent({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const service = new IntentsService(
        repository,
        buildBanks(RECIPIENT),
        buildPayments({ reference: 'r', status: 'SUCCESS' }),
      );

      await expect(
        service.confirm('user-1', 'intent-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hides intents owned by another user', async () => {
      const { repository } = buildRepository(
        buildIntent({ userId: 'someone-else' }),
      );
      const service = new IntentsService(
        repository,
        buildBanks(RECIPIENT),
        buildPayments({ reference: 'r', status: 'SUCCESS' }),
      );

      await expect(
        service.confirm('user-1', 'intent-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks the intent failed when the transfer fails', async () => {
      const { repository } = buildRepository(buildIntent());
      const service = new IntentsService(
        repository,
        buildBanks(RECIPIENT),
        buildPayments({
          reference: '',
          status: 'FAILED',
          failureReason: 'insufficient funds',
        }),
      );

      const result = await service.confirm('user-1', 'intent-1');

      expect(result).toEqual({
        status: 'FAILED',
        failureReason: 'insufficient funds',
      });
    });
  });
});
