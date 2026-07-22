import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service.js';

@Controller('monnify/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  async handleWebhook(@Req() req: Request): Promise<{ status: string }> {
    const signature = req.headers['monnify-signature'] as string;
    const rawBody = req.body as Buffer;

    this.webhooksService.verifySignature(rawBody, signature);
    const payload = JSON.parse(rawBody.toString('utf-8'));
    await this.webhooksService.handleEvent(payload);

    return { status: 'ok' };
  }
}
