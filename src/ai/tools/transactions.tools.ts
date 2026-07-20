import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { TransactionsServiceContract } from '../../contracts/financial-services.js';
import { requireUserId } from './context.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETURNED = 50;

export const buildTransactionsTools = (
  transactionsService: TransactionsServiceContract,
) => ({
  getTransactions: createTool({
    id: 'get-transactions',
    description: 'List the most recent wallet transactions within a number of days.',
    inputSchema: z.object({
      days: z.number().int().min(1).max(90).default(30),
    }),
    execute: async (input, context) => {
      const to = new Date();
      const from = new Date(to.getTime() - input.days * DAY_MS);
      const transactions = await transactionsService.listTransactions(
        requireUserId(context),
        { from, to },
      );
      const newestFirst = [...transactions].sort(
        (first, second) => second.createdAt.getTime() - first.createdAt.getTime(),
      );
      return { transactions: newestFirst.slice(0, MAX_RETURNED) };
    },
  }),
});
