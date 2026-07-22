import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WebhooksService } from './webhooks.service.js';
import { TransactionStatus } from '../../entities/transaction.entity.js';

const SECRET_KEY = 'test-secret';

const buildService = () => {
  const walletRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const transactionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((data) => data),
  };
  const billRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const service = new WebhooksService(
    { getOrThrow: () => SECRET_KEY } as never,
    walletRepository as never,
    transactionRepository as never,
    billRepository as never,
  );
  return { service, walletRepository, transactionRepository, billRepository };
};

describe('WebhooksService', () => {
  describe('verifySignature', () => {
    it('passes with correct HMAC', () => {
      const { service } = buildService();
      const rawBody = Buffer.from('{"eventType":"RESERVED_ACCOUNT_TRANSACTION"}');
      const hmac = createHmac('sha512', SECRET_KEY);
      hmac.update(rawBody);
      const signature = `sha512=${hmac.digest('hex')}`;

      expect(() => service.verifySignature(rawBody, signature)).not.toThrow();
    });

    it('rejects tampered payload', () => {
      const { service } = buildService();
      const rawBody = Buffer.from('{"eventType":"RESERVED_ACCOUNT_TRANSACTION"}');
      const hmac = createHmac('sha512', 'wrong-secret');
      hmac.update(rawBody);
      const signature = `sha512=${hmac.digest('hex')}`;

      expect(() => service.verifySignature(rawBody, signature)).toThrow(UnauthorizedException);
    });

    it('rejects wrong-length signature', () => {
      const { service } = buildService();
      const rawBody = Buffer.from('{"test":"data"}');
      expect(() => service.verifySignature(rawBody, 'too-short')).toThrow(UnauthorizedException);
    });
  });

  describe('handleIncomingTransfer', () => {
    it('creates transaction and credits wallet', async () => {
      const { service, walletRepository, transactionRepository } = buildService();
      const wallet = { id: 'wallet-1', accountNumber: '7010000001', balance: '100000' };

      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue(wallet);
      transactionRepository.save.mockResolvedValue({ id: 'txn-1' });
      walletRepository.update.mockResolvedValue({ affected: 1 });

      await service['handleIncomingTransfer']({
        transactionReference: 'monnify-ref-1',
        paymentReference: 'pay-ref',
        amountPaid: 50000,
        totalAmountPaid: 50000,
        settlementAmount: 50000,
        paidOn: '2026-07-21',
        paymentStatus: 'PAID',
        currency: 'NGN',
        paymentMethod: 'CARD',
        accountNumber: '7010000001',
        bankCode: '035',
        bankName: 'Wema Bank',
        customer: { email: 'test@test.com', name: 'Test User' },
      });

      expect(walletRepository.update).toHaveBeenCalledWith(
        { id: 'wallet-1' },
        expect.objectContaining({ balance: expect.any(Function) }),
      );
      const balanceFn = (walletRepository.update as jest.Mock).mock.calls[0][1].balance;
      expect(balanceFn()).toBe('balance + 50000');
    });

    it('skips duplicate monnifyReference idempotently', async () => {
      const { service, walletRepository, transactionRepository } = buildService();

      transactionRepository.findOne.mockResolvedValue({ id: 'existing' });
      walletRepository.findOne.mockClear();

      await service['handleIncomingTransfer']({
        transactionReference: 'duplicate-ref',
        paymentReference: 'pay-ref',
        amountPaid: 50000,
        totalAmountPaid: 50000,
        settlementAmount: 50000,
        paidOn: '2026-07-21',
        paymentStatus: 'PAID',
        currency: 'NGN',
        paymentMethod: 'CARD',
        accountNumber: '7010000001',
        bankCode: '035',
        bankName: 'Wema Bank',
        customer: { email: 'test@test.com', name: 'Test User' },
      });

      expect(walletRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
