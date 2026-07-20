import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import {
  JwtAuthGuard,
  GoogleAuthGuard,
  LocalAuthGuard,
} from './guards/auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { User } from '../entities/user.entity.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() _dto: LoginDto, @CurrentUser() user: User) {
    return this.authService.login(user);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@CurrentUser() user: User) {
    const tokens = await this.authService.googleLogin(user);
    const clientUrl = this.configService.get<string>(
      'CLIENT_URL',
      'http://localhost:3000',
    );
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return { url: `${clientUrl}/auth/callback?${params.toString()}`, ...tokens };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(userId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@CurrentUser('id') userId: string) {
    return this.authService.resendOtp(userId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshTokens(refreshToken);
  }
}
