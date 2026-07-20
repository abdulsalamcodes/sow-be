import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomInt } from 'node:crypto';
import { EmailOtp } from '../entities/email-otp.entity.js';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

const CODE_EXPIRED_MESSAGE = 'Code expired — request a new one';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(EmailOtp)
    private readonly otpRepository: Repository<EmailOtp>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async issueOtp(userId: string, email: string): Promise<void> {
    const existing = await this.otpRepository.findOne({ where: { userId } });
    if (existing && this.isWithinCooldown(existing.lastSentAt)) {
      throw new ConflictException('Wait before requesting another code');
    }

    const code = this.generateCode();
    await this.otpRepository.save({
      ...(existing ?? {}),
      userId,
      codeHash: this.hashCode(code),
      expiresAt: this.buildExpiry(),
      attemptCount: 0,
      lastSentAt: new Date(),
    });

    await this.mailService.sendOtpEmail(email, code);
  }

  async verifyOtp(userId: string, code: string): Promise<void> {
    const otp = await this.otpRepository.findOne({ where: { userId } });
    if (!otp || this.isExpired(otp.expiresAt)) {
      throw new BadRequestException(CODE_EXPIRED_MESSAGE);
    }

    if (otp.attemptCount >= MAX_VERIFY_ATTEMPTS) {
      await this.otpRepository.remove(otp);
      throw new BadRequestException(CODE_EXPIRED_MESSAGE);
    }

    if (otp.codeHash !== this.hashCode(code)) {
      otp.attemptCount += 1;
      await this.otpRepository.save(otp);
      throw new BadRequestException('Incorrect code');
    }

    await this.usersService.markEmailVerified(userId);
    await this.otpRepository.remove(otp);
  }

  private generateCode(): string {
    const max = 10 ** OTP_LENGTH;
    return randomInt(0, max).toString().padStart(OTP_LENGTH, '0');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private buildExpiry(): Date {
    return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  }

  private isExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= Date.now();
  }

  private isWithinCooldown(lastSentAt: Date): boolean {
    const elapsedSeconds = (Date.now() - lastSentAt.getTime()) / 1000;
    return elapsedSeconds < RESEND_COOLDOWN_SECONDS;
  }
}
