import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [ContractsModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
