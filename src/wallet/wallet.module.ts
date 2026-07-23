import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../entities/wallet.entity.js';
import { Kyc } from '../entities/kyc.entity.js';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { KycModule } from '../kyc/kyc.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Kyc]), KycModule, UsersModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

