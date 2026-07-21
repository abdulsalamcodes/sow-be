import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction } from '../entities/transaction.entity.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction])],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
