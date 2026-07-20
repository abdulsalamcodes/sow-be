import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent } from '@mastra/core/agent';
import {
  WALLET_SERVICE,
  TRANSACTIONS_SERVICE,
  WalletServiceContract,
  TransactionsServiceContract,
} from '../contracts/financial-services.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { IntentsModule } from '../intents/intents.module.js';
import { IntentsService } from '../intents/intents.service.js';
import { SOW_AGENT } from './ai.constants.js';
import { buildModel } from './model.js';
import { buildMemory } from './memory.js';
import { buildSowAgent } from './agent.js';

// Mastra is not DI-aware, so this factory bridges Nest-managed services into
// the agent's tools and reads all configuration through ConfigService.
const agentProvider: Provider = {
  provide: SOW_AGENT,
  inject: [
    ConfigService,
    WALLET_SERVICE,
    TRANSACTIONS_SERVICE,
    AnalyticsService,
    IntentsService,
  ],
  useFactory: (
    configService: ConfigService,
    walletService: WalletServiceContract,
    transactionsService: TransactionsServiceContract,
    analyticsService: AnalyticsService,
    intentsService: IntentsService,
  ): Agent => {
    const model = buildModel({
      baseUrl: configService.getOrThrow<string>('LLM_BASE_URL'),
      apiKey: configService.getOrThrow<string>('LLM_API_KEY'),
      model: configService.getOrThrow<string>('LLM_MODEL'),
    });
    const memory = buildMemory({
      host: configService.getOrThrow<string>('DATABASE_HOST'),
      port: configService.getOrThrow<number>('DATABASE_PORT'),
      user: configService.getOrThrow<string>('DATABASE_USERNAME'),
      password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
      database: configService.getOrThrow<string>('DATABASE_NAME'),
    });
    return buildSowAgent({
      model,
      memory,
      walletService,
      transactionsService,
      analyticsService,
      intentsService,
    });
  },
};

@Module({
  imports: [ContractsModule, AnalyticsModule, IntentsModule],
  providers: [agentProvider],
  exports: [SOW_AGENT],
})
export class AiModule {}
