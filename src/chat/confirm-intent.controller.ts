import { Controller, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { IntentsService } from '../intents/intents.service.js';
import { IntentIdParam } from './dto/intent-id.param.js';

@UseGuards(JwtAuthGuard)
@Controller('chat/intents')
export class ConfirmIntentController {
  constructor(private readonly intentsService: IntentsService) {}

  @Post(':intentId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser('id') userId: string, @Param() params: IntentIdParam) {
    return this.intentsService.confirm(userId, params.intentId);
  }

  @Post(':intentId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser('id') userId: string, @Param() params: IntentIdParam) {
    return this.intentsService.cancel(userId, params.intentId);
  }
}
