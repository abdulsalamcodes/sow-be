import { AnalyticsService } from './analytics.service.js';
import {
  WalletServiceContract,
  TransactionsServiceContract,
  LedgerTransaction,
} from '../contracts/financial-services.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const buildTransaction = (
  overrides: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'amountKobo' | 'type' | 'category'>,
): LedgerTransaction => ({
  id: overrides.id ?? 'txn',
  narration: overrides.narration ?? null,
  feeKobo: overrides.feeKobo ?? '0',
  status: overrides.status ?? 'SUCCESS',
  createdAt: overrides.createdAt ?? new Date(),
  amountKobo: overrides.amountKobo,
  monnifyReference: overrides.monnifyReference ?? null,
  type: overrides.type,
  category: overrides.category,
});

const buildService = (
  transactions: LedgerTransaction[],
  balanceKobo = '0',
): AnalyticsService => {
  const walletService: WalletServiceContract = {
    getWallet: () =>
      Promise.resolve({
        balanceKobo,
        accountNumber: '0000000000',
        bankName: 'Test Bank',
        accountName: 'Test User',
      }),
  };
  const transactionsService: TransactionsServiceContract = {
    listTransactions: () => Promise.resolve(transactions),
  };
  return new AnalyticsService(walletService, transactionsService);
};

describe('AnalyticsService', () => {
  const userId = 'user-1';

  describe('getSpendingSummary', () => {
    it('sums debits and credits and finds the largest expense', async () => {
      const service = buildService([
        buildTransaction({ amountKobo: '300000', type: 'DEBIT', category: 'TRANSFER', narration: 'Rent' }),
        buildTransaction({ amountKobo: '200000', type: 'DEBIT', category: 'BILL_PAYMENT' }),
        buildTransaction({ amountKobo: '500000', type: 'CREDIT', category: 'FUNDING' }),
      ]);

      const summary = await service.getSpendingSummary(userId, 'week');

      expect(summary.totalSpentKobo).toBe(500_000);
      expect(summary.totalReceivedKobo).toBe(500_000);
      expect(summary.transactionCount).toBe(3);
      expect(summary.largestExpense).toEqual({ amountKobo: 300_000, narration: 'Rent' });
    });

    it('returns a null largest expense when nothing was spent', async () => {
      const service = buildService([
        buildTransaction({ amountKobo: '500000', type: 'CREDIT', category: 'FUNDING' }),
      ]);

      const summary = await service.getSpendingSummary(userId, 'month');

      expect(summary.totalSpentKobo).toBe(0);
      expect(summary.largestExpense).toBeNull();
    });

    it('ignores non-successful transactions', async () => {
      const service = buildService([
        buildTransaction({ amountKobo: '100000', type: 'DEBIT', category: 'TRANSFER', status: 'FAILED' }),
        buildTransaction({ amountKobo: '200000', type: 'DEBIT', category: 'TRANSFER', status: 'SUCCESS' }),
      ]);

      const summary = await service.getSpendingSummary(userId, 'week');

      expect(summary.totalSpentKobo).toBe(200_000);
      expect(summary.transactionCount).toBe(1);
    });
  });

  describe('getSpendingByCategory', () => {
    it('groups debits by category with percentages that sum to 100', async () => {
      const service = buildService([
        buildTransaction({ amountKobo: '600000', type: 'DEBIT', category: 'TRANSFER' }),
        buildTransaction({ amountKobo: '400000', type: 'DEBIT', category: 'BILL_PAYMENT' }),
      ]);

      const breakdown = await service.getSpendingByCategory(userId, 'month');

      expect(breakdown.categories[0]).toEqual({ category: 'TRANSFER', totalKobo: 600_000, percentage: 60 });
      expect(breakdown.categories[1]).toEqual({ category: 'BILL_PAYMENT', totalKobo: 400_000, percentage: 40 });
      const totalPercentage = breakdown.categories.reduce((sum, item) => sum + item.percentage, 0);
      expect(totalPercentage).toBe(100);
    });
  });

  describe('checkAffordability', () => {
    // Four weeks of debits totalling 400,000 kobo => average weekly spend 100,000.
    const fourWeekDebits = [
      buildTransaction({ amountKobo: '400000', type: 'DEBIT', category: 'TRANSFER' }),
    ];

    it('is affordable when the remaining balance exactly covers one average week', async () => {
      const service = buildService(fourWeekDebits, '1000000');

      const result = await service.checkAffordability(userId, 900_000);

      expect(result.averageWeeklySpendKobo).toBe(100_000);
      expect(result.projectedRemainingKobo).toBe(100_000);
      expect(result.affordable).toBe(true);
    });

    it('is not affordable when short by one kobo', async () => {
      const service = buildService(fourWeekDebits, '1000000');

      const result = await service.checkAffordability(userId, 900_001);

      expect(result.projectedRemainingKobo).toBe(99_999);
      expect(result.affordable).toBe(false);
    });
  });

  describe('getSpendingTrend', () => {
    it('buckets debits into weekly windows oldest-first', async () => {
      const now = Date.now();
      const service = buildService([
        buildTransaction({ amountKobo: '100000', type: 'DEBIT', category: 'TRANSFER', createdAt: new Date(now - 2 * DAY_MS) }),
        buildTransaction({ amountKobo: '250000', type: 'DEBIT', category: 'TRANSFER', createdAt: new Date(now - 9 * DAY_MS) }),
      ]);

      const trend = await service.getSpendingTrend(userId, 4);

      expect(trend.weekly).toHaveLength(4);
      expect(trend.weekly[3].totalSpentKobo).toBe(100_000);
      expect(trend.weekly[2].totalSpentKobo).toBe(250_000);
    });
  });
});
