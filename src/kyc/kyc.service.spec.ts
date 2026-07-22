import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { KycService } from './kyc.service.js';
import { Kyc, VerificationStatus } from '../entities/kyc.entity.js';

describe('KycService', () => {
  let service: KycService;
  let kycRepository: Repository<Kyc>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: getRepositoryToken(Kyc), useClass: Repository },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
    kycRepository = module.get<Repository<Kyc>>(getRepositoryToken(Kyc));
  });

  describe('submitKyc', () => {
    it('creates a KYC record with PENDING status', async () => {
      jest.spyOn(kycRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(kycRepository, 'create').mockReturnValue({} as Kyc);
      jest.spyOn(kycRepository, 'save').mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
        bvn: '12345678901',
        nin: null,
        verificationStatus: VerificationStatus.PENDING,
        verifiedAt: null,
      } as Kyc);

      const result = await service.submitKyc('user-1', { bvn: '12345678901' });

      expect(result.verificationStatus).toBe(VerificationStatus.PENDING);
      expect(result.bvn).toBe('12345678901');
    });

    it('upserts existing KYC record', async () => {
      const existing = {
        id: 'kyc-1',
        userId: 'user-1',
        bvn: 'old-bvn',
        nin: null,
        verificationStatus: VerificationStatus.VERIFIED,
      } as Kyc;

      jest.spyOn(kycRepository, 'findOne').mockResolvedValue(existing);
      jest.spyOn(kycRepository, 'save').mockResolvedValue({
        ...existing,
        bvn: '12345678901',
        verificationStatus: VerificationStatus.PENDING,
      } as Kyc);

      const result = await service.submitKyc('user-1', { bvn: '12345678901' });

      expect(result.bvn).toBe('12345678901');
      expect(result.verificationStatus).toBe(VerificationStatus.PENDING);
    });
  });

  describe('getStatus', () => {
    it('returns existing KYC record', async () => {
      jest.spyOn(kycRepository, 'findOne').mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
      } as Kyc);

      const result = await service.getStatus('user-1');
      expect(result.userId).toBe('user-1');
    });

    it('throws NotFoundException when no KYC record', async () => {
      jest.spyOn(kycRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getStatus('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
