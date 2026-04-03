'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { subscribeToTransactions, addTransaction } from '@/lib/firestore';
import type { Transaction } from '@/types';
import { ACCOUNTS } from '@/types';
import type { AccountId } from '@/types';
import { formatOMR } from '@/lib/utils';

export default function SavingsPage() {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [filterAccount, setFilterAccount] = useState<AccountId | 'all'>('all');

    // Form state
    const [accountId, setAccountId] = useState<AccountId>('omr-cash');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!user) return;
        return subscribeToTransactions(user.uid, setTransactions);
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !amount) return;
        await addTransaction(user.uid, {
            accountId,
            amount: parseFloat(amount),
            date: new Date(date),
            notes,
        });
        setAmount('');
        setNotes('');
        setShowForm(false);
    };

    const totalSaved = transactions.reduce((sum, t) => sum + t.amount, 0);
    const filteredTransactions =
        filterAccount === 'all'
            ? transactions
            : transactions.filter((t) => t.accountId === filterAccount);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Savings</h1>
                    <p className="text-sm text-slate-500">
                        Total across all accounts:{' '}
                        <span className="font-bold text-emerald-600">
                            {formatOMR(totalSaved)}
                        </span>
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="btn-primary"
                >
                    + Add Transaction
                </button>
            </div>

            {/* ── Transaction Form ─────────────────────── */}
            {showForm && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">
                        New Transaction
                    </h2>
                    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="label">Account</label>
                            <select
                                className="select w-full"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value as AccountId)}
                            >
                                {ACCOUNTS.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name} ({a.type})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Amount (OMR)</label>
                            <input
                                type="number"
                                step="0.001"
                                className="input w-full"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Negative for withdrawal"
                                required
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                Use negative amount for withdrawals
                            </p>
                        </div>
                        <div>
                            <label className="label">Date</label>
                            <input
                                type="date"
                                className="input w-full"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Notes</label>
                            <input
                                type="text"
                                className="input w-full"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>
                        <div className="sm:col-span-2 flex gap-2">
                            <button type="submit" className="btn-primary">
                                Add Transaction
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Account Cards ────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ACCOUNTS.map((account) => {
                    const balance = transactions
                        .filter((t) => t.accountId === account.id)
                        .reduce((sum, t) => sum + t.amount, 0);
                    const txnCount = transactions.filter(
                        (t) => t.accountId === account.id
                    ).length;
                    return (
                        <div
                            key={account.id}
                            className="card cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => setFilterAccount(account.id)}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-block h-2 w-2 rounded-full ${account.type === 'Cash'
                                                ? 'bg-amber-400'
                                                : account.type === 'Bank'
                                                    ? 'bg-blue-400'
                                                    : 'bg-purple-400'
                                            }`}
                                    />
                                    <h3 className="font-semibold text-slate-800">
                                        {account.name}
                                    </h3>
                                </div>
                                <span className="text-xs text-slate-400">{account.type}</span>
                            </div>
                            <p
                                className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                            >
                                {formatOMR(balance)}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                {txnCount} transaction{txnCount !== 1 ? 's' : ''}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* ── Transaction History ──────────────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">
                        Transaction History
                    </h2>
                    <select
                        className="select text-xs"
                        value={filterAccount}
                        onChange={(e) =>
                            setFilterAccount(e.target.value as AccountId | 'all')
                        }
                    >
                        <option value="all">All Accounts</option>
                        {ACCOUNTS.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </div>
                {filteredTransactions.length === 0 ? (
                    <p className="text-sm text-slate-400">No transactions yet.</p>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredTransactions.map((txn) => {
                            const account = ACCOUNTS.find((a) => a.id === txn.accountId);
                            return (
                                <div
                                    key={txn.id}
                                    className="flex items-center justify-between border-b border-slate-50 pb-2"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">
                                            {account?.name}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {txn.date.toLocaleDateString()}
                                            {txn.notes && ` · ${txn.notes}`}
                                        </p>
                                    </div>
                                    <p
                                        className={`text-sm font-bold ${txn.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                                    >
                                        {txn.amount >= 0 ? '+' : ''}
                                        {formatOMR(txn.amount)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
