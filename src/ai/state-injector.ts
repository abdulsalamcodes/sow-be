import type { WalletServiceContract } from '../contracts/financial-services.js';

export interface PendingAction {
  intentId: string;
  summary: string;
  amountKobo: number;
  recipientAccountName: string;
  expiresAt: Date;
}

export interface UserState {
  walletBalanceKobo: string | null;
  walletAccountNumber: string | null;
  walletBankName: string | null;
}

const NAIRA = 100;

export class StateInjector {
  constructor(
    private readonly walletService: WalletServiceContract,
  ) {}

  async gather(userId: string): Promise<UserState> {
    try {
      const wallet = await this.walletService.getWallet(userId);
      return {
        walletBalanceKobo: wallet.balanceKobo ?? null,
        walletAccountNumber: wallet.accountNumber ?? null,
        walletBankName: wallet.bankName ?? null,
      };
    } catch {
      return {
        walletBalanceKobo: null,
        walletAccountNumber: null,
        walletBankName: null,
      };
    }
  }

  format(state: UserState, pendingAction: PendingAction | null): string {
    const lines: string[] = [];

    if (state.walletBalanceKobo) {
      const naira = Number(state.walletBalanceKobo) / NAIRA;
      const formatted = naira.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
      });
      lines.push(`Wallet balance: ₦${formatted}`);
    } else {
      lines.push('No active wallet.');
    }

    if (state.walletAccountNumber && state.walletBankName) {
      const masked = state.walletAccountNumber.slice(-4);
      lines.push(
        `Funding account: ${state.walletBankName} ****${masked}`,
      );
    }

    if (pendingAction) {
      lines.push(
        `Pending action: ${pendingAction.summary}. Ask the user to confirm or cancel.`,
      );
    }

    return lines.join('\n');
  }
}
