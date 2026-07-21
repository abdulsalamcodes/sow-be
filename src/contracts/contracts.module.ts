import { Module, forwardRef } from '@nestjs/common';
import {
  WALLET_SERVICE,
  PAYMENTS_SERVICE,
  TRANSACTIONS_SERVICE,
  BANKS_SERVICE,
  BILLS_SERVICE,
} from './financial-services.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { BanksModule } from '../banks/banks.module.js';
import { BillsModule } from '../bills/bills.module.js';
import { MonnifyModule } from '../monnify/monnify.module.js';
import { WalletService } from '../wallet/wallet.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { BanksService } from '../banks/banks.service.js';
import { BillsService } from '../bills/bills.service.js';

@Module({
  imports: [
    WalletModule,
    PaymentsModule,
    TransactionsModule,
    BanksModule,
    BillsModule,
    forwardRef(() => MonnifyModule),
  ],
  providers: [
    { provide: WALLET_SERVICE, useExisting: WalletService },
    { provide: PAYMENTS_SERVICE, useExisting: PaymentsService },
    { provide: TRANSACTIONS_SERVICE, useExisting: TransactionsService },
    { provide: BANKS_SERVICE, useExisting: BanksService },
    { provide: BILLS_SERVICE, useExisting: BillsService },
  ],
  exports: [
    WALLET_SERVICE,
    PAYMENTS_SERVICE,
    TRANSACTIONS_SERVICE,
    BANKS_SERVICE,
    BILLS_SERVICE,
  ],
})
export class ContractsModule {}
