import { LedgerTransaction } from '../financial-services.js';

const NAIRA = 100;

interface FixtureSeed {
  daysAgo: number;
  amountNaira: number;
  type: LedgerTransaction['type'];
  category: LedgerTransaction['category'];
  narration: string;
}

const FIXTURE_SEEDS: FixtureSeed[] = [
  {
    daysAgo: 0,
    amountNaira: 20000,
    type: 'CREDIT',
    category: 'FUNDING',
    narration: 'Wallet funding',
  },
  {
    daysAgo: 1,
    amountNaira: 3500,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Lunch split',
  },
  {
    daysAgo: 2,
    amountNaira: 1200,
    type: 'DEBIT',
    category: 'BILL_PAYMENT',
    narration: 'Airtime',
  },
  {
    daysAgo: 3,
    amountNaira: 8000,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Rent contribution',
  },
  {
    daysAgo: 4,
    amountNaira: 4500,
    type: 'DEBIT',
    category: 'BILL_PAYMENT',
    narration: 'Electricity',
  },
  {
    daysAgo: 5,
    amountNaira: 2000,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Data gift',
  },
  {
    daysAgo: 8,
    amountNaira: 15000,
    type: 'CREDIT',
    category: 'FUNDING',
    narration: 'Wallet funding',
  },
  {
    daysAgo: 9,
    amountNaira: 6000,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Groceries',
  },
  {
    daysAgo: 10,
    amountNaira: 3000,
    type: 'DEBIT',
    category: 'BILL_PAYMENT',
    narration: 'DSTV',
  },
  {
    daysAgo: 12,
    amountNaira: 5000,
    type: 'DEBIT',
    category: 'WITHDRAWAL',
    narration: 'ATM withdrawal',
  },
  {
    daysAgo: 15,
    amountNaira: 7500,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Loan repayment',
  },
  {
    daysAgo: 17,
    amountNaira: 1800,
    type: 'DEBIT',
    category: 'BILL_PAYMENT',
    narration: 'Data bundle',
  },
  {
    daysAgo: 20,
    amountNaira: 25000,
    type: 'CREDIT',
    category: 'FUNDING',
    narration: 'Wallet funding',
  },
  {
    daysAgo: 22,
    amountNaira: 9000,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Gift',
  },
  {
    daysAgo: 25,
    amountNaira: 4000,
    type: 'DEBIT',
    category: 'BILL_PAYMENT',
    narration: 'Electricity',
  },
  {
    daysAgo: 28,
    amountNaira: 3200,
    type: 'DEBIT',
    category: 'TRANSFER',
    narration: 'Dinner',
  },
  {
    daysAgo: 30,
    amountNaira: 2500,
    type: 'DEBIT',
    category: 'WITHDRAWAL',
    narration: 'ATM withdrawal',
  },
];

const toLedgerTransaction = (
  seed: FixtureSeed,
  index: number,
  now: number,
): LedgerTransaction => ({
  id: `fixture-${index + 1}`,
  amountKobo: String(seed.amountNaira * NAIRA),
  feeKobo: '0',
  type: seed.type,
  category: seed.category,
  narration: seed.narration,
  status: 'SUCCESS',
  monnifyReference: null,
  createdAt: new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000),
});

export const buildFixtureTransactions = (
  now = Date.now(),
): LedgerTransaction[] =>
  FIXTURE_SEEDS.map((seed, index) => toLedgerTransaction(seed, index, now));
