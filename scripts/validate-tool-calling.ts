import 'reflect-metadata';
import { config } from 'dotenv';
import { LmlClient } from '../src/ai/llm-client.js';
import { SOW_INSTRUCTIONS } from '../src/ai/agent.js';
import { buildTools, toJsonSchema } from '../src/ai/tools/index.js';
import { WalletServiceStub } from '../src/contracts/stubs/wallet.stub.js';
import { PaymentsServiceStub } from '../src/contracts/stubs/payments.stub.js';
import { TransactionsServiceStub } from '../src/contracts/stubs/transactions.stub.js';
import { BanksServiceStub } from '../src/contracts/stubs/banks.stub.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { IntentsService } from '../src/intents/intents.service.js';

config();

const PROMPTS = [
  'What is my wallet balance?',
  'How do I fund my wallet?',
  'Send 5000 naira to Aisha',
  'Transfer 2500 to Chidi',
  'How much did I spend this week?',
  'Where is most of my money going this month?',
  'Can I afford a 30000 naira purchase?',
  'Give me a budget',
  'Show my recent transactions',
  'What did I spend last month?',
];

const buildStubIntentsService = (): IntentsService => {
  const banks = new BanksServiceStub();
  const payments = new PaymentsServiceStub();
  const intentRepository = {
    create: (value: unknown) => value,
    save: (value: Record<string, unknown>) => ({ id: 'intent-stub', ...value }),
    findOne: () => null,
  };
  return new IntentsService(intentRepository as never, banks, payments);
};

const main = async (): Promise<void> => {
  const transactionsStub = new TransactionsServiceStub();
  const analyticsService = new AnalyticsService(
    new WalletServiceStub(),
    transactionsStub,
  );

  const tools = buildTools({
    walletService: new WalletServiceStub(),
    transactionsService: transactionsStub,
    analyticsService,
    intentsService: buildStubIntentsService(),
    banksService: new BanksServiceStub(),
  });

  const client = new LmlClient({
    baseUrl: process.env.LLM_BASE_URL!,
    apiKey: process.env.LLM_API_KEY!,
    model: process.env.LLM_MODEL!,
  });

  for (const prompt of PROMPTS) {
    const result = await client.chat(
      [
        { role: 'system', content: SOW_INSTRUCTIONS },
        { role: 'user', content: prompt },
      ],
      tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: toJsonSchema(tool.inputSchema),
        },
      })),
    );

    const toolNames =
      result.toolCalls.map((tc) => tc.name).join(', ') || 'none';
    console.log(`prompt="${prompt}" → tools=[${toolNames}]`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
