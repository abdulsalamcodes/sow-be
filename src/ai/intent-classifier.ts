import { z } from 'zod';
import type { LmlClient, LmlToolDefinition } from './llm-client.js';

export const INTENT_VALUES = [
  'check_balance',
  'send_money',
  'pay_bill',
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
  billType?: string;
  customerId?: string;
  provider?: string;
}

const CLASSIFIER_INSTRUCTION = `Determine the user's intent from their message.

Rules for distinguishing send_money vs pay_bill:
- send_money: user wants to send money to a BANK ACCOUNT. Look for bank names (GTBank, Access, UBA, First Bank, etc.), account numbers (10 digits), or beneficiary names. Phone numbers (09xx, 08xx, 07xx) are NOT bank accounts.
- pay_bill: user wants to buy airtime/data/card/recharge, pay electricity, cable TV, internet, or any bill. Keywords: airtime, data, card, recharge, top up, electricity, prepaid, meter, cable, DSTV, Gotv, Startimes, internet, WiFi. Phone numbers (09xx, 08xx, 07xx) are customer IDs for airtime/data, NOT bank accounts.

Examples:
- "send 100 card to my number 09064777159" → pay_bill (buying airtime for a phone)
- "buy 500 airtime for 08012345678" → pay_bill
- "send 5000 to Chidi" → send_money (beneficiary name, no phone number)
- "transfer 2000 to 0123456789 GTBank" → send_money (bank account + bank name)
- "pay my electricity bill" → pay_bill
- "recharge my phone with 200" → pay_bill

Intents:
- check_balance: user asks about wallet balance, account balance, how much money they have
- send_money: user wants to send/transfer money to a bank account
- pay_bill: user wants to pay a bill (airtime, data, electricity, cable TV, internet, recharge)
- confirm_transfer: user confirms a pending transfer (yes, confirm, proceed, ok, do it)
- cancel_transfer: user cancels a pending action (no, cancel, stop, abort, never mind)
- list_banks: user asks about linked banks or bank list
- help: user explicitly says "help" or "commands"
- general_chat: anything else that does not match the above

For send_money, extract amountKobo, accountNumber (10-digit bank account), bankName, or beneficiaryName. For pay_bill, extract amountKobo, customerId (phone/meter/smartcard), provider (MTN/GLO/AIRTEL/9MOBILE/DSTV/GOTV/AEDC/IKEDC), billType (AIRTIME/DATA/ELECTRICITY/CABLE/INTERNET). When a field has no value, omit it entirely — never set it to null.`;

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
          description: 'For send_money or pay_bill: the amount in kobo (naira * 100)',
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
        billType: {
          type: ['string', 'null'],
          description: 'For pay_bill: bill category type (AIRTIME, DATA, ELECTRICITY, CABLE, INTERNET)',
        },
        customerId: {
          type: ['string', 'null'],
          description: 'For pay_bill: customer identifier (phone number, meter number, smart card number)',
        },
        provider: {
          type: ['string', 'null'],
          description: 'For pay_bill: provider name (MTN, GLO, DSTV, AEDC, IKEDC)',
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
  billType: z.string().optional(),
  customerId: z.string().optional(),
  provider: z.string().optional(),
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
