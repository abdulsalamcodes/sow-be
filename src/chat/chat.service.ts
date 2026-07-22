import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity.js';
import { Message, MessageRole } from '../entities/message.entity.js';
import {
  LmlClient,
  type LmlMessage,
  type LmlToolDefinition,
} from '../ai/llm-client.js';
import { SOW_AGENT } from '../ai/ai.constants.js';
import { SOW_INSTRUCTIONS } from '../ai/agent.js';
import { type ToolDefinition, toJsonSchema } from '../ai/tools/index.js';
import { IntentClassifier } from '../ai/intent-classifier.js';
import { StateInjector, type PendingAction } from '../ai/state-injector.js';
import { IntentsService } from '../intents/intents.service.js';
import {
  BANKS_SERVICE,
  type BanksServiceContract,
} from '../contracts/financial-services.js';
import { SendMessageDto } from './dto/send-message.dto.js';

const TITLE_MAX_LENGTH = 60;
const MAX_TOOL_ITERATIONS = 10;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private currentConversationId: string | null = null;

  constructor(
    private readonly lmlClient: LmlClient,
    @Inject(SOW_AGENT)
    private readonly toolDefinitions: ToolDefinition[],
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly intentClassifier: IntentClassifier,
    private readonly stateInjector: StateInjector,
    private readonly intentsService: IntentsService,
    @Inject(BANKS_SERVICE)
    private readonly banksService: BanksServiceContract,
  ) {}

  async reply(
    userId: string,
    dto: SendMessageDto,
  ): Promise<{ text: string; preview?: Record<string, unknown> }> {
    const startTime = Date.now();

    this.logger.log({
      event: 'chat_reply_start',
      messageLength: dto.message.length,
    });

    const conversation = await this.loadOrCreateConversation(userId, dto);
    await this.saveMessage(
      conversation.id,
      MessageRole.USER,
      dto.message,
      null,
    );

    const intent = await this.intentClassifier.classify(dto.message);

    this.logger.log({
      event: 'intent_classified',
      intent: intent.type,
      confidence: intent.confidence,
    });

    const text = await this.routeByIntent(
      userId,
      conversation,
      dto.message,
      intent,
    );

    const pendingAction = await this.fetchPendingAction(userId);

    const duration = Date.now() - startTime;
    this.logger.log({
      event: 'chat_reply_end',
      duration,
      conversationId: conversation.id,
      intent: intent.type,
    });

    if (text) {
      await this.saveMessage(
        conversation.id,
        MessageRole.ASSISTANT,
        text,
        null,
      );
    }

    const preview = pendingAction
      ? {
          intentId: pendingAction.intentId,
          summary: pendingAction.summary,
          amountKobo: pendingAction.amountKobo,
          recipientAccountName: pendingAction.recipientAccountName,
          expiresAt: pendingAction.expiresAt.toISOString(),
        }
      : undefined;

    return {
      text: text || 'Sorry, I could not complete that request.',
      preview,
    };
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getMessages(
    userId: string,
    conversationId: string,
  ): Promise<Message[]> {
    await this.loadOwnedConversation(userId, conversationId);
    return this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  private async routeByIntent(
    userId: string,
    conversation: Conversation,
    userMessage: string,
    intent: {
      type: string;
      amountKobo?: number;
      accountNumber?: string;
      bankName?: string;
      beneficiaryName?: string;
      billType?: string;
      customerId?: string;
      provider?: string;
    },
  ): Promise<string> {
    if (intent.type === 'check_balance') {
      return this.buildBalanceResponse(userId);
    }

    if (intent.type === 'confirm_transfer') {
      return this.confirmPendingAction(userId);
    }

    if (intent.type === 'cancel_transfer') {
      return this.cancelPendingAction(userId);
    }

    if (intent.type === 'send_money') {
      const sendMoneyContext = intent as {
        type: string;
        amountKobo?: number;
        accountNumber?: string;
        bankName?: string;
        beneficiaryName?: string;
      };
      const text = await this.runAgent(userId, conversation, sendMoneyContext);
      await this.ensureTransferIntent(
        userId,
        conversation.id,
        sendMoneyContext,
      );
      return text;
    }

    if (intent.type === 'pay_bill') {
      const payBillContext = {
        amountKobo: intent.amountKobo,
        billType: intent.billType,
        customerId: intent.customerId,
        provider: intent.provider,
      };
      return this.runAgent(userId, conversation, undefined, payBillContext);
    }

    return this.runAgent(userId, conversation);
  }

  private async buildBalanceResponse(userId: string): Promise<string> {
    try {
      const state = await this.stateInjector.gather(userId);
      if (state.walletBalanceKobo) {
        const naira = Number(state.walletBalanceKobo) / 100;
        const formatted = naira.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
        });
        return `Your wallet balance is ₦${formatted}.`;
      }
      return "You don't have an active wallet. Please link your bank account to proceed.";
    } catch {
      return "I couldn't fetch your balance right now. Please try again.";
    }
  }

  private buildSendMoneyContext(intent: {
    amountKobo?: number;
    accountNumber?: string;
    bankName?: string;
    beneficiaryName?: string;
  }): string {
    const parts: string[] = [];
    if (intent.amountKobo) {
      const naira = intent.amountKobo / 100;
      const formatted = naira.toLocaleString('en-NG');
      parts.push(`Amount: ₦${formatted}`);
    }
    if (intent.accountNumber) {
      parts.push(`Account: ${intent.accountNumber}`);
    }
    if (intent.bankName) {
      parts.push(`Bank: ${intent.bankName}`);
    }
    if (intent.beneficiaryName) {
      parts.push(`Beneficiary: ${intent.beneficiaryName}`);
    }
    return parts.join(', ');
  }

  private async confirmPendingAction(userId: string): Promise<string> {
    const pendingAction = await this.fetchPendingAction(userId);
    if (!pendingAction) {
      return 'You have no pending transfer to confirm.';
    }

    try {
      const result = await this.intentsService.confirm(
        userId,
        pendingAction.intentId,
      );
      if (result.status === 'EXECUTED') {
        return `Transfer complete. Reference: ${result.reference}`;
      }
      return `Transfer failed: ${result.failureReason ?? 'Unknown error'}`;
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Could not confirm the transfer';
    }
  }

  private async cancelPendingAction(userId: string): Promise<string> {
    const pendingAction = await this.fetchPendingAction(userId);
    if (!pendingAction) {
      return 'You have no pending transfer to cancel.';
    }

    try {
      await this.intentsService.cancel(userId, pendingAction.intentId);
      return 'The transfer has been cancelled.';
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Could not cancel the transfer';
    }
  }

  private async ensureTransferIntent(
    userId: string,
    conversationId: string,
    context: {
      amountKobo?: number;
      accountNumber?: string;
      bankName?: string;
      beneficiaryName?: string;
    },
  ): Promise<void> {
    const existing = await this.fetchPendingAction(userId);
    if (existing) return;

    if (context.beneficiaryName) {
      try {
        await this.intentsService.createTransferIntent(userId, {
          amountKobo: context.amountKobo!,
          recipientName: context.beneficiaryName,
          narration: 'Sow transfer',
          conversationId,
        });
      } catch {
        /* agent already handled the error */
      }
      return;
    }

    if (!context.amountKobo || !context.accountNumber || !context.bankName) {
      return;
    }

    try {
      const allBanks = (await this.banksService.listBanks()) ?? [];
      const q = context.bankName.toLowerCase();
      const match =
        allBanks.find(
          (b) => b.bankName.toLowerCase().includes(q) || b.bankCode.includes(q),
        ) ?? allBanks.find((b) => q.includes(b.bankName.toLowerCase()));
      if (!match) return;

      await this.intentsService.createTransferIntent(userId, {
        amountKobo: context.amountKobo,
        accountNumber: context.accountNumber,
        bankCode: match.bankCode,
        narration: 'Sow transfer',
        conversationId,
      });
    } catch {
      /* agent already handled the error or LLM already responded */
    }
  }

  private async fetchPendingAction(
    userId: string,
  ): Promise<PendingAction | null> {
    try {
      return await this.intentsService.findPendingIntent(userId);
    } catch {
      return null;
    }
  }

  private async runAgent(
    userId: string,
    conversation: Conversation,
    sendMoneyContext?: {
      amountKobo?: number;
      accountNumber?: string;
      bankName?: string;
      beneficiaryName?: string;
    },
    payBillContext?: {
      amountKobo?: number;
      billType?: string;
      customerId?: string;
      provider?: string;
    },
  ): Promise<string> {
    const dbMessages = await this.messageRepository.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });

    const state = await this.stateInjector.gather(userId);
    const pendingAction = await this.fetchPendingAction(userId);
    const stateText = this.stateInjector.format(state, pendingAction);

    const systemParts = [
      SOW_INSTRUCTIONS,
      '',
      'Current user state:',
      stateText,
    ];

    if (sendMoneyContext) {
      const contextLine = this.buildSendMoneyContext(sendMoneyContext);
      systemParts.push('', 'Parsed transfer details:', contextLine);
    }

    if (payBillContext) {
      const parts: string[] = [];
      if (payBillContext.amountKobo) {
        const naira = payBillContext.amountKobo / 100;
        parts.push(`Amount: ₦${naira.toLocaleString('en-NG')}`);
      }
      if (payBillContext.billType)
        parts.push(`Type: ${payBillContext.billType}`);
      if (payBillContext.customerId)
        parts.push(`Customer: ${payBillContext.customerId}`);
      if (payBillContext.provider)
        parts.push(`Provider: ${payBillContext.provider}`);
      systemParts.push('', 'Parsed bill payment details:', parts.join(', '));
    }

    const lmlMessages: LmlMessage[] = [
      {
        role: 'system',
        content: systemParts.join('\n'),
      },
      ...dbMessages.map((message) => {
        if (message.role === MessageRole.TOOL) {
          return {
            role: 'tool' as const,
            content: message.content,
            tool_call_id: message.toolCalled ?? '',
          };
        }
        return {
          role: (message.role === MessageRole.USER ? 'user' : 'assistant') as
            'user' | 'assistant',
          content: message.content,
        };
      }),
    ];

    this.currentConversationId = conversation.id;
    const lmlTools = this.buildLmlToolDefinitions();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.lmlClient.chat(lmlMessages, lmlTools);

      this.logger.log({
        event: 'agent_iteration',
        iteration,
        toolCalls: response.toolCalls.map((tc) => tc.name),
        responseContent: response.content?.slice(0, 120),
      });

      if (response.toolCalls.length === 0) {
        return response.content;
      }

      lmlMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
      });

      for (const toolCall of response.toolCalls) {
        const resultMessage = await this.executeToolCall(userId, toolCall);
        this.logger.log({
          event: 'agent_tool_result',
          tool: toolCall.name,
          resultPreview: resultMessage.content?.slice(0, 200),
        });
        lmlMessages.push(resultMessage);
      }
    }

    return '';
  }

  private async executeToolCall(
    userId: string,
    toolCall: { id: string; name: string; arguments: string },
  ): Promise<LmlMessage> {
    const tool = this.findTool(toolCall.name);
    if (!tool) {
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          error: `Unknown tool "${toolCall.name}"`,
        }),
      };
    }

    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(toolCall.arguments);
      input = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<
        string,
        unknown
      >;
    } catch {
      input = {};
    }

    const parseResult = tool.inputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          error: `Invalid parameters: ${parseResult.error.message}`,
        }),
      };
    }

    try {
      const result = await tool.execute(
        userId,
        parseResult.data as Record<string, unknown>,
      );
      if (
        toolCall.name === 'create-transfer-intent' &&
        this.currentConversationId
      ) {
        const intentId = (result as Record<string, unknown>)?.intentId;
        if (typeof intentId === 'string') {
          await this.intentsService.attachConversation(
            intentId,
            this.currentConversationId,
          );
        }
      }
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      };
    } catch (error) {
      this.logger.error(
        `Tool ${toolCall.name} execution error`,
        error instanceof Error ? error.stack : error,
      );
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          error:
            error instanceof Error ? error.message : 'Tool execution failed',
        }),
      };
    }
  }

  private findTool(name: string): ToolDefinition | undefined {
    return this.toolDefinitions.find((tool) => tool.name === name);
  }

  private lmlToolDefinitions: LmlToolDefinition[] | null = null;

  private buildLmlToolDefinitions(): LmlToolDefinition[] {
    if (!this.lmlToolDefinitions) {
      this.lmlToolDefinitions = this.toolDefinitions.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: toJsonSchema(tool.inputSchema),
        },
      }));
    }
    return this.lmlToolDefinitions;
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
      throw new Error('Conversation not found');
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
      this.messageRepository.create({
        conversationId,
        role,
        content,
        toolCalled,
      }),
    );
  }
}
