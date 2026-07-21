import { ConfigService } from '@nestjs/config';

export interface MonnifyConfig {
  apiKey: string;
  secretKey: string;
  contractCode: string;
  walletAccountNumber: string;
  baseUrl: string;
}

const BASE_URLS = {
  SANDBOX: 'https://sandbox.monnify.com',
  LIVE: 'https://api.monnify.com',
} as const;

export const buildMonnifyConfig = (configService: ConfigService): MonnifyConfig => {
  const env = configService.getOrThrow<string>('MONNIFY_ENV');
  const baseUrl = BASE_URLS[env as keyof typeof BASE_URLS];
  if (!baseUrl) {
    throw new Error(`MONNIFY_ENV must be SANDBOX or LIVE, got: ${env}`);
  }
  return {
    apiKey: configService.getOrThrow<string>('MONNIFY_API_KEY'),
    secretKey: configService.getOrThrow<string>('MONNIFY_SECRET_KEY'),
    contractCode: configService.getOrThrow<string>('MONNIFY_CONTRACT_CODE'),
    walletAccountNumber: configService.getOrThrow<string>('MONNIFY_WALLET_ACCOUNT_NUMBER'),
    baseUrl,
  };
};
