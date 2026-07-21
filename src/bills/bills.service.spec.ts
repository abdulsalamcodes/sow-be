import { BillsService } from './bills.service.js';
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
  const billRepository = {
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
  const service = new BillsService(
    walletRepository as never,
    transactionRepository as never,
    billRepository as never,
    monnify as never,
    configService as never,
  );
  return { service, walletRepository, transactionRepository, billRepository, monnify };
};

describe('BillsService', () => {
  describe('listCategories', () => {
    it('calls Monnify and maps response', async () => {
      const { service, monnify } = buildService();
      monnify.get.mockResolvedValue([
        { categoryCode: 'airtime', categoryName: 'Airtime' },
        { categoryCode: 'tv', categoryName: 'Cable TV' },
      ]);

      const result = await service.listCategories();

      expect(result).toHaveLength(2);
      expect(result[0].categoryCode).toBe('airtime');
    });
  });

  describe('listBillers', () => {
    it('passes optional categoryCode', async () => {
      const { service, monnify } = buildService();
      monnify.get.mockResolvedValue([
        { billerCode: 'MTN', billerName: 'MTN Nigeria', categoryCode: 'airtime' },
      ]);

      const result = await service.listBillers('airtime');

      expect(monnify.get).toHaveBeenCalledWith(
        '/api/v1/vas/bills-payment/billers',
        { categoryCode: 'airtime' },
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getBillerProducts', () => {
    it('returns products with amounts in kobo', async () => {
      const { service, monnify } = buildService();
      monnify.get.mockResolvedValue([
        { productCode: 'mtn-100', productName: '₦100 Airtime', amount: 10000, fixedPrice: true },
      ]);

      const result = await service.getBillerProducts('MTN');

      expect(result[0].amount).toBe(10000);
    });
  });

  describe('validateCustomer', () => {
    it('returns valid=true on success', async () => {
      const { service, monnify } = buildService();
      monnify.post.mockResolvedValue({
        responseBody: { customerName: 'Test Customer', validationReference: 'val-ref-1' },
      });

      const result = await service.validateCustomer('mtn-100', '08012345678');

      expect(result.valid).toBe(true);
      expect(result.name).toBe('Test Customer');
    });

    it('returns valid=false on error', async () => {
      const { service, monnify } = buildService();
      monnify.post.mockRejectedValue(new MonnifyError('Validation failed'));

      const result = await service.validateCustomer('mtn-100', '08000000000');

      expect(result.valid).toBe(false);
    });
  });

  describe('executeBillPayment', () => {
    const request = {
      userId: 'user-1',
      productCode: 'mtn-100',
      customerId: '08012345678',
      amountKobo: 10000,
      reference: 'bill-ref-1',
      provider: 'MTN',
      billType: 'AIRTIME',
    };

    it('debits wallet, calls vend, creates Transaction and Bill', async () => {
      const { service, walletRepository, monnify, transactionRepository, billRepository } = buildService();

      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '50000' });
      monnify.get.mockResolvedValue({ amount: 50000 });
      walletRepository.update.mockResolvedValue({ affected: 1 });
      monnify.post.mockResolvedValue({
        transactionReference: 'monnify-txn',
        reference: 'bill-ref-1',
        status: 'SUCCESS',
        amount: 10000,
        fee: 0,
      });
      transactionRepository.save.mockResolvedValue({ id: 'txn-1' });
      billRepository.save.mockResolvedValue({});

      const result = await service.executeBillPayment(request);

      expect(result.status).toBe('SUCCESS');
      expect(walletRepository.update).toHaveBeenCalledWith(
        { id: 'wallet-1' },
        expect.objectContaining({ balance: expect.any(Function) }),
      );
      const balanceFn = (walletRepository.update as jest.Mock).mock.calls[0][1].balance;
      expect(balanceFn()).toBe('balance - 10000');
    });

    it('returns FAILED when balance insufficient', async () => {
      const { service, walletRepository, monnify } = buildService();
      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '5000' });
      monnify.get.mockResolvedValue({ amount: 5000 });

      const result = await service.executeBillPayment(request);

      expect(result.status).toBe('FAILED');
      expect(result.failureReason).toBe('Insufficient balance');
    });

    it('reverses debit on vend error', async () => {
      const { service, walletRepository, monnify } = buildService();
      walletRepository.findOne.mockResolvedValue({ id: 'wallet-1', balance: '50000' });
      monnify.get.mockResolvedValue({ amount: 50000 });
      walletRepository.update.mockResolvedValue({ affected: 1 });
      monnify.post.mockRejectedValue(new MonnifyError('Vend failed'));

      const result = await service.executeBillPayment(request);

      expect(result.status).toBe('FAILED');
      const updateCalls = (walletRepository.update as jest.Mock).mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];
      expect(lastCall[0]).toEqual({ id: 'wallet-1' });
      expect(lastCall[1].balance()).toBe('balance + 10000');
    });
  });
});
