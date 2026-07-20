export type SpendingPeriod = 'week' | 'month';

export interface SpendingSummary {
  period: SpendingPeriod;
  totalSpentKobo: number;
  totalReceivedKobo: number;
  transactionCount: number;
  largestExpense: { amountKobo: number; narration: string } | null;
}

export interface CategoryBreakdown {
  period: SpendingPeriod;
  categories: Array<{ category: string; totalKobo: number; percentage: number }>;
}

export interface SpendingTrend {
  weekly: Array<{ weekStart: string; totalSpentKobo: number }>;
}

export interface AffordabilityResult {
  affordable: boolean;
  balanceKobo: number;
  projectedRemainingKobo: number;
  averageWeeklySpendKobo: number;
  note: string;
}

export interface BudgetAnalysis {
  monthlySpendKobo: number;
  topCategories: Array<{ category: string; totalKobo: number; percentage: number }>;
  suggestedWeeklyBudgetKobo: number;
  insight: string;
}
