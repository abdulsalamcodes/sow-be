import type {
  WalletServiceContract,
  TransactionsServiceContract,
  BanksServiceContract,
  BillsServiceContract,
} from '../../contracts/financial-services.js';
import type { AnalyticsService } from '../../analytics/analytics.service.js';
import type { IntentsService } from '../../intents/intents.service.js';
import type { KycService } from '../../kyc/kyc.service.js';
import { buildWalletTools } from './wallet.tools.js';
import { buildTransactionsTools } from './transactions.tools.js';
import { buildAnalyticsTools } from './analytics.tools.js';
import { buildTransferTools } from './transfer.tools.js';
import { buildBanksTools } from './banks.tools.js';
import { buildBillsTools } from './bills.tools.js';
import { buildKycTools } from './kyc.tools.js';
import type { ToolDefinition } from './types.js';

export interface ToolDependencies {
  walletService: WalletServiceContract;
  transactionsService: TransactionsServiceContract;
  analyticsService: AnalyticsService;
  intentsService: IntentsService;
  banksService: BanksServiceContract;
  billsService: BillsServiceContract;
  kycService: KycService;
}

export const buildTools = (
  dependencies: ToolDependencies,
): ToolDefinition[] => [
  ...buildWalletTools(dependencies.walletService),
  ...buildTransactionsTools(dependencies.transactionsService),
  ...buildAnalyticsTools(dependencies.analyticsService),
  ...buildTransferTools(dependencies.intentsService),
  ...buildBanksTools(dependencies.banksService),
  ...buildBillsTools(dependencies.billsService),
  ...buildKycTools(dependencies.kycService),
];

export type { ToolDefinition } from './types.js';
export { toJsonSchema } from './types.js';
