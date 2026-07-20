import { Controller, Post, Get, Body, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ChatService } from './chat.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.chatService.streamReply(userId, dto, response);
  }

  @Get('conversations')
  listConversations(@CurrentUser('id') userId: string) {
    return this.chatService.listConversations(userId);
  }

  @Get('conversations/:conversationId/messages')
  getMessages(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.getMessages(userId, conversationId);
  }
}
