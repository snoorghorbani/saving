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
    updateAccount,
    deleteAccount,
    subscribeToLoans,
    addLoan,
    updateLoan,
    deleteLoanCascade,
    subscribeToLoanRepayments,
    addLoanRepayment,
} from '@/lib/firestore';
import type { Transaction, Account, AccountType, Currency, Bucket, Loan, LoanRepayment } from '@/types';
import { CURRENCIES } from '@/types';
import { formatCurrency, convert } from '@/lib/currency';

export default function SavingsPage() {
    const { user, effectiveUserId, isViewer } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showAccountForm, setShowAccountForm] = useState(false);
    const [showTransferForm, setShowTransferForm] = useState(false);
    const [filterAccount, setFilterAccount] = useState<string | 'all'>('all');
    const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD');
    const [convertedTotal, setConvertedTotal] = useState<number | null>(null);

    // Loan state
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loanRepayments, setLoanRepayments] = useState<LoanRepayment[]>([]);
    const [showLoanForm, setShowLoanForm] = useState(false);
    const [loanAccountId, setLoanAccountId] = useState('');
    const [loanDepositAccountId, setLoanDepositAccountId] = useState('');
    const [loanAmount, setLoanAmount] = useState('');
    const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10));
    const [loanNotes, setLoanNotes] = useState('');
    const [repayLoanId, setRepayLoanId] = useState<string | null>(null);
    const [repayAmount, setRepayAmount] = useState('');
    const [repayDate, setRepayDate] = useState(new Date().toISOString().slice(0, 10));
    const [repayNotes, setRepayNotes] = useState('');

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
    const [newAccExternal, setNewAccExternal] = useState(false);

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
        if (!effectiveUserId) return;
        const unsub1 = subscribeToTransactions(effectiveUserId, setTransactions);
        const unsub2 = subscribeToAccounts(effectiveUserId, setAccounts);
        const unsub3 = subscribeToLoans(effectiveUserId, setLoans);
        const unsub4 = subscribeToLoanRepayments(effectiveUserId, setLoanRepayments);
        return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
    }, [effectiveUserId]);

    // Set default accountId when accounts load
    useEffect(() => {
        if (accounts.length > 0 && !accountId) {
            setAccountId(accounts[0].id);
        }
        if (accounts.length > 0 && !loanAccountId) {
            setLoanAccountId(accounts[0].id);
        }
        if (accounts.length > 0 && !loanDepositAccountId) {
            setLoanDepositAccountId(accounts[0].id);
        }
    }, [accounts, accountId, loanAccountId, loanDepositAccountId]);

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
        if (!user || isViewer || !amount || !accountId) return;
        const [y, m, d] = date.split('-').map(Number);
        const localDate = new Date(y, m - 1, d);
        if (editingTxnId) {
            await updateTransaction(user.uid, editingTxnId, {
                accountId,
                amount: parseFloat(amount),
                bucket,
                date: localDate,
                notes,
            });
            setEditingTxnId(null);
        } else {
            await addTransaction(user.uid, {
                accountId,
                amount: parseFloat(amount),
                bucket,
                date: localDate,
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
        if (!user || isViewer) return;
        const txn = transactions.find((t) => t.id === txnId);
        if (!txn) return;
        if (txn.loanId) {
            if (!confirm('This transaction is linked to a loan. Delete the loan and all related transactions?')) return;
            await deleteLoanCascade(user.uid, txn.loanId);
        } else {
            if (!confirm('Delete this transaction?')) return;
            await deleteTransaction(user.uid, txnId);
        }
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isViewer || !newAccName) return;
        await addAccount(user.uid, { name: newAccName, type: newAccType, currency: newAccCurrency, isExternal: newAccExternal });
        setNewAccName('');
        setNewAccExternal(false);
        setShowAccountForm(false);
    };

    const handleDeleteAccount = async (accId: string) => {
        if (!user || isViewer) return;
        if (!confirm('Delete this saving place?')) return;
        await deleteAccount(user.uid, accId);
    };

    const handleToggleExternal = async (accId: string, currentValue: boolean) => {
        if (!user || isViewer) return;
        await updateAccount(user.uid, accId, { isExternal: !currentValue });
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
        if (!user || isViewer || !transferFrom || !transferTo || !transferAmount || isSameTarget) return;
        const fromAcc = accounts.find((a) => a.id === transferFrom);
        const toAcc = accounts.find((a) => a.id === transferTo);
        if (!fromAcc || !toAcc) return;
        const amt = parseFloat(transferAmount);
        if (isNaN(amt) || amt <= 0) return;
        const convertedAmt = await convert(amt, fromAcc.currency, toAcc.currency);
        const label = `Transfer: ${fromAcc.name}/${transferFromBucket} → ${toAcc.name}/${transferToBucket}`;
        if (!confirm(`Transfer ${formatCurrency(amt, fromAcc.currency)} from ${fromAcc.name} (${transferFromBucket}) → ${formatCurrency(convertedAmt, toAcc.currency)} to ${toAcc.name} (${transferToBucket})?`)) return;
        const [ty, tm, td] = transferDate.split('-').map(Number);
        const tLocalDate = new Date(ty, tm - 1, td);
        await addTransaction(user.uid, {
            accountId: transferFrom,
            amount: -amt,
            bucket: transferFromBucket,
            date: tLocalDate,
            notes: transferNotes || label,
        });
        await addTransaction(user.uid, {
            accountId: transferTo,
            amount: convertedAmt,
            bucket: transferToBucket,
            date: tLocalDate,
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

    // ── Loan helpers ──────────────────────
    const loanBalance = (loan: Loan) => {
        const repaid = loanRepayments
            .filter((r) => r.loanId === loan.id)
            .reduce((sum, r) => sum + r.amount, 0);
        return Math.max(0, loan.principal - repaid);
    };

    const activeLoans = loans.filter((l) => loanBalance(l) > 0);
    const settledLoans = loans.filter((l) => loanBalance(l) <= 0);

    const handleDeleteLoan = async (loan: Loan) => {
        if (!user || isViewer) return;
        const fromAcc = accounts.find((a) => a.id === loan.accountId);
        if (!confirm(`Delete this loan${fromAcc ? ` from ${fromAcc.name}` : ''} and all related transactions?`)) return;
        await deleteLoanCascade(user.uid, loan.id);
    };

    const handleRequestLoan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isViewer || !loanAccountId || !loanDepositAccountId || !loanAmount) return;
        const fromAcc = accounts.find((a) => a.id === loanAccountId);
        const toAcc = accounts.find((a) => a.id === loanDepositAccountId);
        if (!fromAcc || !toAcc) return;
        const amt = parseFloat(loanAmount);
        if (isNaN(amt) || amt <= 0) return;
        const savingBal = balanceOf(loanAccountId, 'saving');
        if (amt > savingBal) {
            alert(`Insufficient savings. Available: ${formatCurrency(savingBal, fromAcc.currency)}`);
            return;
        }
        if (!confirm(`Take a loan of ${formatCurrency(amt, fromAcc.currency)} from ${fromAcc.name} (saving) → ${toAcc.name} (deposit)?`)) return;
        const [ly, lm, ld] = loanDate.split('-').map(Number);
        const lLocalDate = new Date(ly, lm - 1, ld);
        // Create loan record first to get its ID
        const loanDoc = await addLoan(user.uid, {
            accountId: loanAccountId,
            depositAccountId: loanDepositAccountId,
            principal: amt,
            balance: amt,
            date: lLocalDate,
            notes: loanNotes,
        });
        const newLoanId = loanDoc.id;
        // Withdraw from saving bucket of source account
        await addTransaction(user.uid, {
            accountId: loanAccountId,
            amount: -amt,
            bucket: 'saving',
            date: lLocalDate,
            notes: loanNotes || `Loan to ${toAcc.name} deposit`,
            loanId: newLoanId,
        });
        // Deposit to deposit bucket of destination account
        await addTransaction(user.uid, {
            accountId: loanDepositAccountId,
            amount: amt,
            bucket: 'deposit',
            date: lLocalDate,
            notes: loanNotes || `Loan from ${fromAcc.name} saving`,
            loanId: newLoanId,
        });
        setLoanAmount('');
        setLoanNotes('');
        setShowLoanForm(false);
    };

    const handleRepayLoan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isViewer || !repayLoanId || !repayAmount) return;
        const loan = loans.find((l) => l.id === repayLoanId);
        if (!loan) return;
        const fromAcc = accounts.find((a) => a.id === loan.accountId);
        const toAcc = accounts.find((a) => a.id === loan.depositAccountId);
        if (!fromAcc) return;
        const amt = parseFloat(repayAmount);
        if (isNaN(amt) || amt <= 0) return;
        const remaining = loanBalance(loan);
        if (amt > remaining) {
            alert(`Repayment exceeds outstanding balance of ${formatCurrency(remaining, fromAcc.currency)}`);
            return;
        }
        if (!confirm(`Repay ${formatCurrency(amt, fromAcc.currency)} toward loan from ${fromAcc.name}?`)) return;
        const [ry, rm, rd] = repayDate.split('-').map(Number);
        const rLocalDate = new Date(ry, rm - 1, rd);
        // Deposit back to saving bucket of source account
        await addTransaction(user.uid, {
            accountId: loan.accountId,
            amount: amt,
            bucket: 'saving',
            date: rLocalDate,
            notes: repayNotes || `Loan repayment`,
        });
        // Withdraw from deposit bucket of destination account
        if (toAcc) {
            await addTransaction(user.uid, {
                accountId: loan.depositAccountId,
                amount: -amt,
                bucket: 'deposit',
                date: rLocalDate,
                notes: repayNotes || `Loan repayment to ${fromAcc.name}`,
            });
        }
        // Record repayment
        await addLoanRepayment(user.uid, {
            loanId: repayLoanId,
            amount: amt,
            date: rLocalDate,
            notes: repayNotes,
        });
        // Update loan balance
        await updateLoan(user.uid, repayLoanId, {
            balance: remaining - amt,
        });
        setRepayAmount('');
        setRepayNotes('');
        setRepayLoanId(null);
    };

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
                {!isViewer && (
                    <div className="flex gap-2">
                        <button onClick={() => setShowAccountForm(!showAccountForm)} className="btn-secondary">
                            + Account
                        </button>
                        <button
                            onClick={() => { setShowTransferForm(!showTransferForm); setShowForm(false); setShowLoanForm(false); }}
                            className="btn-secondary"
                            disabled={accounts.length < 1}
                        >
                            Transfer
                        </button>
                        <button
                            onClick={() => { setShowLoanForm(!showLoanForm); setShowForm(false); setShowTransferForm(false); }}
                            className="btn-secondary"
                            disabled={accounts.length < 1}
                        >
                            Loan
                        </button>
                        <button onClick={() => { setEditingTxnId(null); setAmount(''); setNotes(''); setDate(new Date().toISOString().slice(0, 10)); setBucket('saving'); setShowForm(!showForm); setShowTransferForm(false); setShowLoanForm(false); }} className="btn-primary">
                            + Transaction
                        </button>
                    </div>
                )}
            </div>

            {/* ── Add Account Form ─────────────────────── */}
            {showAccountForm && !isViewer && (
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
                        <div className="sm:col-span-3">
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={newAccExternal} onChange={(e) => setNewAccExternal(e.target.checked)} className="rounded border-slate-300" />
                                External (not funded by salary — excluded from untracked calculation)
                            </label>
                        </div>
                        <div className="sm:col-span-3 flex gap-2">
                            <button type="submit" className="btn-primary">Create</button>
                            <button type="button" onClick={() => setShowAccountForm(false)} className="btn-secondary">Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Transfer Form ────────────────────────── */}
            {showTransferForm && !isViewer && (
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
            {showForm && !isViewer && (
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

            {/* ── Loan Request Form ────────────────────── */}
            {showLoanForm && !isViewer && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Request Loan from Savings</h2>
                    {accounts.length === 0 ? (
                        <p className="text-sm text-slate-400">Create a saving place first.</p>
                    ) : (
                        <form onSubmit={handleRequestLoan} className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label">From Account (Saving)</label>
                                <select className="select w-full" value={loanAccountId} onChange={(e) => setLoanAccountId(e.target.value)}>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name} ({a.currency}) — Saving: {formatCurrency(balanceOf(a.id, 'saving'), a.currency)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">To Account (Deposit)</label>
                                <select className="select w-full" value={loanDepositAccountId} onChange={(e) => setLoanDepositAccountId(e.target.value)}>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name} ({a.currency}) — Deposit: {formatCurrency(balanceOf(a.id, 'deposit'), a.currency)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">Amount ({accounts.find((a) => a.id === loanAccountId)?.currency ?? ''})</label>
                                <input type="number" step="0.001" min="0.001" className="input w-full" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="Loan amount" required />
                            </div>
                            <div>
                                <label className="label">Date</label>
                                <input type="date" className="input w-full" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} required />
                            </div>
                            <div>
                                <label className="label">Notes</label>
                                <input type="text" className="input w-full" value={loanNotes} onChange={(e) => setLoanNotes(e.target.value)} placeholder="Optional" />
                            </div>
                            <div className="sm:col-span-2 flex gap-2">
                                <button type="submit" className="btn-primary">Take Loan</button>
                                <button type="button" onClick={() => setShowLoanForm(false)} className="btn-secondary">Cancel</button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* ── Active Loans ─────────────────────────── */}
            {activeLoans.length > 0 && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Outstanding Loans</h2>
                    <div className="space-y-4">
                        {activeLoans.map((loan) => {
                            const fromAcc = accounts.find((a) => a.id === loan.accountId);
                            const toAcc = accounts.find((a) => a.id === loan.depositAccountId);
                            const currency = fromAcc?.currency ?? 'OMR';
                            const remaining = loanBalance(loan);
                            const repaid = loan.principal - remaining;
                            const pct = loan.principal > 0 ? (repaid / loan.principal) * 100 : 0;
                            const repays = loanRepayments.filter((r) => r.loanId === loan.id);
                            const isRepaying = repayLoanId === loan.id;

                            return (
                                <div key={loan.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">
                                                {fromAcc?.name ?? 'Unknown'} → {toAcc?.name ?? 'Unknown'}
                                                <span className="ml-2 text-xs text-slate-400">
                                                    {loan.date.toLocaleDateString()}
                                                </span>
                                            </p>
                                            {loan.notes && <p className="text-xs text-slate-400">{loan.notes}</p>}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-amber-700">
                                                {formatCurrency(remaining, currency)} remaining
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                of {formatCurrency(loan.principal, currency)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="h-2 rounded-full bg-amber-100 overflow-hidden mb-3">
                                        <div
                                            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>

                                    {/* Repayment history */}
                                    {repays.length > 0 && (
                                        <div className="space-y-1 mb-3">
                                            {repays.map((r) => (
                                                <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-amber-100">
                                                    <span className="text-slate-500">
                                                        {r.date.toLocaleDateString()}
                                                        {r.notes && ` · ${r.notes}`}
                                                    </span>
                                                    <span className="font-medium text-emerald-600">+{formatCurrency(r.amount, currency)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Repay / Delete */}
                                    {!isViewer && (
                                        isRepaying ? (
                                            <form onSubmit={handleRepayLoan} className="flex flex-wrap gap-2">
                                                <input
                                                    type="number" step="0.001" min="0.001"
                                                    className="input w-28"
                                                    value={repayAmount}
                                                    onChange={(e) => setRepayAmount(e.target.value)}
                                                    placeholder="Amount"
                                                    required
                                                />
                                                <input
                                                    type="date"
                                                    className="input w-36"
                                                    value={repayDate}
                                                    onChange={(e) => setRepayDate(e.target.value)}
                                                    required
                                                />
                                                <input
                                                    type="text"
                                                    className="input flex-1 min-w-[100px]"
                                                    value={repayNotes}
                                                    onChange={(e) => setRepayNotes(e.target.value)}
                                                    placeholder="Note (optional)"
                                                />
                                                <button type="submit" className="btn-primary text-xs">Repay</button>
                                                <button type="button" onClick={() => setRepayLoanId(null)} className="btn-secondary text-xs">Cancel</button>
                                            </form>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setRepayLoanId(loan.id); setRepayAmount(''); setRepayNotes(''); setRepayDate(new Date().toISOString().slice(0, 10)); }}
                                                    className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full hover:bg-emerald-700 transition-colors"
                                                >
                                                    Make Repayment
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLoan(loan)}
                                                    className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-full hover:bg-red-200 transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Settled Loans ─────────────────────────── */}
            {settledLoans.length > 0 && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Settled Loans</h2>
                    <div className="space-y-2">
                        {settledLoans.map((loan) => {
                            const fromAcc = accounts.find((a) => a.id === loan.accountId);
                            const toAcc = accounts.find((a) => a.id === loan.depositAccountId);
                            const currency = fromAcc?.currency ?? 'OMR';
                            return (
                                <div key={loan.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                                    <div>
                                        <p className="text-sm text-slate-600">
                                            {fromAcc?.name ?? 'Unknown'} → {toAcc?.name ?? 'Unknown'}
                                            <span className="ml-2 text-xs text-slate-400">{loan.date.toLocaleDateString()}</span>
                                        </p>
                                        {loan.notes && <p className="text-xs text-slate-400">{loan.notes}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-500">{formatCurrency(loan.principal, currency)}</span>
                                        <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Settled</span>
                                        {!isViewer && (
                                            <button
                                                onClick={() => handleDeleteLoan(loan)}
                                                className="text-xs text-red-500 hover:text-red-700 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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
                                        {account.isExternal && <span className="text-[10px] font-medium bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">External</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{account.type} · {account.currency}</span>
                                        {!isViewer && <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleExternal(account.id, !!account.isExternal); }}
                                            className={`text-[10px] px-1.5 py-0.5 rounded ${account.isExternal ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                            title={account.isExternal ? 'Mark as income-funded' : 'Mark as external'}
                                        >{account.isExternal ? '⛒ Income' : '⛒ External'}</button>}
                                        {!isViewer && <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id); }}
                                            className="text-xs text-slate-300 hover:text-red-500"
                                        >✕</button>}
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
                                {account.cards && account.cards.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {account.cards.map((c) => (
                                            <span key={c} className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">•••• {c}</span>
                                        ))}
                                    </div>
                                )}
                                {!isViewer && (
                                    <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            id={`card-input-${account.id}`}
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="Add card (last 4)"
                                            maxLength={4}
                                            className="w-28 text-xs rounded border border-slate-200 px-2 py-1"
                                            onKeyDown={async (e) => {
                                                if (e.key !== 'Enter') return;
                                                e.preventDefault();
                                                const input = e.currentTarget;
                                                const val = input.value.trim();
                                                if (!/^\d{4}$/.test(val)) return;
                                                if (account.cards?.includes(val)) { input.value = ''; return; }
                                                await updateAccount(user!.uid, account.id, { cards: [...(account.cards || []), val] });
                                                input.value = '';
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const input = document.getElementById(`card-input-${account.id}`) as HTMLInputElement;
                                                if (!input) return;
                                                const val = input.value.trim();
                                                if (!/^\d{4}$/.test(val)) return;
                                                if (account.cards?.includes(val)) { input.value = ''; return; }
                                                await updateAccount(user!.uid, account.id, { cards: [...(account.cards || []), val] });
                                                input.value = '';
                                            }}
                                            className="text-[10px] px-1.5 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                                        >+Add</button>
                                        {account.cards?.map((c) => (
                                            <button
                                                key={c}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    await updateAccount(user!.uid, account.id, { cards: (account.cards || []).filter((x) => x !== c) });
                                                }}
                                                className="text-[10px] text-red-400 hover:text-red-600"
                                                title={`Remove card ${c}`}
                                            >✕{c}</button>
                                        ))}
                                    </div>
                                )}
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
                                        {!isViewer && <button onClick={() => handleEditTxn(txn)} className="text-xs text-slate-300 hover:text-emerald-600">Edit</button>}
                                        {!isViewer && <button onClick={() => handleDeleteTxn(txn.id)} className="text-xs text-slate-300 hover:text-red-500">✕</button>}
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
