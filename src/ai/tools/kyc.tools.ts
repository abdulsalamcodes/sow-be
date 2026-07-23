import { z } from 'zod';
import type { KycService } from '../../kyc/kyc.service.js';
import type { ToolDefinition } from './types.js';

export const buildKycTools = (kycService: KycService): ToolDefinition[] => [
  {
    name: 'submit-kyc',
    description:
      'Submit the user BVN (and optionally NIN) for KYC verification. Required before creating a wallet.',
    inputSchema: z.object({
      bvn: z
        .string()
        .length(11)
        .describe('The 11-digit BVN (Bank Verification Number)'),
      nin: z
        .string()
        .length(11)
        .optional()
        .describe('Optional 11-digit NIN (National Identification Number)'),
    }),
    execute: async (userId: string, input: { bvn: string; nin?: string }) => {
      const kyc = await kycService.submitKyc(userId, {
        bvn: input.bvn,
        nin: input.nin,
      });
      return {
        status: kyc.verificationStatus,
        message:
          'Your BVN has been submitted. You can now create a wallet.',
      };
    },
  },
];
