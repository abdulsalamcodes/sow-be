import { Injectable } from '@nestjs/common';
import {
  WalletServiceContract,
  WalletSnapshot,
} from '../financial-services.js';

@Injectable()
export class WalletServiceStub implements WalletServiceContract {
  getWallet(_userId: string): Promise<WalletSnapshot> {
    return Promise.resolve({
      balanceKobo: 4_680_000,
      accountNumber: '7010000001',
      bankName: 'Wema Bank',
      accountName: 'Sow Demo User',
    });
  }
}
