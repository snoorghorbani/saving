// Service: Reset accounts to a fresh statement for the current week
// This function creates adjustment transactions so that each account/bucket matches the user-entered statement as of the start of this week.
import { addTransaction } from '../firestore';
import { startOfSavingsWeek } from '../savings-debt';
import type { Account, Transaction, Bucket } from '@/types';

export interface AccountStatementInput {
    accountId: string;
    deposit: number;
    saving: number;
}

/**
 * For each account, create adjustment transactions so that the deposit and saving buckets match the user-entered statement.
 * @param userId
 * @param accounts All accounts
 * @param transactions All transactions
 * @param statementInputs Array of { accountId, deposit, saving } with the desired balances
 */
export async function resetAccountsToStatement(
    userId: string,
    accounts: Account[],
    transactions: Transaction[],
    statementInputs: AccountStatementInput[]
) {
    const weekStart = startOfSavingsWeek(new Date());
    for (const input of statementInputs) {
        const accTxns = transactions.filter(t => t.accountId === input.accountId);
        for (const bucket of ['deposit', 'saving'] as Bucket[]) {
            const current = accTxns.filter(t => t.bucket === bucket).reduce((sum, t) => sum + t.amount, 0);
            const desired = input[bucket];
            const diff = desired - current;
            if (Math.abs(diff) > 1e-6) {
                await addTransaction(userId, {
                    accountId: input.accountId,
                    amount: diff,
                    bucket,
                    date: weekStart,
                    notes: 'Account reset to statement',
                });
            }
        }
    }
}
