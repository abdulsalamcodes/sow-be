import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../../entities/wallet.entity.js';
import { Transaction } from '../../entities/transaction.entity.js';
import { Bill } from '../../entities/bill.entity.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction, Bill])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
