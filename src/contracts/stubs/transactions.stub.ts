import { Injectable } from '@nestjs/common';
import {
  TransactionsServiceContract,
  LedgerTransaction,
  DateRange,
} from '../financial-services.js';
import { buildFixtureTransactions } from './fixture-transactions.js';

@Injectable()
export class TransactionsServiceStub implements TransactionsServiceContract {
  listTransactions(
    _userId: string,
    range: DateRange,
  ): Promise<LedgerTransaction[]> {
    const withinRange = buildFixtureTransactions().filter(
      (transaction) =>
        transaction.createdAt >= range.from &&
        transaction.createdAt <= range.to,
    );
    return Promise.resolve(withinRange);
  }
}
