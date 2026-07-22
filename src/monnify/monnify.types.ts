export interface MonnifyEnvelope<T> {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: T;
}

export interface DisbursementResponse {
  reference: string;
  status: string;
  amount: number;
  destinationAccountNumber: string;
  destinationBankCode: string;
  narration: string;
  fee: number;
}

export interface OtpData {
  otpReference: string;
  transactionReference: string;
}

export interface DisbursementWithOtp extends DisbursementResponse {
  otpData?: OtpData;
  transactionReference?: string;
}

export interface ReservedAccountResponse {
  accountReference: string;
  accounts: Array<{
    accountNumber: string;
    bankName: string;
    accountName: string;
  }>;
}

export interface AccountValidationResponse {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
}

export interface WalletBalanceResponse {
  amount: number;
}

export interface PaginatedContent<T> {
  content: T[];
}

export interface MonnifyCategory {
  code: string;
  name: string;
}

export interface MonnifyBiller {
  code: string;
  name: string;
  categories?: Array<{ code: string; name: string }>;
}

export interface MonnifyProduct {
  code: string;
  name: string;
  price: number;
  priceType: string;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export interface CustomerValidationResponse {
  responseBody: {
    customerName?: string;
    customerEmail?: string;
    customerMobileNumber?: string;
    validationReference?: string;
  };
}

export interface VendResponse {
  transactionReference: string;
  reference: string;
  status: string;
  amount: number;
  fee: number;
}

export interface RequeryResponse {
  reference: string;
  transactionReference: string;
  status: string;
  amount: number;
  fee: number;
}
