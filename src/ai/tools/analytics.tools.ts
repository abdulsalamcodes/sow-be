import { z } from 'zod';
import type { AnalyticsService } from '../../analytics/analytics.service.js';
import type { ToolDefinition } from './types.js';

const periodSchema = z.object({
  period: z.enum(['week', 'month']),
});

export const buildAnalyticsTools = (
  analyticsService: AnalyticsService,
): ToolDefinition[] => [
  {
    name: 'get-spending-summary',
    description:
      'Summarise how much the user spent and received over a week or month.',
    inputSchema: periodSchema,
    execute: async (userId: string, { period }) => {
      const result = await analyticsService.getSpendingSummary(
        userId,
        period as 'week' | 'month',
      );
      return result as unknown as Record<string, unknown>;
    },
  },
  {
    name: 'get-spending-by-category',
    description:
      'Break the user spending down by category over a week or month.',
    inputSchema: periodSchema,
    execute: async (userId: string, { period }) => {
      const result = await analyticsService.getSpendingByCategory(
        userId,
        period as 'week' | 'month',
      );
      return result as unknown as Record<string, unknown>;
    },
  },
  {
    name: 'check-affordability',
    description:
      'Check whether the user can afford a purchase of a given amount.',
    inputSchema: z.object({ amountKobo: z.number().int().positive() }),
    execute: async (userId: string, { amountKobo }) => {
      const result = await analyticsService.checkAffordability(
        userId,
        Number(amountKobo),
      );
      return result as unknown as Record<string, unknown>;
    },
  },
  {
    name: 'get-budget-analysis',
    description: 'Analyse spending and suggest a weekly budget for the user.',
    inputSchema: z.object({}),
    execute: async (userId: string) => {
      const result = await analyticsService.getBudgetAnalysis(userId);
      return result as unknown as Record<string, unknown>;
    },
  },
];
