import { LedgerTransaction } from '../financial-services.js';

const NAIRA = 100;

interface FixtureSeed {
  daysAgo: number;
  amountNaira: number;
  type: LedgerTransaction['type'];
  category: LedgerTransaction['category'];
  narration: string;
  counterparty: string | null;
}

// Deterministic spread across ~5 weeks and every category, so spending
// summaries, category breakdowns, and trends all have data to display.
const FIXTURE_SEEDS: FixtureSeed[] = [
  { daysAgo: 0, amountNaira: 20000, type: 'CREDIT', category: 'FUNDING', narration: 'Wallet funding', counterparty: null },
  { daysAgo: 1, amountNaira: 3500, type: 'DEBIT', category: 'TRANSFER', narration: 'Lunch split', counterparty: 'Aisha Bello' },
  { daysAgo: 2, amountNaira: 1200, type: 'DEBIT', category: 'BILL_PAYMENT', narration: 'Airtime', counterparty: 'MTN' },
  { daysAgo: 3, amountNaira: 8000, type: 'DEBIT', category: 'TRANSFER', narration: 'Rent contribution', counterparty: 'Chidi Okafor' },
  { daysAgo: 4, amountNaira: 4500, type: 'DEBIT', category: 'BILL_PAYMENT', narration: 'Electricity', counterparty: 'IKEDC' },
  { daysAgo: 5, amountNaira: 2000, type: 'DEBIT', category: 'TRANSFER', narration: 'Data gift', counterparty: 'Aisha Bello' },
  { daysAgo: 8, amountNaira: 15000, type: 'CREDIT', category: 'FUNDING', narration: 'Wallet funding', counterparty: null },
  { daysAgo: 9, amountNaira: 6000, type: 'DEBIT', category: 'TRANSFER', narration: 'Groceries', counterparty: 'Market Square' },
  { daysAgo: 10, amountNaira: 3000, type: 'DEBIT', category: 'BILL_PAYMENT', narration: 'DSTV', counterparty: 'MultiChoice' },
  { daysAgo: 12, amountNaira: 5000, type: 'DEBIT', category: 'WITHDRAWAL', narration: 'ATM withdrawal', counterparty: null },
  { daysAgo: 15, amountNaira: 7500, type: 'DEBIT', category: 'TRANSFER', narration: 'Loan repayment', counterparty: 'Chidi Okafor' },
  { daysAgo: 17, amountNaira: 1800, type: 'DEBIT', category: 'BILL_PAYMENT', narration: 'Data bundle', counterparty: 'Glo' },
  { daysAgo: 20, amountNaira: 25000, type: 'CREDIT', category: 'FUNDING', narration: 'Wallet funding', counterparty: null },
  { daysAgo: 22, amountNaira: 9000, type: 'DEBIT', category: 'TRANSFER', narration: 'Gift', counterparty: 'Ngozi Eze' },
  { daysAgo: 25, amountNaira: 4000, type: 'DEBIT', category: 'BILL_PAYMENT', narration: 'Electricity', counterparty: 'IKEDC' },
  { daysAgo: 28, amountNaira: 3200, type: 'DEBIT', category: 'TRANSFER', narration: 'Dinner', counterparty: 'Aisha Bello' },
  { daysAgo: 30, amountNaira: 2500, type: 'DEBIT', category: 'WITHDRAWAL', narration: 'ATM withdrawal', counterparty: null },
];

const toLedgerTransaction = (
  seed: FixtureSeed,
  index: number,
  now: number,
): LedgerTransaction => ({
  id: `fixture-${index + 1}`,
  amountKobo: seed.amountNaira * NAIRA,
  type: seed.type,
  category: seed.category,
  narration: seed.narration,
  counterparty: seed.counterparty,
  status: 'SUCCESS',
  createdAt: new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000),
});

export const buildFixtureTransactions = (now = Date.now()): LedgerTransaction[] =>
  FIXTURE_SEEDS.map((seed, index) => toLedgerTransaction(seed, index, now));
