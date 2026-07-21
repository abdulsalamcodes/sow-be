import { Module } from '@nestjs/common';
import {
  WALLET_SERVICE,
  PAYMENTS_SERVICE,
  TRANSACTIONS_SERVICE,
  BANKS_SERVICE,
} from './financial-services.js';
import { WalletServiceStub } from './stubs/wallet.stub.js';
import { PaymentsServiceStub } from './stubs/payments.stub.js';
import { TransactionsServiceStub } from './stubs/transactions.stub.js';
import { BanksServiceStub } from './stubs/banks.stub.js';

// Stubs stand in for BE2's financial services behind stable injection tokens.
// Swap each `useClass` for the real implementation as BE2's modules land.
@Module({
  providers: [
    { provide: WALLET_SERVICE, useClass: WalletServiceStub },
    { provide: PAYMENTS_SERVICE, useClass: PaymentsServiceStub },
    { provide: TRANSACTIONS_SERVICE, useClass: TransactionsServiceStub },
    { provide: BANKS_SERVICE, useClass: BanksServiceStub },
  ],
  exports: [
    WALLET_SERVICE,
    PAYMENTS_SERVICE,
    TRANSACTIONS_SERVICE,
    BANKS_SERVICE,
  ],
})
export class ContractsModule {}
