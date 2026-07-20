import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { IntentsService } from '../../intents/intents.service.js';
import { requireUserId } from './context.js';

const transferInputSchema = z
  .object({
    amountKobo: z.number().int().positive(),
    recipientName: z.string().optional(),
    accountNumber: z.string().length(10).optional(),
    bankCode: z.string().optional(),
    narration: z.string().max(100).optional(),
  })
  .refine(
    (input) => Boolean(input.recipientName) || Boolean(input.accountNumber && input.bankCode),
    { message: 'Provide a recipient name or both an account number and bank code' },
  );

export const buildTransferTools = (intentsService: IntentsService) => ({
  createTransferIntent: createTool({
    id: 'create-transfer-intent',
    description:
      'Prepare a money transfer for the user to confirm. This does NOT send money; ' +
      'it creates a pending request that the user must approve on a confirmation card.',
    inputSchema: transferInputSchema,
    execute: (input, context) =>
      intentsService.createTransferIntent(requireUserId(context), input),
  }),
});
