import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction } from '../entities/transaction.entity.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction])],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
