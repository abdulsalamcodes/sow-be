export interface WalletSnapshot {
  balanceKobo: string;
  accountNumber: string | null;
  bankName: string | null;
  accountName: string | null;
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
  otpRequired?: boolean;
  otpReference?: string;
}

export interface LedgerTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  category: 'FUNDING' | 'TRANSFER' | 'BILL_PAYMENT' | 'WITHDRAWAL';
  amountKobo: string;
  feeKobo: string;
  narration: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  monnifyReference: string | null;
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

export interface BillerCategory {
  categoryCode: string;
  categoryName: string;
}

export interface Biller {
  billerCode: string;
  billerName: string;
  categoryCode: string;
}

export interface BillerProduct {
  productCode: string;
  productName: string;
  amount: number;
  fixedPrice: boolean;
}

export interface BillPaymentRequest {
  userId: string;
  productCode: string;
  customerId: string;
  amountKobo: number;
  reference: string;
  validationReference?: string;
  provider: string;
  billType: string;
}

export interface BillPaymentResult {
  reference: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  failureReason?: string;
  transactionReference?: string;
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
  listBanks(): Promise<Array<{ bankCode: string; bankName: string }>>;
}

export interface BillsServiceContract {
  listCategories(): Promise<BillerCategory[]>;
  listBillers(categoryCode?: string): Promise<Biller[]>;
  getBillerProducts(billerCode: string): Promise<BillerProduct[]>;
  validateCustomer(
    productCode: string,
    customerId: string,
  ): Promise<{ valid: boolean; name?: string; validationReference?: string }>;
  executeBillPayment(request: BillPaymentRequest): Promise<BillPaymentResult>;
  requeryBillPayment(reference: string): Promise<BillPaymentResult>;
}

export const WALLET_SERVICE = Symbol('WALLET_SERVICE');
export const PAYMENTS_SERVICE = Symbol('PAYMENTS_SERVICE');
export const TRANSACTIONS_SERVICE = Symbol('TRANSACTIONS_SERVICE');
export const BANKS_SERVICE = Symbol('BANKS_SERVICE');
export const BILLS_SERVICE = Symbol('BILLS_SERVICE');
