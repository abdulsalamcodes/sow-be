import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../entities/wallet.entity.js';
import { Kyc } from '../entities/kyc.entity.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Kyc])],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
