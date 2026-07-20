import 'reflect-metadata';
import { config } from 'dotenv';
import { RequestContext } from '@mastra/core/request-context';
import { buildModel } from '../src/ai/model.js';
import { buildMemory } from '../src/ai/memory.js';
import { buildSowAgent } from '../src/ai/agent.js';
import { USER_ID_KEY } from '../src/ai/runtime-context.js';
import { WalletServiceStub } from '../src/contracts/stubs/wallet.stub.js';
import { PaymentsServiceStub } from '../src/contracts/stubs/payments.stub.js';
import { TransactionsServiceStub } from '../src/contracts/stubs/transactions.stub.js';
import { BanksServiceStub } from '../src/contracts/stubs/banks.stub.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { IntentsService } from '../src/intents/intents.service.js';

config();

// Day-1 Risk Register check: does the chosen LLM_MODEL select the right tool
// with schema-valid arguments? Prints one line per prompt so a human can eyeball
// the ≥9/10 acceptance bar. Uses stubs so no database or Monnify is needed.
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

  const agent = buildSowAgent({
    model: buildModel({
      baseUrl: process.env.LLM_BASE_URL!,
      apiKey: process.env.LLM_API_KEY!,
      model: process.env.LLM_MODEL!,
    }),
    memory: buildMemory({
      host: process.env.DATABASE_HOST!,
      port: Number(process.env.DATABASE_PORT),
      user: process.env.DATABASE_USERNAME!,
      password: process.env.DATABASE_PASSWORD!,
      database: process.env.DATABASE_NAME!,
    }),
    walletService: new WalletServiceStub(),
    transactionsService: transactionsStub,
    analyticsService,
    intentsService: buildStubIntentsService(),
  });

  const requestContext = new RequestContext([[USER_ID_KEY, 'validation-user']]);

  for (const prompt of PROMPTS) {
    const result = await agent.generate(prompt, { requestContext });
    const toolNames =
      result.toolCalls?.map((call) => call.payload.toolName).join(', ') ||
      'none';
    console.log(`prompt="${prompt}" → tools=[${toolNames}]`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
