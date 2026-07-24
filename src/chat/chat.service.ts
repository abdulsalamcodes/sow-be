import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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
import { WalletService } from '../wallet/wallet.service.js';
import { KycService } from '../kyc/kyc.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { BanksService } from '../banks/banks.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

const TITLE_MAX_LENGTH = 60;
const MAX_TOOL_ITERATIONS = 10;
const MAX_HISTORY_MESSAGES = 30;
const MAX_TOOL_FAILURES_PER_NAME = 2;
const TOOL_RESULT_MAX_CHARS = 3000;
const COMPACTION_THRESHOLD = 10; // summarise overflow only when it's significant

/** Tools relevant to each intent — keeps context window lean */
const INTENT_TOOL_SET: Partial<Record<string, string[]>> = {
  send_money: ['create-transfer-intent', 'list-banks', 'get-wallet-balance'],
  pay_bill: [
    'list-biller-categories',
    'list-billers',
    'list-products',
    'validate-customer',
    'pay-bill',
    'get-wallet-balance',
  ],
  financial_analysis: [
    'get-spending-summary',
    'get-spending-by-category',
    'check-affordability',
    'get-budget-analysis',
    'get-wallet-balance',
    'get-transactions',
  ],
  get_transactions: ['get-transactions'],
  create_wallet: ['create-wallet', 'submit-kyc'],
  fund_wallet: ['get-wallet-balance', 'get-funding-details'],
};

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
    private readonly walletService: WalletService,
    private readonly kycService: KycService,
    private readonly analyticsService: AnalyticsService,
    private readonly banksService2: BanksService,
  ) {}

  async reply(
    userId: string,
    dto: SendMessageDto,
  ): Promise<{
    text: string;
    conversationId: string;
    preview?: Record<string, unknown>;
  }> {
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

    const rawText = await this.routeByIntent(
      userId,
      conversation,
      dto.message,
      intent,
    );

    const text = this.stripXmlTags(rawText);
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
      conversationId: conversation.id,
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

    if (intent.type === 'create_wallet') {
      return this.handleCreateWallet(userId, userMessage);
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
      const text = await this.runAgent(
        userId,
        conversation,
        intent.type,
        sendMoneyContext,
      );
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
      return this.runAgent(
        userId,
        conversation,
        intent.type,
        undefined,
        payBillContext,
      );
    }

    return this.runAgent(userId, conversation, intent.type);
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

  private async handleCreateWallet(
    userId: string,
    userMessage: string,
  ): Promise<string> {
    const bvn = this.extractBvn(userMessage);
    if (bvn) {
      try {
        await this.kycService.submitKyc(userId, { bvn });
        const wallet = await this.walletService.createWallet(userId);
        const naira = Number(wallet.balanceKobo) / 100;
        return `Your wallet is ready. Account: ${wallet.bankName} ${wallet.accountNumber}, Balance: ₦${naira.toLocaleString('en-NG')}`;
      } catch (error) {
        const message =
          error instanceof BadRequestException
            ? error.message
            : 'Could not create your wallet. Please try again.';
        return message;
      }
    }

    try {
      const wallet = await this.walletService.createWallet(userId);
      const naira = Number(wallet.balanceKobo) / 100;
      return `Your wallet is ready. Account: ${wallet.bankName} ${wallet.accountNumber}, Balance: ₦${naira.toLocaleString('en-NG')}`;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return error.message;
      }
      return 'Could not create your wallet. Please try again.';
    }
  }

  private stripXmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  private extractBvn(text: string): string | null {
    const match = text.match(/(?<!\d)\d{11}(?!\d)/);
    return match ? match[0] : null;
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
    intentType?: string,
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
    const allDbMessages = await this.messageRepository.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });

    const overflowMessages =
      allDbMessages.length > MAX_HISTORY_MESSAGES
        ? allDbMessages.slice(0, -MAX_HISTORY_MESSAGES)
        : [];

    if (overflowMessages.length > 0) {
      this.logger.warn({
        event: 'context_truncated',
        total: allDbMessages.length,
        kept: MAX_HISTORY_MESSAGES,
        conversationId: conversation.id,
      });
    }

    const dbMessages = allDbMessages.slice(-MAX_HISTORY_MESSAGES);

    // Improvement 1: richer state — balance + beneficiaries + weekly spending
    const [state, beneficiaries, weeklySpend] = await Promise.all([
      this.stateInjector.gather(userId),
      this.banksService2.listBeneficiaries(userId).catch(() => []),
      this.analyticsService
        .getSpendingSummary(userId, 'week')
        .catch(() => null),
    ]);
    const pendingAction = await this.fetchPendingAction(userId);
    const stateText = this.stateInjector.format(state, pendingAction);

    const systemParts = [
      SOW_INSTRUCTIONS,
      '',
      'Current user state:',
      stateText,
    ];

    if (beneficiaries.length > 0) {
      systemParts.push(
        '',
        'Saved beneficiaries (use to resolve names without calling list-banks):',
      );
      for (const b of beneficiaries) {
        systemParts.push(
          `  - ${b.name}: ${b.accountNumber} (${b.bankName ?? 'unknown bank'}, code: ${b.bankCode})`,
        );
      }
    }

    if (weeklySpend) {
      const spentNaira = (weeklySpend.totalSpentKobo / 100).toLocaleString(
        'en-NG',
        { minimumFractionDigits: 2 },
      );
      const receivedNaira = (
        weeklySpend.totalReceivedKobo / 100
      ).toLocaleString('en-NG', { minimumFractionDigits: 2 });
      systemParts.push(
        '',
        `This week: spent ₦${spentNaira}, received ₦${receivedNaira} (${weeklySpend.transactionCount} transactions).`,
      );
    }

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

    // Improvement 2: context compaction — summarise overflow instead of silently dropping it
    const compactionPart =
      overflowMessages.length >= COMPACTION_THRESHOLD
        ? await this.compactMessages(overflowMessages)
        : null;

    const lmlMessages: LmlMessage[] = [
      {
        role: 'system',
        content: systemParts.join('\n'),
      },
      ...(compactionPart
        ? [{ role: 'system' as const, content: compactionPart }]
        : []),
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
    // Improvement 3: tool routing — only send tools relevant to this intent
    const lmlTools = this.buildLmlToolDefinitions(intentType);
    const toolFailureCounts = new Map<string, number>();

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

      let circuitOpen = false;
      for (const toolCall of response.toolCalls) {
        const resultMessage = await this.executeToolCall(userId, toolCall);
        this.logger.log({
          event: 'agent_tool_result',
          tool: toolCall.name,
          resultPreview: resultMessage.content?.slice(0, 200),
        });
        lmlMessages.push(resultMessage);

        // Circuit breaker: if the same tool keeps failing, stop calling tools
        const resultBody = JSON.parse(resultMessage.content || '{}') as Record<
          string,
          unknown
        >;
        if (resultBody.error) {
          const failures = (toolFailureCounts.get(toolCall.name) ?? 0) + 1;
          toolFailureCounts.set(toolCall.name, failures);
          if (failures >= MAX_TOOL_FAILURES_PER_NAME) {
            this.logger.warn({
              event: 'tool_circuit_breaker',
              tool: toolCall.name,
              failures,
            });
            circuitOpen = true;
          }
        }
      }

      if (circuitOpen) {
        // Ask the LLM for a final answer without tools, so it can explain the failure
        const finalResponse = await this.lmlClient.chat(lmlMessages);
        return finalResponse.content;
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
      // Improvement 4: truncate large results to avoid context bloat
      let content = JSON.stringify(result);
      if (content.length > TOOL_RESULT_MAX_CHARS) {
        content = content.slice(0, TOOL_RESULT_MAX_CHARS) + '…[truncated]';
        this.logger.warn({
          event: 'tool_result_truncated',
          tool: toolCall.name,
        });
      }
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content,
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

  private allLmlToolDefinitions: LmlToolDefinition[] | null = null;

  private buildLmlToolDefinitions(intentType?: string): LmlToolDefinition[] {
    if (!this.allLmlToolDefinitions) {
      this.allLmlToolDefinitions = this.toolDefinitions.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: toJsonSchema(tool.inputSchema),
        },
      }));
    }

    const allowedNames = intentType ? INTENT_TOOL_SET[intentType] : undefined;
    if (!allowedNames) return this.allLmlToolDefinitions;

    return this.allLmlToolDefinitions.filter((t) =>
      allowedNames.includes(t.function.name),
    );
  }

  /** Summarise overflow messages into a compact system block to preserve long-term context. */
  private async compactMessages(messages: Message[]): Promise<string> {
    try {
      const lines = messages
        .filter(
          (m) =>
            m.role === MessageRole.USER || m.role === MessageRole.ASSISTANT,
        )
        .map(
          (m) =>
            `${m.role === MessageRole.USER ? 'User' : 'Assistant'}: ${m.content}`,
        )
        .join('\n');

      const summary = await this.lmlClient.chat([
        {
          role: 'system',
          content:
            'Summarise this conversation history in 3-5 bullet points for a Nigerian financial assistant. Focus on: what the user asked, what actions were taken, what was resolved. Be concise.',
        },
        { role: 'user', content: lines },
      ]);
      return `Earlier conversation summary:\n${summary.content}`;
    } catch {
      // Non-critical — if summarisation fails, proceed without it
      return '';
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
      this.messageRepository.create({
        conversationId,
        role,
        content,
        toolCalled,
      }),
    );
  }
}
