import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../entities/conversation.entity.js';
import { Message } from '../entities/message.entity.js';
import { TransactionIntent } from '../entities/transaction-intent.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { AiModule } from '../ai/ai.module.js';
import { IntentsModule } from '../intents/intents.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { KycModule } from '../kyc/kyc.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { BanksModule } from '../banks/banks.module.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { ConfirmIntentController } from './confirm-intent.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, TransactionIntent]),
    AuthModule,
    AiModule,
    IntentsModule,
    ContractsModule,
    WalletModule,
    KycModule,
    AnalyticsModule,
    BanksModule,
  ],
  providers: [ChatService],
  controllers: [ChatController, ConfirmIntentController],
})
export class ChatModule {}
