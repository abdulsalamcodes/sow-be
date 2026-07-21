import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Beneficiary } from '../entities/beneficiary.entity.js';
import { BanksService } from './banks.service.js';
import { BanksController } from './banks.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Beneficiary])],
  providers: [BanksService],
  exports: [BanksService],
  controllers: [BanksController],
})
export class BanksModule {}
