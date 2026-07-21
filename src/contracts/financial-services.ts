export interface WalletSnapshot {
  balanceKobo: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
}

export interface TransferRequest {
  userId: string;
  amountKobo: number;
  destinationAccountNumber: string;
  destinationBankCode: string;
  narration: string;
  idempotencyKey: string;
}

export interface TransferResult {
  reference: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  failureReason?: string;
}

export interface LedgerTransaction {
  id: string;
  amountKobo: number;
  type: 'CREDIT' | 'DEBIT';
  category: 'FUNDING' | 'TRANSFER' | 'BILL_PAYMENT' | 'WITHDRAWAL';
  narration: string | null;
  counterparty: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: Date;
}

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface WalletServiceContract {
  getWallet(userId: string): Promise<WalletSnapshot>;
}

export interface PaymentsServiceContract {
  executeTransfer(request: TransferRequest): Promise<TransferResult>;
}

export interface TransactionsServiceContract {
  listTransactions(
    userId: string,
    range: DateRange,
  ): Promise<LedgerTransaction[]>;
}

export interface BanksServiceContract {
  resolveAccountName(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolvedAccount>;
  findBeneficiaryByName(
    userId: string,
    name: string,
  ): Promise<ResolvedAccount | null>;
}

export const WALLET_SERVICE = Symbol('WALLET_SERVICE');
export const PAYMENTS_SERVICE = Symbol('PAYMENTS_SERVICE');
export const TRANSACTIONS_SERVICE = Symbol('TRANSACTIONS_SERVICE');
export const BANKS_SERVICE = Symbol('BANKS_SERVICE');
