import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestContext } from '@mastra/core/request-context';
import type { Agent } from '@mastra/core/agent';
import type { Response } from 'express';
import { Conversation } from '../entities/conversation.entity.js';
import { Message, MessageRole } from '../entities/message.entity.js';
import { SOW_AGENT } from '../ai/ai.constants.js';
import { USER_ID_KEY } from '../ai/runtime-context.js';
import { SendMessageDto } from './dto/send-message.dto.js';

const TITLE_MAX_LENGTH = 60;

interface StreamAccumulator {
  text: string;
  lastToolName: string | null;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(SOW_AGENT)
    private readonly agent: Agent,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async streamReply(userId: string, dto: SendMessageDto, response: Response): Promise<void> {
    const conversation = await this.loadOrCreateConversation(userId, dto);
    await this.saveMessage(conversation.id, MessageRole.USER, dto.message, null);

    this.openEventStream(response);
    const accumulator = await this.streamAgent(userId, conversation.id, dto.message, response);

    await this.saveMessage(
      conversation.id,
      MessageRole.ASSISTANT,
      accumulator.text,
      accumulator.lastToolName,
    );
    response.end();
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getMessages(userId: string, conversationId: string): Promise<Message[]> {
    await this.loadOwnedConversation(userId, conversationId);
    return this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  private async streamAgent(
    userId: string,
    conversationId: string,
    message: string,
    response: Response,
  ): Promise<StreamAccumulator> {
    const requestContext = new RequestContext([[USER_ID_KEY, userId]]);
    const output = await this.agent.stream(message, {
      memory: { thread: conversationId, resource: userId },
      requestContext,
    });

    const accumulator: StreamAccumulator = { text: '', lastToolName: null };
    const reader = output.fullStream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        this.accumulate(accumulator, value);
        response.write(`data: ${JSON.stringify(value)}\n\n`);
      }
    } catch (error) {
      this.logger.error('Agent stream failed', error as Error);
      response.write(`event: error\ndata: "stream failed"\n\n`);
    }
    return accumulator;
  }

  private accumulate(
    accumulator: StreamAccumulator,
    chunk: { type: string; payload?: unknown },
  ): void {
    if (chunk.type === 'text-delta') {
      accumulator.text += (chunk.payload as { text: string }).text;
      return;
    }
    if (chunk.type === 'tool-call') {
      accumulator.lastToolName = (chunk.payload as { toolName: string }).toolName;
    }
  }

  private async loadOrCreateConversation(
    userId: string,
    dto: SendMessageDto,
  ): Promise<Conversation> {
    if (dto.conversationId) {
      return this.loadOwnedConversation(userId, dto.conversationId);
    }
    return this.conversationRepository.save(
      this.conversationRepository.create({
        userId,
        title: dto.message.slice(0, TITLE_MAX_LENGTH),
      }),
    );
  }

  private async loadOwnedConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private async saveMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    toolCalled: string | null,
  ): Promise<void> {
    await this.messageRepository.save(
      this.messageRepository.create({ conversationId, role, content, toolCalled }),
    );
  }

  private openEventStream(response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
  }
}
