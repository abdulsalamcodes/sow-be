import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PLUNK_SEND_URL = 'https://api.useplunk.com/v1/send';
const REQUEST_TIMEOUT_MS = 5000;
const OTP_SUBJECT = 'Your Sow verification code';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.getOrThrow<string>('PLUNK_API_KEY');
  }

  async sendOtpEmail(recipientEmail: string, code: string): Promise<void> {
    await this.send(recipientEmail, OTP_SUBJECT, this.buildOtpBody(code));
  }

  private buildOtpBody(code: string): string {
    return (
      `<p>Your Sow verification code is <strong>${code}</strong>.</p>` +
      `<p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`
    );
  }

  private async send(to: string, subject: string, body: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(PLUNK_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, subject, body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Plunk request failed for ${to}`, error as Error);
      throw new ServiceUnavailableException(
        'Email delivery failed — try resend',
      );
    }

    if (!response.ok) {
      this.logger.error(`Plunk returned ${response.status} for ${to}`);
      throw new ServiceUnavailableException(
        'Email delivery failed — try resend',
      );
    }
  }
}
