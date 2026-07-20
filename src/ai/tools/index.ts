import { WalletServiceContract, TransactionsServiceContract } from '../../contracts/financial-services.js';
import { AnalyticsService } from '../../analytics/analytics.service.js';
import { IntentsService } from '../../intents/intents.service.js';
import { buildWalletTools } from './wallet.tools.js';
import { buildTransactionsTools } from './transactions.tools.js';
import { buildAnalyticsTools } from './analytics.tools.js';
import { buildTransferTools } from './transfer.tools.js';

export interface ToolDependencies {
  walletService: WalletServiceContract;
  transactionsService: TransactionsServiceContract;
  analyticsService: AnalyticsService;
  intentsService: IntentsService;
}

export const buildTools = (dependencies: ToolDependencies) => ({
  ...buildWalletTools(dependencies.walletService),
  ...buildTransactionsTools(dependencies.transactionsService),
  ...buildAnalyticsTools(dependencies.analyticsService),
  ...buildTransferTools(dependencies.intentsService),
});
