import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BanksService } from './banks.service.js';

export class CreateBeneficiaryDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(10, 10)
  @Matches(/^\d{10}$/)
  accountNumber!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^\d{3}$/)
  bankCode!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get('beneficiaries')
  listBeneficiaries(@CurrentUser('id') userId: string) {
    return this.banksService.listBeneficiaries(userId);
  }

  @Post('beneficiaries')
  createBeneficiary(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBeneficiaryDto,
  ) {
    return this.banksService.createBeneficiary(userId, dto);
  }

  @Delete('beneficiaries/:id')
  deleteBeneficiary(
    @CurrentUser('id') userId: string,
    @Param('id') beneficiaryId: string,
  ) {
    return this.banksService.deleteBeneficiary(userId, beneficiaryId).then(() => ({ deleted: true }));
  }

  @Get('list')
  listBanks() {
    return this.banksService['monnify'].get<{ list: Array<{ bankCode: string; bankName: string }> }>(
      '/api/v1/banks',
    );
  }
}
