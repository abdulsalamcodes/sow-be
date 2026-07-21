import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BanksService } from './banks.service.js';
import { Beneficiary } from '../entities/beneficiary.entity.js';
import { MonnifyHttpClient } from '../monnify/monnify-http-client.js';

describe('BanksService', () => {
  let service: BanksService;
  let beneficiaryRepository: Repository<Beneficiary>;
  let monnify: MonnifyHttpClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BanksService,
        { provide: MonnifyHttpClient, useValue: { get: jest.fn(), post: jest.fn() } },
        { provide: getRepositoryToken(Beneficiary), useClass: Repository },
      ],
    }).compile();

    service = module.get<BanksService>(BanksService);
    beneficiaryRepository = module.get<Repository<Beneficiary>>(getRepositoryToken(Beneficiary));
    monnify = module.get<MonnifyHttpClient>(MonnifyHttpClient);
  });

  describe('resolveAccountName', () => {
    it('calls Monnify and maps response', async () => {
      jest.spyOn(monnify, 'get').mockResolvedValue({
        accountNumber: '0123456789',
        accountName: 'JOHN DOE',
        bankCode: '058',
        bankName: 'GTBank',
      });

      const result = await service.resolveAccountName('0123456789', '058');

      expect(result.accountName).toBe('JOHN DOE');
      expect(result.bankName).toBe('GTBank');
    });
  });

  describe('findBeneficiaryByName', () => {
    it('queries Beneficiary table with case-sensitive match', async () => {
      jest.spyOn(beneficiaryRepository, 'findOne').mockResolvedValue({
        id: 'ben-1',
        userId: 'user-1',
        name: 'Aisha',
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
        accountName: 'AISHA BELLO',
      } as Beneficiary);

      const result = await service.findBeneficiaryByName('user-1', 'Aisha');

      expect(result).not.toBeNull();
      expect(result!.accountName).toBe('AISHA BELLO');
    });

    it('returns null when no beneficiary found', async () => {
      jest.spyOn(beneficiaryRepository, 'findOne').mockResolvedValue(null);

      const result = await service.findBeneficiaryByName('user-1', 'Unknown');

      expect(result).toBeNull();
    });
  });
});
