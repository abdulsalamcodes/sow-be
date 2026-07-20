import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import { OtpService } from './otp.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import { User } from '../entities/user.entity.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
    });

    await this.sendVerificationEmail(user.id, user.email);

    return this.generateTokens(user);
  }

  async verifyEmail(userId: string, code: string): Promise<{ emailVerified: true }> {
    await this.otpService.verifyOtp(userId, code);
    return { emailVerified: true };
  }

  async resendOtp(userId: string): Promise<{ sent: true }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.otpService.issueOtp(user.id, user.email);
    return { sent: true };
  }

  // Email delivery must never block signup (SPEC.md: non-blocking soft gate).
  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    try {
      await this.otpService.issueOtp(userId, email);
    } catch (error) {
      this.logger.error(`Failed to send verification OTP to ${email}`, error as Error);
    }
  }

  async login(user: User) {
    return this.generateTokens(user);
  }

  async googleLogin(user: User) {
    return this.generateTokens(user);
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException();
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRY', '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d') as any,
      }),
    ]);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      accessToken,
      refreshToken,
    };
  }
}
