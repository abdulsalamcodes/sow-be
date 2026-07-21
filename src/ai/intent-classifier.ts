import { z } from 'zod';
import type { LmlClient, LmlToolDefinition } from './llm-client.js';

export const INTENT_VALUES = [
  'check_balance',
  'send_money',
  'confirm_transfer',
  'cancel_transfer',
  'list_banks',
  'help',
  'general_chat',
] as const;

export type IntentType = (typeof INTENT_VALUES)[number];

export interface ClassifiedIntent {
  type: IntentType;
  confidence: number;
  amountKobo?: number;
  accountNumber?: string;
  bankName?: string;
  beneficiaryName?: string;
}

const CLASSIFIER_INSTRUCTION = `Determine the user's intent from their message.

Intents:
- check_balance: user asks about wallet balance, account balance, how much money they have
- send_money: user wants to send/transfer money to someone
- confirm_transfer: user confirms a pending transfer (yes, confirm, proceed, ok, do it)
- cancel_transfer: user cancels a pending action (no, cancel, stop, abort, never mind)
- list_banks: user asks about linked banks or bank list
- help: user explicitly says "help" or "commands"
- general_chat: anything else that does not match the above

For send_money, extract amount, accountNumber, bankName, or beneficiaryName if mentioned. When a field has no value, omit it entirely — never set it to null.`;

const INTENT_CLASSIFIER_TOOL: LmlToolDefinition = {
  type: 'function',
  function: {
    name: 'classify_intent',
    description: 'Classify the user message into one of the known intents.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [...INTENT_VALUES],
        },
        confidence: {
          type: 'number',
          description: 'Confidence score between 0 and 1',
        },
        amountKobo: {
          type: ['number', 'null'],
          description: 'For send_money: the amount in kobo (naira * 100)',
        },
        accountNumber: {
          type: ['string', 'null'],
          description: 'For send_money: the recipient account number (10 digits)',
        },
        bankName: {
          type: ['string', 'null'],
          description: 'For send_money: the recipient bank name',
        },
        beneficiaryName: {
          type: ['string', 'null'],
          description: 'For send_money: beneficiary name if no account number given',
        },
      },
      required: ['type', 'confidence'],
    },
  },
};

const INPUT_SCHEMA = z.object({
  type: z.enum(INTENT_VALUES),
  confidence: z.number().min(0).max(1),
  amountKobo: z.number().optional(),
  accountNumber: z.string().optional(),
  bankName: z.string().optional(),
  beneficiaryName: z.string().optional(),
});

export class IntentClassifier {
  constructor(private readonly lmlClient: LmlClient) {}

  async classify(userMessage: string): Promise<ClassifiedIntent> {
    const messages = [
      { role: 'system' as const, content: CLASSIFIER_INSTRUCTION },
      { role: 'user' as const, content: userMessage },
    ];

    const response = await this.lmlClient.chatWithForcedTool(
      messages,
      INTENT_CLASSIFIER_TOOL,
    );

    const toolCall = response.toolCalls[0];
    if (!toolCall) {
      return { type: 'general_chat', confidence: 0 };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch {
      return { type: 'general_chat', confidence: 0 };
    }

    const cleaned = Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );

    const result = INPUT_SCHEMA.safeParse(cleaned);
    if (!result.success) {
      return { type: 'general_chat', confidence: 0 };
    }

    return result.data;
  }
}
