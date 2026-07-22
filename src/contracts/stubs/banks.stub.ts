import { Injectable } from '@nestjs/common';
import {
  BanksServiceContract,
  ResolvedAccount,
} from '../financial-services.js';

const FIXTURE_BENEFICIARIES: ResolvedAccount[] = [
  {
    accountNumber: '0123456789',
    accountName: 'AISHA BELLO',
    bankCode: '058',
    bankName: 'GTBank',
  },
  {
    accountNumber: '2233445566',
    accountName: 'CHIDI OKAFOR',
    bankCode: '033',
    bankName: 'UBA',
  },
  {
    accountNumber: '9988776655',
    accountName: 'NGOZI EZE',
    bankCode: '057',
    bankName: 'Zenith Bank',
  },
];

@Injectable()
export class BanksServiceStub implements BanksServiceContract {
  resolveAccountName(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolvedAccount> {
    const known = FIXTURE_BENEFICIARIES.find(
      (beneficiary) =>
        beneficiary.accountNumber === accountNumber &&
        beneficiary.bankCode === bankCode,
    );
    if (known) {
      return Promise.resolve(known);
    }
    return Promise.resolve({
      accountNumber,
      accountName: 'SOW DEMO RECIPIENT',
      bankCode,
      bankName: 'Demo Bank',
    });
  }

  findBeneficiaryByName(
    _userId: string,
    name: string,
  ): Promise<ResolvedAccount | null> {
    const normalized = name.trim().toLowerCase();
    const match = FIXTURE_BENEFICIARIES.find((beneficiary) =>
      beneficiary.accountName.toLowerCase().includes(normalized),
    );
    return Promise.resolve(match ?? null);
  }

  listBanks(): Promise<Array<{ bankCode: string; bankName: string }>> {
    return Promise.resolve([
      { bankCode: '035', bankName: 'Wema Bank' },
      { bankCode: '057', bankName: 'Zenith Bank' },
      { bankCode: '058', bankName: 'GTBank' },
    ]);
  }
}
