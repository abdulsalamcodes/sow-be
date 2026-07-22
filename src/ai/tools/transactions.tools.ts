import { z } from 'zod';
import type { TransactionsServiceContract } from '../../contracts/financial-services.js';
import type { ToolDefinition } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETURNED = 50;

export const buildTransactionsTools = (
  transactionsService: TransactionsServiceContract,
): ToolDefinition[] => [
  {
    name: 'get-transactions',
    description:
      'List the most recent wallet transactions within a number of days.',
    inputSchema: z.object({
      days: z.number().int().min(1).max(90).default(30),
    }),
    execute: async (userId: string, { days }) => {
      const to = new Date();
      const from = new Date(to.getTime() - Number(days) * DAY_MS);
      const transactions = await transactionsService.listTransactions(userId, {
        from,
        to,
      });
      const newestFirst = [...transactions].sort(
        (first, second) =>
          second.createdAt.getTime() - first.createdAt.getTime(),
      );
      return { transactions: newestFirst.slice(0, MAX_RETURNED) };
    },
  },
];
