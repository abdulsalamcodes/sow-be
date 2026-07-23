import { z } from 'zod';
import type { LmlClient, LmlToolDefinition, LmlMessage } from './llm-client.js';

/**
 * Keep these values stable because the harness/workflow layer depends on them.
 */
export const INTENT_VALUES = [
  'create_wallet',
  'fund_wallet',
  'check_balance',
  'send_money',
  'pay_bill',
  'get_transactions',
  'financial_analysis',
  'confirm_transfer',
  'cancel_transfer',
  'list_banks',
  'help',
  'general_chat',
] as const;

export type IntentType = (typeof INTENT_VALUES)[number];

export type BillType =
  'AIRTIME' | 'DATA' | 'ELECTRICITY' | 'CABLE' | 'INTERNET';

export type Provider =
  | 'MTN'
  | 'GLO'
  | 'AIRTEL'
  | '9MOBILE'
  | 'DSTV'
  | 'GOTV'
  | 'STARTIMES'
  | 'AEDC'
  | 'IKEDC';

export interface ClassifiedIntent {
  type: IntentType;

  /**
   * This is a routing signal, not a security boundary.
   * Never use confidence alone to authorize a financial action.
   */
  confidence: number;

  /**
   * Amount is returned in Naira as a human-readable numeric value.
   * The harness converts to kobo deterministically.
   */
  amountNaira?: number;

  /**
   * Preserve amountKobo for backward compatibility if your
   * existing harness already consumes it.
   *
   * New code should prefer amountNaira and convert in application code.
   */
  amountKobo?: number;

  accountNumber?: string;
  bankName?: string;
  beneficiaryName?: string;

  billType?: BillType;
  customerId?: string;
  provider?: Provider;
}

/**
 * Optional context passed by the harness.
 *
 * This allows the classifier to distinguish:
 *
 * "yes" → confirm_transfer
 *
 * from:
 *
 * "yes, I like that" → general_chat
 *
 * based on whether a pending transfer actually exists.
 */
export interface IntentContext {
  pendingTransfer?: boolean;
  lastIntent?: IntentType;
  lastAmountNaira?: number;
  lastAccountNumber?: string;
  lastBankName?: string;
  lastBeneficiaryName?: string;
}

/**
 * Keep the classifier focused.
 *
 * It does not decide:
 * - whether a transaction is allowed
 * - whether a wallet has sufficient funds
 * - whether a transfer should execute
 * - whether a user is authorized
 *
 * Those decisions belong to the harness and domain services.
 */
const CLASSIFIER_INSTRUCTION = `
You are an intent classifier for Sow, a Nigerian personal financial assistant.

Your job is ONLY to:
1. Identify the user's primary intent.
2. Extract explicit entities from the user's message.

Do not answer the user.
Do not execute actions.
Do not invent missing information.
Do not infer sensitive financial details that were not provided.

The currency is Nigerian Naira (₦).

==================================================
INTENT DEFINITIONS
==================================================

create_wallet
The user wants to create, open, set up, or activate a wallet.

Also use this intent when:
- The user says they do not have a wallet.
- The user explicitly provides an 11-digit BVN while discussing wallet creation.
- The user provides only an 11-digit number and there is no stronger contextual intent.

Examples:
"Create my wallet"
"I want a wallet"
"Open an account for me"
"My BVN is 12345678901"

fund_wallet
The user wants to add money to, fund, or top up their own wallet.

Examples:
"Fund my wallet with ₦10,000"
"Add 5k to my wallet"
"Top up my wallet"
"Put ₦20,000 in my wallet"

Do NOT use fund_wallet for airtime, data, electricity, cable, or other bill payments.

check_balance
The user asks how much money they have or asks for their wallet balance.

Examples:
"How much do I have?"
"What's my balance?"
"How much is in my wallet?"

send_money
The user wants to transfer money to another person or bank account.

Strong indicators:
- Bank name
- 10-digit Nigerian bank account number
- Beneficiary name
- Words such as send, transfer, pay someone, wire

Examples:
"Send ₦5,000 to Aisha"
"Transfer 2000 to 0123456789 GTBank"
"Send money to my brother"

A Nigerian phone number by itself is NOT a bank account.

pay_bill
The user wants to purchase or pay for:
- Airtime
- Data
- Electricity
- Cable TV
- Internet

Examples:
"Buy ₦500 airtime"
"Recharge 08012345678"
"Buy data for my phone"
"Pay my electricity bill"
"Renew my DSTV"

A Nigerian phone number is normally a customer ID for airtime/data, NOT a bank account.

get_transactions
The user wants to view or retrieve transaction history.

Examples:
"Show my transactions"
"Show my last five transactions"
"What transactions did I make today?"
"Show my recent payments"

financial_analysis
The user wants insight, analysis, or interpretation of their finances.

Examples:
"How much did I spend this week?"
"Where am I spending the most?"
"Analyze my spending"
"Am I spending too much?"
"What are my biggest expenses?"
"Can I afford to spend ₦30,000?"

Do not classify simple transaction-history requests as financial_analysis unless the user asks for analysis or interpretation.

confirm_transfer
Use ONLY when the user is clearly confirming a pending transfer AND the conversation context indicates a pending transfer exists.

Examples:
"Yes"
"Confirm"
"Proceed"
"Do it"

If there is no pending transfer, do NOT classify a generic "yes" as confirm_transfer.

cancel_transfer
Use ONLY when the user is clearly cancelling a pending transfer AND the conversation context indicates a pending transfer exists.

Examples:
"Cancel"
"No"
"Stop"
"Don't do it"
"Never mind"

If there is no pending transfer, do NOT classify a generic "no" as cancel_transfer.

list_banks
The user explicitly asks for a list of supported banks or asks which banks are available.

Examples:
"What banks do you support?"
"List the banks"
"Which banks can I transfer to?"

Do not use list_banks merely because a bank name appears in a transfer request.

help
The user explicitly asks how to use the assistant or what the assistant can do.

Examples:
"Help"
"What can you do?"
"How do I use this?"

general_chat
Anything that does not match the financial intents above.

==================================================
SEND MONEY VS BILL PAYMENT
==================================================

The distinction is important.

send_money:
- Bank account
- Bank name
- Beneficiary
- Person-to-person transfer

pay_bill:
- Airtime
- Data
- Electricity
- Cable TV
- Internet
- Phone recharge

Examples:

"send 100 airtime to 09064777159"
→ pay_bill

"buy 500 airtime for 08012345678"
→ pay_bill

"recharge 08012345678 with 500"
→ pay_bill

"send 5000 to Chidi"
→ send_money

"transfer 2000 to 0123456789 GTBank"
→ send_money

"pay my electricity bill"
→ pay_bill

"buy data for me"
→ pay_bill

==================================================
AMOUNT EXTRACTION
==================================================

Extract an amount only when the user explicitly provides one.

Understand common Nigerian expressions:

"5k" → 5000
"5K" → 5000
"2.5k" → 2500
"₦5,000" → 5000
"5000 naira" → 5000

Return the amount in Naira.

Do NOT perform kobo conversion.

The application will convert Naira to kobo deterministically.

If the user does not provide an amount, omit the field.

Never invent an amount.

==================================================
BANK ACCOUNT EXTRACTION
==================================================

A Nigerian bank account number is normally exactly 10 digits.

Extract accountNumber only when the message clearly contains a bank account number.

Never treat a phone number as an account number.

If the user provides:
- Account number + bank name → extract both.
- Beneficiary name only → extract beneficiaryName.
- Phone number + airtime/data context → extract customerId.

Do not invent bank names or account numbers.

==================================================
BILL EXTRACTION
==================================================

For pay_bill, extract any explicitly provided:

billType:
- AIRTIME
- DATA
- ELECTRICITY
- CABLE
- INTERNET

provider:
- MTN
- GLO
- AIRTEL
- 9MOBILE
- DSTV
- GOTV
- STARTIMES
- AEDC
- IKEDC

customerId:
- Phone number for airtime/data.
- Meter number for electricity.
- Smartcard number for cable.
- Other explicit customer identifiers.

Do not guess provider or customer ID.

==================================================
OUTPUT RULES
==================================================

Always return exactly one intent.

Extract only information explicitly present in the current message.

If an entity is missing, omit it.

Never return null.

Never invent values.

The classifier does not validate:
- Account numbers.
- BVNs.
- Bank names.
- Phone numbers.
- Customer IDs.

Validation happens in the application or domain services.

The classifier only performs intent recognition and entity extraction.
`;

/**
 * The tool schema is intentionally small.
 *
 * The LLM classifies and extracts.
 * The application performs normalization and validation.
 */
const INTENT_CLASSIFIER_TOOL: LmlToolDefinition = {
  type: 'function',
  function: {
    name: 'classify_intent',
    description:
      'Classify the user message and extract explicitly provided financial entities.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [...INTENT_VALUES],
        },

        confidence: {
          type: 'number',
          description:
            'A routing confidence score from 0 to 1. This is not an authorization decision.',
        },

        amountNaira: {
          type: ['number', 'null'],
          description:
            'Explicit transaction amount in Nigerian Naira. Do not convert to kobo.',
        },

        accountNumber: {
          type: ['string', 'null'],
          description:
            'Explicit Nigerian bank account number, normally exactly 10 digits.',
        },

        bankName: {
          type: ['string', 'null'],
          description:
            'Explicit recipient bank name. Do not invent or normalize unknown banks.',
        },

        beneficiaryName: {
          type: ['string', 'null'],
          description: 'Explicit name of the person receiving money.',
        },

        billType: {
          type: ['string', 'null'],
          enum: ['AIRTIME', 'DATA', 'ELECTRICITY', 'CABLE', 'INTERNET', null],
        },

        customerId: {
          type: ['string', 'null'],
          description:
            'Explicit bill customer identifier such as phone number, meter number, or smartcard number.',
        },

        provider: {
          type: ['string', 'null'],
          enum: [
            'MTN',
            'GLO',
            'AIRTEL',
            '9MOBILE',
            'DSTV',
            'GOTV',
            'STARTIMES',
            'AEDC',
            'IKEDC',
            null,
          ],
        },
      },

      required: ['type', 'confidence'],
    },
  },
};

const INPUT_SCHEMA = z.object({
  type: z.enum(INTENT_VALUES),

  confidence: z.number().min(0).max(1),

  amountNaira: z.number().finite().positive().optional(),

  accountNumber: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),

  bankName: z.string().trim().min(1).optional(),

  beneficiaryName: z.string().trim().min(1).optional(),

  billType: z
    .enum(['AIRTIME', 'DATA', 'ELECTRICITY', 'CABLE', 'INTERNET'])
    .optional(),

  customerId: z.string().trim().min(1).optional(),

  provider: z
    .enum([
      'MTN',
      'GLO',
      'AIRTEL',
      '9MOBILE',
      'DSTV',
      'GOTV',
      'STARTIMES',
      'AEDC',
      'IKEDC',
    ])
    .optional(),
});

export class IntentClassifier {
  constructor(private readonly lmlClient: LmlClient) {}

  async classify(
    userMessage: string,
    context?: IntentContext,
  ): Promise<ClassifiedIntent> {
    /**
     * Handle empty input without spending an LLM call.
     */
    const message = userMessage.trim();

    if (!message) {
      return {
        type: 'general_chat',
        confidence: 0,
      };
    }

    /**
     * Handle confirmation/cancellation deterministically
     * when there is a pending transfer.
     *
     * This saves an LLM call and prevents "yes" from being
     * incorrectly interpreted as a financial confirmation.
     */
    if (context?.pendingTransfer) {
      const normalized = message
        .toLowerCase()
        .replace(/[.!?,]/g, '')
        .trim();

      const confirmations = new Set([
        'yes',
        'yes please',
        'confirm',
        'confirmed',
        'proceed',
        'continue',
        'do it',
        'go ahead',
        'send it',
        'approve',
        'approved',
      ]);

      const cancellations = new Set([
        'no',
        'cancel',
        'cancel it',
        'stop',
        'abort',
        'never mind',
        'nevermind',
        'dont',
        "don't",
        'do not',
      ]);

      if (confirmations.has(normalized)) {
        return {
          type: 'confirm_transfer',
          confidence: 1,
        };
      }

      if (cancellations.has(normalized)) {
        return {
          type: 'cancel_transfer',
          confidence: 1,
        };
      }
    }

    /**
     * Very common deterministic shortcuts.
     *
     * These reduce latency and LLM usage for obvious inputs.
     */
    if (/^\d{11}$/.test(message)) {
      return {
        type: 'create_wallet',
        confidence: 1,
      };
    }

    if (/^(help|commands|what can you do)\??$/i.test(message)) {
      return {
        type: 'help',
        confidence: 1,
      };
    }

    const messages: LmlMessage[] = [
      {
        role: 'system' as const,
        content: CLASSIFIER_INSTRUCTION,
      },

      ...(context
        ? [
            {
              role: 'system' as const,
              content: JSON.stringify({
                conversationContext: context,
                instruction:
                  'Use this context only to resolve the current user message. Do not invent entities that are not supported by the current message or context.',
              }),
            },
          ]
        : []),

      {
        role: 'user' as const,
        content: message,
      },
    ];

    const response = await this.lmlClient.chatWithForcedTool(
      messages,
      INTENT_CLASSIFIER_TOOL,
    );

    const toolCall = response.toolCalls[0];

    if (!toolCall) {
      return {
        type: 'general_chat',
        confidence: 0,
      };
    }

    let parsed: Record<string, unknown>;

    try {
      const raw: unknown = JSON.parse(toolCall.arguments);
      parsed = raw as Record<string, unknown>;
    } catch {
      return {
        type: 'general_chat',
        confidence: 0,
      };
    }

    /**
     * Remove null and undefined values.
     *
     * This preserves your existing contract where optional
     * properties are omitted rather than returned as null.
     */
    const cleaned = Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );

    const result = INPUT_SCHEMA.safeParse(cleaned);

    if (!result.success) {
      return {
        type: 'general_chat',
        confidence: 0,
      };
    }

    /**
     * Convert the LLM's human-readable Naira amount
     * into kobo deterministically.
     *
     * This keeps financial arithmetic outside the LLM.
     */
    const classified = result.data;

    const amountKobo =
      classified.amountNaira !== undefined
        ? Math.round(classified.amountNaira * 100)
        : undefined;

    return {
      ...classified,

      ...(amountKobo !== undefined ? { amountKobo } : {}),
    };
  }
}
