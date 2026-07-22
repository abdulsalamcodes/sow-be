import { PaymentsService } from './payments.service.js';
import { MonnifyError } from '../monnify/monnify-error.js';

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
  const monnify = {
    get: jest.fn(),
    post: jest.fn(),
  };
  const configService = {
    getOrThrow: () => '1234567890',
  };
  const service = new PaymentsService(
    walletRepository as never,
    transactionRepository as never,
    monnify as never,
    configService as never,
  );
  return { service, walletRepository, transactionRepository, monnify };
};

describe('PaymentsService', () => {
  const request = {
    userId: 'user-1',
    amountKobo: 50000,
    narration: 'Test transfer',
    idempotencyKey: 'idem-1',
    destinationBankCode: '058',
    destinationAccountNumber: '0123456789',
  };

  describe('executeTransfer', () => {
    it('debits wallet, calls Monnify, returns PENDING', async () => {
      const { service, walletRepository, transactionRepository, monnify } = buildService();

      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '200000' });
      monnify.get.mockResolvedValue({ amount: 200000 });
      walletRepository.update.mockResolvedValue({ affected: 1 });
      monnify.post.mockResolvedValue({ reference: 'monnify-ref-1' });
      transactionRepository.save.mockResolvedValue({ id: 'txn-1' });

      const result = await service.executeTransfer(request);

      expect(result.status).toBe('PENDING');
      expect(result.reference).toBe('monnify-ref-1');
      expect(walletRepository.update).toHaveBeenCalledWith(
        { id: 'wallet-1' },
        expect.objectContaining({ balance: expect.any(Function) }),
      );
      const balanceFn = (walletRepository.update as jest.Mock).mock.calls[0][1].balance;
      expect(balanceFn()).toBe('balance - 50000');
    });

    it('returns FAILED when wallet not found', async () => {
      const { service, walletRepository } = buildService();
      walletRepository.findOne.mockResolvedValue(null);

      const result = await service.executeTransfer(request);

      expect(result.status).toBe('FAILED');
      expect(result.failureReason).toBe('Wallet not found');
    });

    it('returns FAILED when Monnify balance insufficient', async () => {
      const { service, walletRepository, monnify } = buildService();
      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '200000' });
      monnify.get.mockResolvedValue({ amount: 40000 });

      const result = await service.executeTransfer(request);

      expect(result.status).toBe('FAILED');
      expect(result.failureReason).toBe('Insufficient balance');
    });

    it('reverses debit on Monnify error', async () => {
      const { service, walletRepository, monnify } = buildService();
      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '200000' });
      monnify.get.mockResolvedValue({ amount: 200000 });
      walletRepository.update.mockResolvedValue({ affected: 1 });
      monnify.post.mockRejectedValue(new MonnifyError('Monnify unavailable'));

      const result = await service.executeTransfer(request);

      expect(result.status).toBe('FAILED');
      const updateCalls = (walletRepository.update as jest.Mock).mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];
      expect(lastCall[0]).toEqual({ id: 'wallet-1' });
      expect(lastCall[1].balance()).toBe('balance + 50000');
    });

    it('handles OTP flow when otpData is present', async () => {
      const { service, walletRepository, monnify, transactionRepository } = buildService();
      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '200000' });
      monnify.get.mockResolvedValue({ amount: 200000 });
      walletRepository.update.mockResolvedValue({ affected: 1 });
      monnify.post.mockResolvedValue({
        reference: 'monnify-ref-1',
        status: 'PENDING',
        otpData: { otpReference: 'otp-ref-1', transactionReference: 'txn-ref-1' },
      });
      transactionRepository.save.mockResolvedValue({ id: 'txn-1' });

      const result = await service.executeTransfer(request);

      expect(result.otpRequired).toBe(true);
      expect(result.otpReference).toBe('otp-ref-1');
    });
  });
});
