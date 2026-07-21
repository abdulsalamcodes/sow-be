import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MonnifyHttpClient } from './monnify-http-client.js';
import { MonnifyError } from './monnify-error.js';

const mockConfig = {
  MONNIFY_ENV: 'SANDBOX',
  MONNIFY_API_KEY: 'test-api-key',
  MONNIFY_SECRET_KEY: 'test-secret-key',
  MONNIFY_CONTRACT_CODE: 'test-contract',
  MONNIFY_WALLET_ACCOUNT_NUMBER: '1234567890',
};

const buildModule = async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonnifyHttpClient,
      {
        provide: ConfigService,
        useValue: {
          getOrThrow: (key: string) => mockConfig[key as keyof typeof mockConfig],
          get: (key: string) => mockConfig[key as keyof typeof mockConfig],
        },
      },
    ],
  }).compile();

  return module.get<MonnifyHttpClient>(MonnifyHttpClient);
};

describe('MonnifyHttpClient', () => {
  let client: MonnifyHttpClient;

  beforeEach(async () => {
    client = await buildModule();
  });

  describe('getToken', () => {
    it('returns cached token before expiry', async () => {
      const clientAny = client as unknown as { token: string; tokenExpiry: number };
      clientAny.token = 'cached-token';
      clientAny.tokenExpiry = Date.now() + 3600_000;

      const token = await client.getToken();

      expect(token).toBe('cached-token');
    });

    it('refreshes expired token', async () => {
      const clientAny = client as unknown as { token: string; tokenExpiry: number };
      clientAny.token = 'old-token';
      clientAny.tokenExpiry = Date.now() - 1000;

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          requestSuccessful: true,
          responseMessage: 'success',
          responseCode: '0',
          responseBody: { accessToken: 'new-token', expiresIn: 3600 },
        }), { status: 200 }),
      );

      const token = await client.getToken();

      expect(token).toBe('new-token');
      fetchSpy.mockRestore();
    });
  });

  describe('request error handling', () => {
    it('throws MonnifyError on 5xx after retries', async () => {
      const clientAny = client as unknown as { token: string; tokenExpiry: number };
      clientAny.token = 'pre-set-token';
      clientAny.tokenExpiry = Date.now() + 3600_000;

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      await expect(client.get('/test')).rejects.toThrow(MonnifyError);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      fetchSpy.mockRestore();
    });

    it('throws MonnifyError when requestSuccessful is false', async () => {
      const clientAny = client as unknown as { token: string; tokenExpiry: number };
      clientAny.token = 'pre-set-token';
      clientAny.tokenExpiry = Date.now() + 3600_000;

      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          requestSuccessful: false,
          responseMessage: 'Invalid request',
          responseCode: '400',
        }), { status: 200 }),
      );

      await expect(client.get('/test')).rejects.toThrow(MonnifyError);
      jest.restoreAllMocks();
    });

    it('clears token and retries once on 401', async () => {
      const clientAny = client as unknown as { token: string; tokenExpiry: number };
      clientAny.token = 'expired-token';
      clientAny.tokenExpiry = Date.now() + 3600_000;

      const authResponse = new Response(JSON.stringify({
        requestSuccessful: true,
        responseMessage: 'success',
        responseCode: '0',
        responseBody: { accessToken: 'new-token', expiresIn: 3600 },
      }), { status: 200 });

      const errorResponse = new Response(JSON.stringify({
        requestSuccessful: false,
        responseMessage: 'Unauthorized',
        responseCode: '401',
      }), { status: 401 });

      const fetchSpy = jest.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(errorResponse)    // first request → 401
        .mockResolvedValueOnce(authResponse);    // getToken retry → success

      await expect(client.get('/test')).rejects.toThrow(MonnifyError);
      fetchSpy.mockRestore();
    });
  });
});
