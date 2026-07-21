import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestContext } from '@mastra/core/request-context';
import type { Agent } from '@mastra/core/agent';
import { Conversation } from '../entities/conversation.entity.js';
import { Message, MessageRole } from '../entities/message.entity.js';
import { SOW_AGENT } from '../ai/ai.constants.js';
import { USER_ID_KEY } from '../ai/runtime-context.js';
import { SendMessageDto } from './dto/send-message.dto.js';

const TITLE_MAX_LENGTH = 60;

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

  async reply(userId: string, dto: SendMessageDto): Promise<{ text: string }> {
    const conversation = await this.loadOrCreateConversation(userId, dto);
    await this.saveMessage(conversation.id, MessageRole.USER, dto.message, null);

    const text = await this.runAgent(userId, conversation.id, dto.message);

    await this.saveMessage(conversation.id, MessageRole.ASSISTANT, text, null);
    return { text };
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

  private async runAgent(
    userId: string,
    conversationId: string,
    message: string,
  ): Promise<string> {
    const requestContext = new RequestContext([[USER_ID_KEY, userId]]);
    const output = await this.agent.stream(message, {
      memory: { thread: conversationId, resource: userId },
      requestContext,
    });

    let text = '';
    try {
      for await (const chunk of output.fullStream) {
        if (chunk.type === 'text-delta') {
          text += (chunk.payload as { text: string }).text;
        }
      }
    } catch (error) {
      this.logger.error('Agent run failed', error as Error);
    }
    return text;
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

}
