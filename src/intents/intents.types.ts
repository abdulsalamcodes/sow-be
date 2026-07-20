export interface CreateTransferIntentInput {
  amountKobo: number;
  recipientName?: string;
  accountNumber?: string;
  bankCode?: string;
  narration?: string;
}

export interface TransferIntentView {
  intentId: string;
  summary: string;
  amountKobo: number;
  recipientAccountName: string;
  expiresAt: Date;
}

export interface IntentExecutionResult {
  status: 'EXECUTED' | 'FAILED';
  reference?: string;
  failureReason?: string;
}
