import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Kyc, VerificationStatus } from '../entities/kyc.entity.js';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(Kyc)
    private readonly kycRepository: Repository<Kyc>,
    private readonly configService: ConfigService,
  ) {}

  async submitKyc(
    userId: string,
    data: { bvn: string; nin?: string },
  ): Promise<Kyc> {
    const existing = await this.kycRepository.findOne({ where: { userId } });

    if (existing) {
      existing.bvn = data.bvn;
      existing.nin = data.nin ?? existing.nin;
      existing.verificationStatus = VerificationStatus.PENDING;
      return this.kycRepository.save(existing);
    }

    return this.kycRepository.save(
      this.kycRepository.create({
        userId,
        bvn: data.bvn,
        nin: data.nin ?? null,
        verificationStatus: VerificationStatus.PENDING,
        verifiedAt: null,
      }),
    );
  }

  async getStatus(userId: string): Promise<Kyc> {
    const kyc = await this.kycRepository.findOne({ where: { userId } });
    if (!kyc) {
      throw new NotFoundException('KYC record not found');
    }
    return kyc;
  }
}
