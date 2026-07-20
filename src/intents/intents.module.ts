import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionIntent } from '../entities/transaction-intent.entity.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { IntentsService } from './intents.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionIntent]), ContractsModule],
  providers: [IntentsService],
  exports: [IntentsService],
})
export class IntentsModule {}
