import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Wallet } from '../entities/wallet.entity.js';
import { Transaction } from '../entities/transaction.entity.js';
import { TransactionsServiceContract, LedgerTransaction, DateRange } from '../contracts/financial-services.js';

@Injectable()
export class TransactionsService implements TransactionsServiceContract {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async listTransactions(userId: string, range: DateRange): Promise<LedgerTransaction[]> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const transactions = await this.transactionRepository.find({
      where: {
        walletId: wallet.id,
        createdAt: Between(range.from, range.to),
      },
      order: { createdAt: 'DESC' },
    });

    return transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type as LedgerTransaction['type'],
      category: transaction.category as LedgerTransaction['category'],
      amountKobo: transaction.amount,
      feeKobo: transaction.fee,
      narration: transaction.narration,
      status: transaction.status as LedgerTransaction['status'],
      monnifyReference: transaction.monnifyReference,
      createdAt: transaction.createdAt,
    }));
  }
}
