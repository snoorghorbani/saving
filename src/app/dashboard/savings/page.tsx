'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import {
    subscribeToTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    subscribeToAccounts,
    addAccount,
    deleteAccount,
} from '@/lib/firestore';
import type { Transaction, Account, AccountType, Currency, Bucket } from '@/types';
import { CURRENCIES } from '@/types';
import { formatCurrency, convert } from '@/lib/currency';

export default function SavingsPage() {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showAccountForm, setShowAccountForm] = useState(false);
    const [showTransferForm, setShowTransferForm] = useState(false);
    const [filterAccount, setFilterAccount] = useState<string | 'all'>('all');
    const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD');
    const [convertedTotal, setConvertedTotal] = useState<number | null>(null);

    // Transaction form state
    const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
    const [accountId, setAccountId] = useState('');
    const [bucket, setBucket] = useState<Bucket>('saving');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');

    // Account form state
    const [newAccName, setNewAccName] = useState('');
    const [newAccType, setNewAccType] = useState<AccountType>('Bank');
    const [newAccCurrency, setNewAccCurrency] = useState<Currency>('USD');

    // Transfer form state
    const [transferFrom, setTransferFrom] = useState('');
    const [transferFromBucket, setTransferFromBucket] = useState<Bucket>('deposit');
    const [transferTo, setTransferTo] = useState('');
    const [transferToBucket, setTransferToBucket] = useState<Bucket>('saving');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
    const [transferNotes, setTransferNotes] = useState('');
    const [transferPreview, setTransferPreview] = useState<{ fromAmount: number; toAmount: number; fromCurrency: Currency; toCurrency: Currency } | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsub1 = subscribeToTransactions(user.uid, setTransactions);
        const unsub2 = subscribeToAccounts(user.uid, setAccounts);
        return () => { unsub1(); unsub2(); };
    }, [user]);

    // Set default accountId when accounts load
    useEffect(() => {
        if (accounts.length > 0 && !accountId) {
            setAccountId(accounts[0].id);
        }
    }, [accounts, accountId]);

    // Compute per-account bucket balances
    const balanceOf = (accId: string, b?: Bucket) =>
        transactions
            .filter((t) => t.accountId === accId && (b ? t.bucket === b : true))
            .reduce((sum, t) => sum + t.amount, 0);

    // Convert total to display currency
    useEffect(() => {
        let cancelled = false;
        async function calc() {
            let total = 0;
            const accountMap = new Map(accounts.map((a) => [a.id, a]));
            for (const txn of transactions) {
                const acc = accountMap.get(txn.accountId);
                const currency = acc?.currency ?? 'OMR';
                total += await convert(txn.amount, currency, displayCurrency);
            }
            if (!cancelled) setConvertedTotal(total);
        }
        calc();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts, transactions, displayCurrency]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !amount || !accountId) return;
        if (editingTxnId) {
            await updateTransaction(user.uid, editingTxnId, {
                accountId,
                amount: parseFloat(amount),
                bucket,
                date: new Date(date),
                notes,
            });
            setEditingTxnId(null);
        } else {
            await addTransaction(user.uid, {
                accountId,
                amount: parseFloat(amount),
                bucket,
                date: new Date(date),
                notes,
            });
        }
        setAmount('');
        setNotes('');
        setShowForm(false);
    };

    const handleEditTxn = (txn: Transaction) => {
        setEditingTxnId(txn.id);
        setAccountId(txn.accountId);
        setBucket(txn.bucket);
        setAmount(txn.amount.toString());
        setDate(txn.date.toISOString().slice(0, 10));
        setNotes(txn.notes);
        setShowForm(true);
    };

    const handleDeleteTxn = async (txnId: string) => {
        if (!user) return;
        if (!confirm('Delete this transaction?')) return;
        await deleteTransaction(user.uid, txnId);
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newAccName) return;
        await addAccount(user.uid, { name: newAccName, type: newAccType, currency: newAccCurrency });
        setNewAccName('');
        setShowAccountForm(false);
    };

    const handleDeleteAccount = async (accId: string) => {
        if (!user) return;
        if (!confirm('Delete this saving place?')) return;
        await deleteAccount(user.uid, accId);
    };

    // Set default transfer accounts
    useEffect(() => {
        if (accounts.length >= 1) {
            if (!transferFrom) setTransferFrom(accounts[0].id);
            if (!transferTo) setTransferTo(accounts.length >= 2 ? accounts[1].id : accounts[0].id);
        }
    }, [accounts, transferFrom, transferTo]);

    // Preview conversion when transfer inputs change
    useEffect(() => {
        if (!transferFrom || !transferTo || !transferAmount) {
            setTransferPreview(null);
            return;
        }
        const fromAcc = accounts.find((a) => a.id === transferFrom);
        const toAcc = accounts.find((a) => a.id === transferTo);
        if (!fromAcc || !toAcc) return;
        let cancelled = false;
        const amt = parseFloat(transferAmount);
        if (isNaN(amt) || amt <= 0) { setTransferPreview(null); return; }
        convert(amt, fromAcc.currency, toAcc.currency).then((converted) => {
            if (!cancelled) setTransferPreview({ fromAmount: amt, toAmount: converted, fromCurrency: fromAcc.currency, toCurrency: toAcc.currency });
        });
        return () => { cancelled = true; };
    }, [transferFrom, transferTo, transferAmount, accounts]);

    const isSameTarget = transferFrom === transferTo && transferFromBucket === transferToBucket;

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !transferFrom || !transferTo || !transferAmount || isSameTarget) return;
        const fromAcc = accounts.find((a) => a.id === transferFrom);
        const toAcc = accounts.find((a) => a.id === transferTo);
        if (!fromAcc || !toAcc) return;
        const amt = parseFloat(transferAmount);
        if (isNaN(amt) || amt <= 0) return;
        const convertedAmt = await convert(amt, fromAcc.currency, toAcc.currency);
        const label = `Transfer: ${fromAcc.name}/${transferFromBucket} → ${toAcc.name}/${transferToBucket}`;
        if (!confirm(`Transfer ${formatCurrency(amt, fromAcc.currency)} from ${fromAcc.name} (${transferFromBucket}) → ${formatCurrency(convertedAmt, toAcc.currency)} to ${toAcc.name} (${transferToBucket})?`)) return;
        await addTransaction(user.uid, {
            accountId: transferFrom,
            amount: -amt,
            bucket: transferFromBucket,
            date: new Date(transferDate),
            notes: transferNotes || label,
        });
        await addTransaction(user.uid, {
            accountId: transferTo,
            amount: convertedAmt,
            bucket: transferToBucket,
            date: new Date(transferDate),
            notes: transferNotes || label,
        });
        setTransferAmount('');
        setTransferNotes('');
        setShowTransferForm(false);
    };

    const filteredTransactions =
        filterAccount === 'all'
            ? transactions
            : transactions.filter((t) => t.accountId === filterAccount);

    const selectedAccount = accounts.find((a) => a.id === accountId);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Savings</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-slate-500">
                            Total:{' '}
                            <span className="font-bold text-emerald-600">
                                {convertedTotal !== null ? formatCurrency(convertedTotal, displayCurrency) : '…'}
                            </span>
                        </p>
                        <select
                            className="select text-xs"
                            value={displayCurrency}
                            onChange={(e) => setDisplayCurrency(e.target.value as Currency)}
                        >
                            {CURRENCIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowAccountForm(!showAccountForm)} className="btn-secondary">
                        + Account
                    </button>
                    <button
                        onClick={() => { setShowTransferForm(!showTransferForm); setShowForm(false); }}
                        className="btn-secondary"
                        disabled={accounts.length < 1}
                    >
                        Transfer
                    </button>
                    <button onClick={() => { setEditingTxnId(null); setAmount(''); setNotes(''); setDate(new Date().toISOString().slice(0, 10)); setBucket('saving'); setShowForm(!showForm); setShowTransferForm(false); }} className="btn-primary">
                        + Transaction
                    </button>
                </div>
            </div>

            {/* ── Add Account Form ─────────────────────── */}
            {showAccountForm && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">New Saving Place</h2>
                    <form onSubmit={handleAddAccount} className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="label">Name</label>
                            <input type="text" className="input w-full" value={newAccName} onChange={(e) => setNewAccName(e.target.value)} placeholder="e.g. IsBank" required />
                        </div>
                        <div>
                            <label className="label">Type</label>
                            <select className="select w-full" value={newAccType} onChange={(e) => setNewAccType(e.target.value as AccountType)}>
                                <option value="Cash">Cash</option>
                                <option value="Bank">Bank</option>
                                <option value="Online">Online</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Currency</label>
                            <select className="select w-full" value={newAccCurrency} onChange={(e) => setNewAccCurrency(e.target.value as Currency)}>
                                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-3 flex gap-2">
                            <button type="submit" className="btn-primary">Create</button>
                            <button type="button" onClick={() => setShowAccountForm(false)} className="btn-secondary">Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Transfer Form ────────────────────────── */}
            {showTransferForm && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Transfer</h2>
                    {accounts.length < 1 ? (
                        <p className="text-sm text-slate-400">Create an account first.</p>
                    ) : (
                        <form onSubmit={handleTransfer} className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label">From Account</label>
                                <select className="select w-full" value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">From Bucket</label>
                                <select className="select w-full" value={transferFromBucket} onChange={(e) => setTransferFromBucket(e.target.value as Bucket)}>
                                    <option value="deposit">Deposit — {formatCurrency(balanceOf(transferFrom, 'deposit'), accounts.find(a => a.id === transferFrom)?.currency ?? 'OMR')}</option>
                                    <option value="saving">Saving — {formatCurrency(balanceOf(transferFrom, 'saving'), accounts.find(a => a.id === transferFrom)?.currency ?? 'OMR')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">To Account</label>
                                <select className="select w-full" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">To Bucket</label>
                                <select className="select w-full" value={transferToBucket} onChange={(e) => setTransferToBucket(e.target.value as Bucket)}>
                                    <option value="deposit">Deposit — {formatCurrency(balanceOf(transferTo, 'deposit'), accounts.find(a => a.id === transferTo)?.currency ?? 'OMR')}</option>
                                    <option value="saving">Saving — {formatCurrency(balanceOf(transferTo, 'saving'), accounts.find(a => a.id === transferTo)?.currency ?? 'OMR')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">Amount ({accounts.find((a) => a.id === transferFrom)?.currency ?? ''})</label>
                                <input type="number" step="0.001" min="0.001" className="input w-full" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="Amount to transfer" required />
                                {transferPreview && transferPreview.fromCurrency !== transferPreview.toCurrency && (
                                    <p className="text-xs text-blue-600 mt-1">
                                        ≈ {formatCurrency(transferPreview.toAmount, transferPreview.toCurrency)}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="label">Date</label>
                                <input type="date" className="input w-full" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="label">Notes</label>
                                <input type="text" className="input w-full" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="Optional" />
                            </div>
                            <div className="sm:col-span-2 flex gap-2">
                                <button type="submit" className="btn-primary" disabled={isSameTarget}>Transfer</button>
                                <button type="button" onClick={() => setShowTransferForm(false)} className="btn-secondary">Cancel</button>
                                {isSameTarget && <p className="text-xs text-red-500 self-center">Source and destination must differ</p>}
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* ── Transaction Form (Add/Edit) ─────────── */}
            {showForm && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">{editingTxnId ? 'Edit Transaction' : 'New Transaction'}</h2>
                    {accounts.length === 0 ? (
                        <p className="text-sm text-slate-400">Create a saving place first.</p>
                    ) : (
                        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label">Account</label>
                                <select className="select w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">Bucket</label>
                                <select className="select w-full" value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
                                    <option value="deposit">Deposit</option>
                                    <option value="saving">Saving</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">Amount ({selectedAccount?.currency ?? ''})</label>
                                <input type="number" step="0.001" className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Negative for withdrawal" required />
                                <p className="text-xs text-slate-400 mt-1">Use negative amount for withdrawals</p>
                            </div>
                            <div>
                                <label className="label">Date</label>
                                <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} required />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="label">Notes</label>
                                <input type="text" className="input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                            </div>
                            <div className="sm:col-span-2 flex gap-2">
                                <button type="submit" className="btn-primary">{editingTxnId ? 'Update' : 'Add Transaction'}</button>
                                <button type="button" onClick={() => { setShowForm(false); setEditingTxnId(null); }} className="btn-secondary">Cancel</button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* ── Account Cards ────────────────────────── */}
            {accounts.length === 0 ? (
                <div className="card text-center py-12">
                    <p className="text-lg font-semibold text-slate-700 mb-2">No saving places yet</p>
                    <p className="text-sm text-slate-400">Click &quot;+ Account&quot; to create your first saving place.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {accounts.map((account) => {
                        const depositBal = balanceOf(account.id, 'deposit');
                        const savingBal = balanceOf(account.id, 'saving');
                        const total = depositBal + savingBal;
                        const txnCount = transactions.filter((t) => t.accountId === account.id).length;
                        return (
                            <div
                                key={account.id}
                                className="card cursor-pointer hover:shadow-md transition-shadow"
                                onClick={() => setFilterAccount(account.id)}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-block h-2 w-2 rounded-full ${account.type === 'Cash' ? 'bg-amber-400' : account.type === 'Bank' ? 'bg-blue-400' : 'bg-purple-400'
                                            }`} />
                                        <h3 className="font-semibold text-slate-800">{account.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{account.type} · {account.currency}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id); }}
                                            className="text-xs text-slate-300 hover:text-red-500"
                                        >✕</button>
                                    </div>
                                </div>
                                <p className={`text-xl font-bold ${total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {formatCurrency(total, account.currency)}
                                </p>
                                <div className="flex gap-4 mt-1">
                                    <p className="text-xs text-slate-500">
                                        Deposit: <span className={depositBal >= 0 ? 'text-blue-600 font-medium' : 'text-red-500 font-medium'}>{formatCurrency(depositBal, account.currency)}</span>
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Saving: <span className={savingBal >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{formatCurrency(savingBal, account.currency)}</span>
                                    </p>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">{txnCount} transaction{txnCount !== 1 ? 's' : ''}</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Transaction History ──────────────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">Transaction History</h2>
                    <select className="select text-xs" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
                        <option value="all">All Accounts</option>
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
                {filteredTransactions.length === 0 ? (
                    <p className="text-sm text-slate-400">No transactions yet.</p>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredTransactions.map((txn) => {
                            const account = accounts.find((a) => a.id === txn.accountId);
                            return (
                                <div key={txn.id} className="flex items-center justify-between border-b border-slate-50 pb-2">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">
                                            {account?.name ?? 'Unknown'}
                                            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${txn.bucket === 'saving' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {txn.bucket}
                                            </span>
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {txn.date.toLocaleDateString()}
                                            {txn.notes && ` · ${txn.notes}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className={`text-sm font-bold ${txn.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {txn.amount >= 0 ? '+' : ''}{formatCurrency(txn.amount, account?.currency ?? 'OMR')}
                                        </p>
                                        <button onClick={() => handleEditTxn(txn)} className="text-xs text-slate-300 hover:text-emerald-600">Edit</button>
                                        <button onClick={() => handleDeleteTxn(txn.id)} className="text-xs text-slate-300 hover:text-red-500">✕</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
