import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { MonnifyModule } from './monnify/monnify.module';
import { WebhooksModule } from './monnify/webhooks/webhooks.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentsModule } from './payments/payments.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BanksModule } from './banks/banks.module';
import { KycModule } from './kyc/kyc.module';
import { BillsModule } from './bills/bills.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService),
    }),
    AuthModule,
    ChatModule,
    MonnifyModule,
    WebhooksModule,
    WalletModule,
    PaymentsModule,
    TransactionsModule,
    BanksModule,
    KycModule,
    BillsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
