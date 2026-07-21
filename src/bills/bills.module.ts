import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction } from '../entities/transaction.entity.js';
import { Bill } from '../entities/bill.entity.js';
import { BillsService } from './bills.service.js';
import { BillsController } from './bills.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction, Bill])],
  providers: [BillsService],
  exports: [BillsService],
  controllers: [BillsController],
})
export class BillsModule {}
