import { z } from 'zod';
import type { IntentsService } from '../../intents/intents.service.js';
import type { CreateTransferIntentInput } from '../../intents/intents.types.js';
import type { ToolDefinition } from './types.js';

export const buildTransferTools = (
  intentsService: IntentsService,
): ToolDefinition[] => [
  {
    name: 'create-transfer-intent',
    description:
      'Prepare a money transfer for the user to confirm. Does NOT send money; ' +
      'creates a pending request the user approves on a confirmation card. ' +
      'Provide amountKobo + (accountNumber + bankCode) OR amountKobo + recipientName. ' +
      'Do NOT ask for a name when accountNumber and bankCode are already known — the account name is resolved automatically.',
    inputSchema: z
      .object({
        amountKobo: z.number().int().positive(),
        recipientName: z.string().optional(),
        accountNumber: z.string().length(10).optional(),
        bankCode: z.string().optional(),
        narration: z.string().max(100).optional(),
      })
      .refine(
        (input) =>
          Boolean(input.recipientName) ||
          Boolean(input.accountNumber && input.bankCode),
        {
          message:
            'Provide a recipient name or both an account number and bank code',
        },
      ),
    execute: async (userId: string, input) => {
      const result = await intentsService.createTransferIntent(
        userId,
        input as unknown as CreateTransferIntentInput,
      );
      return result as unknown as Record<string, unknown>;
    },
  },
];
