import 'reflect-metadata';
import { config } from 'dotenv';
import { LmlClient } from '../src/ai/llm-client.js';
import { SOW_INSTRUCTIONS } from '../src/ai/agent.js';
import { buildTools, toJsonSchema } from '../src/ai/tools/index.js';
import { WalletServiceStub } from '../src/contracts/stubs/wallet.stub.js';
import { PaymentsServiceStub } from '../src/contracts/stubs/payments.stub.js';
import { TransactionsServiceStub } from '../src/contracts/stubs/transactions.stub.js';
import { BanksServiceStub } from '../src/contracts/stubs/banks.stub.js';
import { BillsServiceStub } from '../src/contracts/stubs/bills.stub.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { IntentsService } from '../src/intents/intents.service.js';

config();

const PROMPTS = [
  'Buy 500 naira airtime to 08012345678',
  'Pay electricity bill of 2000 naira to my prepaid meter 12345678901',
  'I want to pay for DSTV',
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
    billsService: new BillsServiceStub(),
  });

  const client = new LmlClient({
    baseUrl: process.env.LLM_BASE_URL!,
    apiKey: process.env.LLM_API_KEY!,
    model: process.env.LLM_MODEL!,
  });

  for (const prompt of PROMPTS) {
    try {
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
    } catch (error) {
      console.log(`prompt="${prompt}" → ERROR: ${(error as Error).message}`);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
