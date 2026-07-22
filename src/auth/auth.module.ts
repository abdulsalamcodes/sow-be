import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { EmailVerifiedGuard } from './guards/email-verified.guard.js';
import { EmailOtp } from '../entities/email-otp.entity.js';
import { UsersModule } from '../users/users.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([EmailOtp]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRY', '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    GoogleStrategy,
    LocalStrategy,
    EmailVerifiedGuard,
  ],
  exports: [AuthService, EmailVerifiedGuard, UsersModule],
})
export class AuthModule {}
