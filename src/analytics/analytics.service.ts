import { Inject, Injectable } from '@nestjs/common';
import {
  WALLET_SERVICE,
  TRANSACTIONS_SERVICE,
} from '../contracts/financial-services.js';
import type {
  WalletServiceContract,
  TransactionsServiceContract,
  LedgerTransaction,
} from '../contracts/financial-services.js';
import {
  SpendingPeriod,
  SpendingSummary,
  CategoryBreakdown,
  SpendingTrend,
  AffordabilityResult,
  BudgetAnalysis,
} from './analytics.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const PERIOD_DAYS: Record<SpendingPeriod, number> = { week: 7, month: 30 };
const TREND_WEEKS = 4;
const BUDGET_SPEND_RATIO = 0.9;

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(WALLET_SERVICE)
    private readonly walletService: WalletServiceContract,
    @Inject(TRANSACTIONS_SERVICE)
    private readonly transactionsService: TransactionsServiceContract,
  ) {}

  async getSpendingSummary(
    userId: string,
    period: SpendingPeriod,
  ): Promise<SpendingSummary> {
    const transactions = await this.loadSince(userId, PERIOD_DAYS[period]);
    const debits = this.debits(transactions);
    return {
      period,
      totalSpentKobo: this.sum(debits),
      totalReceivedKobo: this.sum(this.credits(transactions)),
      transactionCount: transactions.length,
      largestExpense: this.largestExpense(debits),
    };
  }

  async getSpendingByCategory(
    userId: string,
    period: SpendingPeriod,
  ): Promise<CategoryBreakdown> {
    const debits = this.debits(await this.loadSince(userId, PERIOD_DAYS[period]));
    return { period, categories: this.groupByCategory(debits) };
  }

  async getSpendingTrend(userId: string, weeks = TREND_WEEKS): Promise<SpendingTrend> {
    const transactions = await this.loadSince(userId, weeks * 7);
    const now = Date.now();
    const weekly = Array.from({ length: weeks }, (_, index) =>
      this.buildWeekBucket(transactions, now, weeks - 1 - index),
    );
    return { weekly };
  }

  async checkAffordability(
    userId: string,
    amountKobo: number,
  ): Promise<AffordabilityResult> {
    const [wallet, averageWeeklySpendKobo] = await Promise.all([
      this.walletService.getWallet(userId),
      this.averageWeeklySpend(userId),
    ]);
    const projectedRemainingKobo = wallet.balanceKobo - amountKobo;
    const affordable = projectedRemainingKobo >= averageWeeklySpendKobo;
    return {
      affordable,
      balanceKobo: wallet.balanceKobo,
      projectedRemainingKobo,
      averageWeeklySpendKobo,
      note: 'Affordable when the balance left after this purchase still covers one average week of spending.',
    };
  }

  async getBudgetAnalysis(userId: string): Promise<BudgetAnalysis> {
    const monthlyDebits = this.debits(await this.loadSince(userId, PERIOD_DAYS.month));
    const monthlySpendKobo = this.sum(monthlyDebits);
    const averageWeeklySpendKobo = await this.averageWeeklySpend(userId);
    const suggestedWeeklyBudgetKobo = Math.round(
      averageWeeklySpendKobo * BUDGET_SPEND_RATIO,
    );
    return {
      monthlySpendKobo,
      topCategories: this.groupByCategory(monthlyDebits).slice(0, 3),
      suggestedWeeklyBudgetKobo,
      insight:
        'Suggested weekly budget is 10% below your recent average weekly spending.',
    };
  }

  private async loadSince(userId: string, days: number): Promise<LedgerTransaction[]> {
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    const transactions = await this.transactionsService.listTransactions(userId, {
      from,
      to,
    });
    return transactions.filter((transaction) => transaction.status === 'SUCCESS');
  }

  private async averageWeeklySpend(userId: string): Promise<number> {
    const totalSpent = this.sum(
      this.debits(await this.loadSince(userId, TREND_WEEKS * 7)),
    );
    return Math.round(totalSpent / TREND_WEEKS);
  }

  private debits(transactions: LedgerTransaction[]): LedgerTransaction[] {
    return transactions.filter((transaction) => transaction.type === 'DEBIT');
  }

  private credits(transactions: LedgerTransaction[]): LedgerTransaction[] {
    return transactions.filter((transaction) => transaction.type === 'CREDIT');
  }

  private sum(transactions: LedgerTransaction[]): number {
    return transactions.reduce((total, transaction) => total + transaction.amountKobo, 0);
  }

  private largestExpense(
    debits: LedgerTransaction[],
  ): { amountKobo: number; narration: string } | null {
    if (debits.length === 0) {
      return null;
    }
    const largest = debits.reduce((max, transaction) =>
      transaction.amountKobo > max.amountKobo ? transaction : max,
    );
    return {
      amountKobo: largest.amountKobo,
      narration: largest.narration ?? largest.category,
    };
  }

  private groupByCategory(
    debits: LedgerTransaction[],
  ): Array<{ category: string; totalKobo: number; percentage: number }> {
    const totalSpent = this.sum(debits);
    const totalsByCategory = new Map<string, number>();
    for (const debit of debits) {
      totalsByCategory.set(
        debit.category,
        (totalsByCategory.get(debit.category) ?? 0) + debit.amountKobo,
      );
    }
    return [...totalsByCategory.entries()]
      .map(([category, totalKobo]) => ({
        category,
        totalKobo,
        percentage: this.percentage(totalKobo, totalSpent),
      }))
      .sort((first, second) => second.totalKobo - first.totalKobo);
  }

  private buildWeekBucket(
    transactions: LedgerTransaction[],
    now: number,
    weeksAgo: number,
  ): { weekStart: string; totalSpentKobo: number } {
    const end = now - weeksAgo * WEEK_MS;
    const start = end - WEEK_MS;
    const withinWeek = this.debits(transactions).filter((transaction) => {
      const time = transaction.createdAt.getTime();
      return time >= start && time < end;
    });
    return {
      weekStart: new Date(start).toISOString(),
      totalSpentKobo: this.sum(withinWeek),
    };
  }

  private percentage(part: number, whole: number): number {
    if (whole === 0) {
      return 0;
    }
    return Math.round((part / whole) * 1000) / 10;
  }
}
