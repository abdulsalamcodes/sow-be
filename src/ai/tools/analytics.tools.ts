import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AnalyticsService } from '../../analytics/analytics.service.js';
import { requireUserId } from './context.js';

const periodSchema = z.object({ period: z.enum(['week', 'month']) });

export const buildAnalyticsTools = (analyticsService: AnalyticsService) => ({
  getSpendingSummary: createTool({
    id: 'get-spending-summary',
    description: 'Summarise how much the user spent and received over a week or month.',
    inputSchema: periodSchema,
    execute: (input, context) =>
      analyticsService.getSpendingSummary(requireUserId(context), input.period),
  }),

  getSpendingByCategory: createTool({
    id: 'get-spending-by-category',
    description: 'Break the user spending down by category over a week or month.',
    inputSchema: periodSchema,
    execute: (input, context) =>
      analyticsService.getSpendingByCategory(requireUserId(context), input.period),
  }),

  checkAffordability: createTool({
    id: 'check-affordability',
    description: 'Check whether the user can afford a purchase of a given amount.',
    inputSchema: z.object({ amountKobo: z.number().int().positive() }),
    execute: (input, context) =>
      analyticsService.checkAffordability(requireUserId(context), input.amountKobo),
  }),

  getBudgetAnalysis: createTool({
    id: 'get-budget-analysis',
    description: 'Analyse spending and suggest a weekly budget for the user.',
    inputSchema: z.object({}),
    execute: (_input, context) =>
      analyticsService.getBudgetAnalysis(requireUserId(context)),
  }),
});
