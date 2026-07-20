import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { WalletServiceContract } from '../../contracts/financial-services.js';
import { requireUserId } from './context.js';

export const buildWalletTools = (walletService: WalletServiceContract) => ({
  getWalletBalance: createTool({
    id: 'get-wallet-balance',
    description: "Get the user's current wallet balance.",
    inputSchema: z.object({}),
    execute: async (_input, context) => {
      const wallet = await walletService.getWallet(requireUserId(context));
      return { balanceKobo: wallet.balanceKobo, currency: 'NGN' };
    },
  }),

  getFundingDetails: createTool({
    id: 'get-funding-details',
    description:
      'Get the virtual account details the user can pay into to fund their wallet.',
    inputSchema: z.object({}),
    execute: async (_input, context) => {
      const wallet = await walletService.getWallet(requireUserId(context));
      return {
        accountNumber: wallet.accountNumber,
        bankName: wallet.bankName,
        accountName: wallet.accountName,
      };
    },
  }),
});
