import { z } from 'zod';
import type { BanksServiceContract } from '../../contracts/financial-services.js';
import type { ToolDefinition } from './types.js';

export const buildBanksTools = (
  banksService: BanksServiceContract,
): ToolDefinition[] => [
  {
    name: 'list-banks',
    description:
      'Search Nigerian banks by name. Returns matching banks with their 3-digit bank codes.',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'Bank name to search for (e.g. "Wema", "GTBank", "Access"). Omit to list all banks.',
        ),
    }),
    execute: async (_userId: string, { query }) => {
      const allBanks = (await banksService.listBanks()) ?? [];
      if (!query) return { banks: allBanks };
      const q = String(query).toLowerCase();
      return {
        banks: allBanks.filter(
          (b) =>
            b.bankName.toLowerCase().includes(q) ||
            b.bankCode.includes(q),
        ),
      };
    },
  },
];
