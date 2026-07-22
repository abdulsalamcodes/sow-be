export interface CreateTransferIntentInput {
  amountKobo: number;
  recipientName?: string;
  accountNumber?: string;
  bankCode?: string;
  narration?: string;
  conversationId?: string;
}

export interface TransferIntentView {
  intentId: string;
  summary: string;
  amountKobo: number;
  recipientAccountName: string;
  expiresAt: Date;
}

export interface IntentExecutionResult {
  status: 'EXECUTED' | 'FAILED' | 'PENDING_OTP';
  reference?: string;
  failureReason?: string;
  otpReference?: string;
}
