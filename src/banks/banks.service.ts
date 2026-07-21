import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Beneficiary } from '../entities/beneficiary.entity.js';
import { BanksServiceContract, ResolvedAccount } from '../contracts/financial-services.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';
import { MonnifyError } from '../monnify/monnify-error.js';
import { AccountValidationResponse } from '../monnify/monnify.types.js';

@Injectable()
export class BanksService implements BanksServiceContract {
  constructor(
    @InjectRepository(Beneficiary)
    private readonly beneficiaryRepository: Repository<Beneficiary>,
    private readonly monnify: MonnifyHttpClient,
  ) {}

  async resolveAccountName(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
    const responseBody = await this.monnify.get<AccountValidationResponse>(
      '/api/v2/disbursements/account/validate',
      { accountNumber, bankCode },
    );
    return {
      accountNumber: responseBody.accountNumber,
      accountName: responseBody.accountName,
      bankCode: responseBody.bankCode,
      bankName: responseBody.bankName,
    };
  }

  async findBeneficiaryByName(userId: string, name: string): Promise<ResolvedAccount | null> {
    const beneficiary = await this.beneficiaryRepository.findOne({
      where: { userId, name },
    });
    if (!beneficiary) {
      return null;
    }
    return {
      accountNumber: beneficiary.accountNumber,
      accountName: beneficiary.accountName,
      bankCode: beneficiary.bankCode,
      bankName: beneficiary.bankName,
    };
  }

  async createBeneficiary(
    userId: string,
    data: { name: string; accountNumber: string; bankCode: string },
  ): Promise<Beneficiary> {
    let resolved: ResolvedAccount;
    try {
      resolved = await this.resolveAccountName(data.accountNumber, data.bankCode);
    } catch (error) {
      if (error instanceof MonnifyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return this.beneficiaryRepository.save(
      this.beneficiaryRepository.create({
        userId,
        name: data.name,
        accountNumber: resolved.accountNumber,
        bankCode: resolved.bankCode,
        bankName: resolved.bankName,
        accountName: resolved.accountName,
      }),
    );
  }

  async listBeneficiaries(userId: string): Promise<Beneficiary[]> {
    return this.beneficiaryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteBeneficiary(userId: string, beneficiaryId: string): Promise<void> {
    await this.beneficiaryRepository.delete({ id: beneficiaryId, userId });
  }

  async listBanks(): Promise<Array<{ bankCode: string; bankName: string }>> {
    const raw = await this.monnify.get<
      Array<{ code: string; name: string }>
    >('/api/v1/banks');
    return raw.map((bank) => ({
      bankCode: bank.code,
      bankName: bank.name,
    }));
  }
}
