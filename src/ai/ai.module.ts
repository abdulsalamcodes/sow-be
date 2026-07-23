import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WALLET_SERVICE,
  TRANSACTIONS_SERVICE,
  BANKS_SERVICE,
  BILLS_SERVICE,
  WalletServiceContract,
  TransactionsServiceContract,
  BanksServiceContract,
  BillsServiceContract,
} from '../contracts/financial-services.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { IntentsModule } from '../intents/intents.module.js';
import { IntentsService } from '../intents/intents.service.js';
import { KycModule } from '../kyc/kyc.module.js';
import { KycService } from '../kyc/kyc.service.js';
import { LmlClient } from './llm-client.js';
import { SOW_AGENT } from './ai.constants.js';
import { buildTools } from './tools/index.js';
import { IntentClassifier } from './intent-classifier.js';
import { StateInjector } from './state-injector.js';

const lmlClientProvider: Provider = {
  provide: LmlClient,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): LmlClient =>
    new LmlClient({
      baseUrl: configService.getOrThrow<string>('LLM_BASE_URL'),
      apiKey: configService.getOrThrow<string>('LLM_API_KEY'),
      model: configService.getOrThrow<string>('LLM_MODEL'),
    }),
};

const toolDefinitionsProvider: Provider = {
  provide: SOW_AGENT,
  inject: [
    WALLET_SERVICE,
    TRANSACTIONS_SERVICE,
    BANKS_SERVICE,
    BILLS_SERVICE,
    AnalyticsService,
    IntentsService,
    KycService,
  ],
  useFactory: (
    walletService: WalletServiceContract,
    transactionsService: TransactionsServiceContract,
    banksService: BanksServiceContract,
    billsService: BillsServiceContract,
    analyticsService: AnalyticsService,
    intentsService: IntentsService,
    kycService: KycService,
  ) =>
    buildTools({
      walletService,
      transactionsService,
      banksService,
      billsService,
      analyticsService,
      intentsService,
      kycService,
    }),
};

const intentClassifierProvider: Provider = {
  provide: IntentClassifier,
  inject: [LmlClient],
  useFactory: (lmlClient: LmlClient): IntentClassifier =>
    new IntentClassifier(lmlClient),
};

const stateInjectorProvider: Provider = {
  provide: StateInjector,
  inject: [WALLET_SERVICE],
  useFactory: (
    walletService: WalletServiceContract,
  ): StateInjector => new StateInjector(walletService),
};

@Module({
  imports: [ContractsModule, AnalyticsModule, IntentsModule, KycModule],
  providers: [
    lmlClientProvider,
    toolDefinitionsProvider,
    intentClassifierProvider,
    stateInjectorProvider,
  ],
  exports: [
    LmlClient,
    SOW_AGENT,
    IntentClassifier,
    StateInjector,
  ],
})
export class AiModule {}
