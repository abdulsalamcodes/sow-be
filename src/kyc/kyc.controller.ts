import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { KycService } from './kyc.service.js';

class SubmitKycDto {
  @IsString()
  @Length(11, 11)
  @Matches(/^\d{11}$/)
  bvn!: string;

  @IsOptional()
  @IsString()
  @Length(11, 11)
  @Matches(/^\d{11}$/)
  nin?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @UseGuards(EmailVerifiedGuard)
  async submitKyc(
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitKycDto,
  ) {
    await this.kycService.submitKyc(userId, dto);
    return { status: 'PENDING' };
  }

  @Get('status')
  getStatus(@CurrentUser('id') userId: string) {
    return this.kycService.getStatus(userId);
  }
}
