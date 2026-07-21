import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MonnifyError } from './monnify-error.js';
import { MonnifyEnvelope } from './monnify.types.js';
import { buildMonnifyConfig, MonnifyConfig } from './monnify.config.js';

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class MonnifyHttpClient {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private tokenRefreshPromise: Promise<string> | null = null;
  private readonly config: MonnifyConfig;

  constructor(configService: ConfigService) {
    this.config = buildMonnifyConfig(configService);
  }

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }
    this.tokenRefreshPromise = this.refreshToken();
    try {
      return await this.tokenRefreshPromise;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, query);
    const token = await this.getToken();
    return this.request<T>(url, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const token = await this.getToken();
    return this.request<T>(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const token = await this.getToken();
    return this.request<T>(url, {
      method: 'PUT',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async del<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    const token = await this.getToken();
    return this.request<T>(url, {
      method: 'DELETE',
      headers: this.authHeaders(token),
    });
  }

  private async refreshToken(): Promise<string> {
    const credentials = `${this.config.apiKey}:${this.config.secretKey}`;
    const encoded = Buffer.from(credentials).toString('base64');
    const response = await fetch(`${this.config.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new MonnifyError('Authentication failed', String(response.status));
    }
    const envelope: MonnifyEnvelope<{
      accessToken: string;
      expiresIn: number;
    }> = await response.json();
    if (!envelope.requestSuccessful) {
      throw new MonnifyError(envelope.responseMessage, envelope.responseCode);
    }
    this.token = envelope.responseBody.accessToken;
    this.tokenExpiry =
      Date.now() + (envelope.responseBody.expiresIn - 300) * 1000;
    return this.token;
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    retryCount = 0,
  ): Promise<T> {
    try {
      const response = await fetch(url, options);
      if (response.status === 401) {
        this.token = null;
        this.tokenExpiry = 0;
        if (retryCount < 1) {
          const newToken = await this.getToken();
          const headers = { ...(options.headers as Record<string, string>) };
          headers['Authorization'] = `Bearer ${newToken}`;
          return this.request<T>(url, { ...options, headers }, retryCount + 1);
        }
        throw new MonnifyError('Authentication failed after retry');
      }
      const envelope: MonnifyEnvelope<T> = await response.json();
      if (!envelope.requestSuccessful) {
        throw new MonnifyError(envelope.responseMessage, envelope.responseCode);
      }
      return envelope.responseBody;
    } catch (error) {
      if (error instanceof MonnifyError) {
        throw error;
      }
      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, retryCount),
          MAX_DELAY_MS,
        );
        await sleep(delay);
        return this.request<T>(url, options, retryCount + 1);
      }
      throw new MonnifyError('Monnify unavailable — try again');
    }
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(
      path.startsWith('http') ? path : `${this.config.baseUrl}${path}`,
    );
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }
}
