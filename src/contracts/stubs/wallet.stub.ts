import { Injectable } from '@nestjs/common';
import {
  WalletServiceContract,
  WalletSnapshot,
} from '../financial-services.js';

@Injectable()
export class WalletServiceStub implements WalletServiceContract {
  getWallet(_userId: string): Promise<WalletSnapshot> {
    return Promise.resolve({
      balanceKobo: '4680000',
      accountNumber: '7010000001',
      bankName: 'Wema Bank',
      accountName: 'Sow Demo User',
    });
  }

  async createWallet(_userId: string): Promise<WalletSnapshot> {
    return {
      balanceKobo: '0',
      accountNumber: '7010000002',
      bankName: 'Wema Bank',
      accountName: 'Sow Wallet',
    };
  }
}
