export interface MonnifyWebhookPayload {
  eventType:
    | 'RESERVED_ACCOUNT_TRANSACTION'
    | 'SUCCESSFUL_DISBURSEMENT'
    | 'FAILED_DISBURSEMENT'
    | 'SUCCESSFUL_BILL_PAYMENT'
    | 'FAILED_BILL_PAYMENT';
  eventData: Record<string, unknown>;
}

export interface ReservedAccountWebhookData {
  transactionReference: string;
  paymentReference: string;
  amountPaid: number;
  totalAmountPaid: number;
  settlementAmount: number;
  paidOn: string;
  paymentStatus: string;
  currency: string;
  paymentMethod: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  customer: { email: string; name: string };
}

export interface DisbursementWebhookData {
  transactionReference: string;
  paymentReference: string;
  amount: number;
  currency: string;
  destinationAccountNumber: string;
  destinationBankCode: string;
  destinationAccountName: string;
  narration: string;
  status: 'SUCCESS' | 'FAILED';
  fee: number;
  failureReason?: string;
}

export interface BillPaymentWebhookData {
  transactionReference: string;
  reference: string;
  status: 'SUCCESS' | 'FAILED';
  amount: number;
}
