import { z } from 'zod';
import type { WalletServiceContract } from '../../contracts/financial-services.js';
import type { ToolDefinition } from './types.js';

export const buildWalletTools = (
  walletService: WalletServiceContract,
): ToolDefinition[] => [
  {
    name: 'get-wallet-balance',
    description: "Get the user's current wallet balance.",
    inputSchema: z.object({}),
    execute: async (userId: string) => {
      const wallet = await walletService.getWallet(userId);
      return { balanceKobo: wallet.balanceKobo, currency: 'NGN' };
    },
  },
  {
    name: 'get-funding-details',
    description:
      'Get the virtual account details the user can pay into to fund their wallet.',
    inputSchema: z.object({}),
    execute: async (userId: string) => {
      const wallet = await walletService.getWallet(userId);
      return {
        accountNumber: wallet.accountNumber,
        bankName: wallet.bankName,
        accountName: wallet.accountName,
      };
    },
  },
];
