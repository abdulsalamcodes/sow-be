import { Controller, Get, Post, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { WalletService } from './wallet.service.js';
import { UsersService } from '../users/users.service.js';
import { KycService } from '../kyc/kyc.service.js';
import { MonnifyError } from '../monnify/monnify-error.js';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
    private readonly kycService: KycService,
  ) {}

  @Get()
  getWallet(@CurrentUser('id') userId: string) {
    return this.walletService.getWallet(userId);
  }

  @Post()
  async createWallet(@CurrentUser('id') userId: string) {
    const existingWallet = await this.walletService.exists(userId);
    if (existingWallet) {
      throw new BadRequestException('Wallet already exists');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const kyc = await this.kycService.getStatus(userId).catch(() => null);
    if (!kyc?.bvn) {
      throw new BadRequestException('Submit your BVN before creating a wallet');
    }

    try {
      await this.walletService.createVirtualAccount(user, kyc);
      return this.walletService.getWallet(userId);
    } catch (error) {
      if (error instanceof MonnifyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
