import { Controller, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { IntentsService } from '../intents/intents.service.js';
import { TransactionIntent } from '../entities/transaction-intent.entity.js';
import { Message, MessageRole } from '../entities/message.entity.js';
import { IntentIdParam } from './dto/intent-id.param.js';
import { SubmitOtpDto } from './dto/submit-otp.dto.js';
import type { IntentExecutionResult } from '../intents/intents.types.js';

const outcomeText = (result: { status: string; reference?: string; failureReason?: string }): string => {
  if (result.status === 'EXECUTED' || result.status === 'CANCELLED') {
    return `Transfer ${result.status === 'CANCELLED' ? 'cancelled' : 'sent'}. Reference: ${result.reference}`;
  }
  if (result.status === 'FAILED') {
    return `Transfer failed: ${result.failureReason}`;
  }
  if (result.status === 'PENDING_OTP') {
    return 'OTP required. Check your phone for the code.';
  }
  return 'Transfer cancelled.';
};

@UseGuards(JwtAuthGuard)
@Controller('chat/intents')
export class ConfirmIntentController {
  constructor(
    private readonly intentsService: IntentsService,
    @InjectRepository(TransactionIntent)
    private readonly intentRepository: Repository<TransactionIntent>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  @Post(':intentId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser('id') userId: string, @Param() params: IntentIdParam) {
    const result = await this.intentsService.confirm(userId, params.intentId);
    await this.saveOutcomeMessage(params.intentId, result);
    return result;
  }

  @Post(':intentId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser('id') userId: string, @Param() params: IntentIdParam) {
    const result = await this.intentsService.cancel(userId, params.intentId);
    await this.saveOutcomeMessage(params.intentId, { status: 'CANCELLED', reference: params.intentId.slice(0, 8) });
    return result;
  }

  @Post(':intentId/otp')
  @HttpCode(HttpStatus.OK)
  async submitOtp(
    @CurrentUser('id') userId: string,
    @Param() params: IntentIdParam,
    @Body() dto: SubmitOtpDto,
  ) {
    const result = await this.intentsService.submitOtp(userId, params.intentId, dto.otp);
    await this.saveOutcomeMessage(params.intentId, result);
    return result;
  }

  private async saveOutcomeMessage(
    intentId: string,
    outcome: { status: string; reference?: string; failureReason?: string },
  ): Promise<void> {
    const intent = await this.intentRepository.findOne({
      where: { id: intentId },
      select: { id: true, conversationId: true },
    });
    if (!intent?.conversationId) return;

    await this.messageRepository.save(
      this.messageRepository.create({
        conversationId: intent.conversationId,
        role: MessageRole.ASSISTANT,
        content: outcomeText(outcome),
        toolCalled: null,
      }),
    );
  }
}
