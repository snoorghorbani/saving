'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import {
    subscribeToExpenses,
    addExpense,
    deleteExpense,
    updateExpense,
    subscribeToExpenseEntries,
    addExpenseEntry,
    deleteExpenseEntry,
    updateExpenseEntry,
    subscribeToAccounts,
    addTransaction,
    subscribeToTransactions,
    deleteTransaction,
} from '@/lib/firestore';
import type { Expense, ExpenseEntry, Account, Transaction } from '@/types';
import { CATEGORIES, FREQUENCIES, EXPENSE_KINDS } from '@/types';
import type { Category, Frequency, ExpenseKind } from '@/types';
import { formatOMR, toWeekly, getWeekRange, isDueInWeek, getEffectiveBudget, futureWeeklyImpact, weeksUntil, futureWeeklyPortion, totalWeeksForFuture } from '@/lib/utils';
import { convert } from '@/lib/currency';
import { useMemo } from 'react';

export default function ExpensesPage() {
    const { user, effectiveUserId, isViewer } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [entries, setEntries] = useState<ExpenseEntry[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [payFromAccount, setPayFromAccount] = useState('');
    const [weekOffset, setWeekOffset] = useState(0);

    // Expense form state
    const [kind, setKind] = useState<ExpenseKind>('fixed-payment');
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [frequency, setFrequency] = useState<Frequency>('monthly');
    const [category, setCategory] = useState<Category>('Other');
    const [isUnexpected, setIsUnexpected] = useState(false);
    const [weeklyBudget, setWeeklyBudget] = useState('');
    const [dueDay, setDueDay] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [estimatedTotal, setEstimatedTotal] = useState('');
    const [deadline, setDeadline] = useState('');
    const [notes, setNotes] = useState('');

    // Entry form state
    const [entryExpenseId, setEntryExpenseId] = useState<string | null>(null);
    const [entryAmount, setEntryAmount] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
    const [entryNotes, setEntryNotes] = useState('');

    // Entry action menu state
    const [entryMenuId, setEntryMenuId] = useState<string | null>(null);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editEntryAmount, setEditEntryAmount] = useState('');
    const [editEntryNotes, setEditEntryNotes] = useState('');
    const [editEntryExpenseId, setEditEntryExpenseId] = useState('');

    useEffect(() => {
        if (!effectiveUserId) return;
        const unsub1 = subscribeToExpenses(effectiveUserId, setExpenses);
        const unsub2 = subscribeToExpenseEntries(effectiveUserId, setEntries);
        const unsub3 = subscribeToAccounts(effectiveUserId, setAccounts);
        const unsub4 = subscribeToTransactions(effectiveUserId, setAllTransactions);
        return () => {
            unsub1();
            unsub2();
            unsub3();
            unsub4();
        };
    }, [effectiveUserId]);

    // Set default pay-from account
    useEffect(() => {
        if (accounts.length > 0 && !payFromAccount) {
            setPayFromAccount(accounts[0].id);
        }
    }, [accounts, payFromAccount]);

    // ── Week helpers ──────────────────────
    const selectedWeek = getWeekRange(weekOffset);
    const selectedNextWeek = getWeekRange(weekOffset + 1);
    const isCurrentWeek = weekOffset === 0;

    const entriesForExpense = (expenseId: string) =>
        entries.filter((e) => e.expenseId === expenseId);

    const spentInWeek = (expenseId: string, start: Date, end: Date) =>
        entries
            .filter((e) => e.expenseId === expenseId && e.date >= start && e.date <= end)
            .reduce((sum, e) => sum + e.amount, 0);

    const spentSelectedWeek = (expenseId: string) => spentInWeek(expenseId, selectedWeek.start, selectedWeek.end);

    // ── Paid check for fixed payments ─────
    const isPaidInPeriod = (expense: Expense, weekStart: Date, weekEnd: Date): boolean => {
        if (expense.frequency === 'weekly') {
            return entries.some(
                (e) => e.expenseId === expense.id && e.date >= weekStart && e.date <= weekEnd
            );
        }
        if (expense.frequency === 'monthly') {
            const day = expense.dueDay ?? 1;
            let refDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), day);
            if (refDate < weekStart || refDate > weekEnd) {
                refDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), day);
            }
            const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
            const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
            return entries.some(
                (e) => e.expenseId === expense.id && e.date >= monthStart && e.date <= monthEnd
            );
        }
        return entries.some(
            (e) => e.expenseId === expense.id && e.date >= weekStart && e.date <= weekEnd
        );
    };

    const handleMarkAsPaid = async (expense: Expense) => {
        if (!user || isViewer || !isCurrentWeek) return;
        const acc = accounts.find((a) => a.id === payFromAccount);
        if (!acc) { alert('Please select a Pay From account first.'); return; }
        const amtInAccCurrency = acc.currency === 'OMR' ? expense.amount : await convert(expense.amount, 'OMR', acc.currency);
        if (!confirm(`Mark "${expense.name}" as paid (${formatOMR(expense.amount)}) from ${acc.name}?`)) return;
        const entryRef = await addExpenseEntry(user.uid, {
            expenseId: expense.id,
            amount: expense.amount,
            date: new Date(),
            notes: `${expense.name} payment`,
            accountId: payFromAccount,
        });
        await addTransaction(user.uid, {
            accountId: payFromAccount,
            amount: -amtInAccCurrency,
            bucket: 'deposit',
            date: new Date(),
            notes: `Expense: ${expense.name} [entry:${entryRef.id}]`,
        });
    };

    const handleUndoPaid = async (expense: Expense, weekStart: Date, weekEnd: Date) => {
        if (!user || isViewer || !isCurrentWeek) return;
        if (!confirm(`Undo payment for "${expense.name}"?`)) return;
        let matchEntries = entries.filter(
            (e) => e.expenseId === expense.id && e.date >= weekStart && e.date <= weekEnd
        );
        if (expense.frequency === 'monthly') {
            const day = expense.dueDay ?? 1;
            let refDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), day);
            if (refDate < weekStart || refDate > weekEnd) {
                refDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), day);
            }
            const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
            const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
            matchEntries = entries.filter(
                (e) => e.expenseId === expense.id && e.date >= monthStart && e.date <= monthEnd
            );
        }
        if (matchEntries.length > 0) {
            const entryId = matchEntries[0].id;
            // Find linked withdrawal BEFORE deleting the entry
            const linkedTxn = allTransactions.find((t) => (t.notes || '').includes(`[entry:${entryId}]`));
            await deleteExpenseEntry(user.uid, entryId);
            if (linkedTxn) await deleteTransaction(user.uid, linkedTxn.id);
        }
    };

    // ── Entry edit/delete handlers ────────
    const handleDeleteEntry = async (entry: ExpenseEntry) => {
        if (!user || isViewer) return;
        if (!confirm('Delete this entry?')) return;
        const linkedTxn = allTransactions.find((t) => (t.notes || '').includes(`[entry:${entry.id}]`));
        await deleteExpenseEntry(user.uid, entry.id);
        if (linkedTxn) await deleteTransaction(user.uid, linkedTxn.id);
    };

    const startEditEntry = (entry: ExpenseEntry) => {
        setEditingEntryId(entry.id);
        setEditEntryAmount(String(entry.amount));
        setEditEntryNotes(entry.notes);
        setEditEntryExpenseId(entry.expenseId);
        setEntryMenuId(null);
    };

    const handleSaveEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isViewer || !editingEntryId) return;
        const amt = parseFloat(editEntryAmount);
        if (isNaN(amt) || amt <= 0) return;
        await updateExpenseEntry(user.uid, editingEntryId, {
            amount: amt,
            notes: editEntryNotes,
            expenseId: editEntryExpenseId,
        });
        setEditingEntryId(null);
    };

    // ── Form handlers ─────────────────────
    const resetForm = () => {
        setKind('fixed-payment');
        setName('');
        setAmount('');
        setFrequency('monthly');
        setCategory('Other');
        setIsUnexpected(false);
        setWeeklyBudget('');
        setDueDay('');
        setDueDate('');
        setEstimatedTotal('');
        setDeadline('');
        setNotes('');
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isViewer || !name) return;

        const data = {
            kind,
            name,
            amount: amount ? parseFloat(amount) : 0,
            frequency: kind === 'budget' ? 'weekly' as Frequency : kind === 'one-time' || kind === 'future' ? 'one-time' as Frequency : frequency,
            category,
            isUnexpected,
            weeklyBudget: weeklyBudget ? parseFloat(weeklyBudget) : null,
            dueDay: dueDay ? parseInt(dueDay) : null,
            dueDate: dueDate || null,
            estimatedTotal: estimatedTotal ? parseFloat(estimatedTotal) : null,
            deadline: deadline || null,
            notes,
        };

        if (editingId) {
            await updateExpense(user.uid, editingId, data);
        } else {
            await addExpense(user.uid, data);
        }
        resetForm();
    };

    const handleEdit = (expense: Expense) => {
        setKind(getKind(expense));
        setName(expense.name);
        setAmount(expense.amount.toString());
        setFrequency(expense.frequency);
        setCategory(expense.category);
        setIsUnexpected(expense.isUnexpected);
        setWeeklyBudget(expense.weeklyBudget?.toString() ?? '');
        setDueDay(expense.dueDay?.toString() ?? '');
        setDueDate(expense.dueDate ?? '');
        setEstimatedTotal(expense.estimatedTotal?.toString() ?? '');
        setDeadline(expense.deadline ?? '');
        setNotes(expense.notes);
        setEditingId(expense.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!user || isViewer) return;
        if (!confirm('Delete this expense?')) return;
        await deleteExpense(user.uid, id);
    };

    // ── Categorise expenses by kind ───────
    // Backwards compat: old expenses without `kind` infer from fields
    const getKind = (e: Expense): ExpenseKind =>
        e.kind ?? (e.frequency === 'one-time' ? 'one-time' : e.weeklyBudget != null && e.amount <= 0 ? 'budget' : 'fixed-payment');

    const fixedPayments = expenses.filter((e) => !e.isUnexpected && getKind(e) === 'fixed-payment');
    const budgetExpenses = expenses.filter((e) => !e.isUnexpected && getKind(e) === 'budget');
    const oneTimeExpenses = expenses.filter((e) => !e.isUnexpected && getKind(e) === 'one-time');
    const futureExpenses = expenses.filter((e) => !e.isUnexpected && getKind(e) === 'future');
    const unexpectedExpenses = expenses.filter((e) => e.isUnexpected);

    // Fixed payments due this/next week
    const thisWeekFixed = fixedPayments.filter((e) => isDueInWeek(e, selectedWeek.start, selectedWeek.end));
    const nextWeekFixed = fixedPayments.filter((e) => isDueInWeek(e, selectedNextWeek.start, selectedNextWeek.end));

    // Weekly impact of all fixed payments
    const fixedWeeklyImpact = fixedPayments.reduce((sum, e) => sum + toWeekly(e.amount, e.frequency), 0);

    // Budget totals
    const budgetTotalBase = budgetExpenses.reduce((sum, e) => sum + (e.weeklyBudget ?? 0), 0);
    const budgetTotalSpent = budgetExpenses.reduce((sum, e) => sum + spentSelectedWeek(e.id), 0);

    const formatDateRange = (start: Date, end: Date) =>
        `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    // ── Past weeks / months expense totals ──
    const pastExpenseData = useMemo(() => {
        const now_ = new Date();
        const curWeekStart = new Date(now_);
        curWeekStart.setDate(now_.getDate() - ((now_.getDay() + 1) % 7));
        curWeekStart.setHours(0, 0, 0, 0);
        const earliest = new Date(2026, 2, 1); // March 1, 2026

        const purchaseEntries = entries.filter((e) => e.type !== 'set-aside');

        const weeks: { label: string; total: number }[] = [];
        for (let i = 1; ; i++) {
            const wStart = new Date(curWeekStart);
            wStart.setDate(wStart.getDate() - 7 * i);
            if (wStart < earliest) break;
            const wEnd = new Date(wStart);
            wEnd.setDate(wEnd.getDate() + 6);
            wEnd.setHours(23, 59, 59, 999);
            let total = 0;
            for (const e of purchaseEntries) {
                if (e.date >= wStart && e.date <= wEnd) total += e.amount;
            }
            const label = `${wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            weeks.push({ label, total });
        }

        const months: { label: string; total: number }[] = [];
        for (let i = 1; ; i++) {
            const mStart = new Date(now_.getFullYear(), now_.getMonth() - i, 1);
            if (mStart < earliest) break;
            const mEnd = new Date(now_.getFullYear(), now_.getMonth() - i + 1, 0, 23, 59, 59, 999);
            let total = 0;
            for (const e of purchaseEntries) {
                if (e.date >= mStart && e.date <= mEnd) total += e.amount;
            }
            const label = mStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            months.push({ label, total });
        }

        return { weeks, months };
    }, [entries]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
                {!isViewer && (
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="btn-primary"
                    >
                        + Add Expense
                    </button>
                )}
            </div>

            {/* ── Week Navigation ──────────────────────── */}
            <div className="card flex items-center justify-between">
                <button
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                    ← Previous
                </button>
                <div className="text-center">
                    <p className="text-sm font-semibold text-slate-800">
                        {isCurrentWeek ? 'This Week' : weekOffset === -1 ? 'Last Week' : weekOffset === 1 ? 'Next Week' : formatDateRange(selectedWeek.start, selectedWeek.end)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateRange(selectedWeek.start, selectedWeek.end)}</p>
                </div>
                <div className="flex items-center gap-2">
                    {!isCurrentWeek && (
                        <button
                            onClick={() => setWeekOffset(0)}
                            className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        >
                            Today
                        </button>
                    )}
                    <button
                        onClick={() => setWeekOffset(weekOffset + 1)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Next →
                    </button>
                </div>
            </div>

            {/* ── Add / Edit Form ──────────────────────── */}
            {showForm && !isViewer && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">
                        {editingId ? 'Edit Expense' : 'New Expense'}
                    </h2>
                    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                        {/* Kind selector */}
                        <div className="sm:col-span-2">
                            <label className="label">Type</label>
                            <div className="grid gap-2 sm:grid-cols-4">
                                {EXPENSE_KINDS.map((k) => (
                                    <button
                                        key={k.value}
                                        type="button"
                                        onClick={() => setKind(k.value)}
                                        className={`rounded-lg border p-3 text-left transition-colors ${kind === k.value
                                            ? 'border-emerald-500 bg-emerald-50'
                                            : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        <p className={`text-sm font-medium ${kind === k.value ? 'text-emerald-700' : 'text-slate-700'}`}>
                                            {k.label}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5">{k.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="label">Name</label>
                            <input
                                type="text"
                                className="input w-full"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={kind === 'budget' ? 'e.g. Groceries' : 'e.g. Rent'}
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Category</label>
                            <select
                                className="select w-full"
                                value={category}
                                onChange={(e) => setCategory(e.target.value as Category)}
                            >
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        {/* Fixed payment fields */}
                        {kind === 'fixed-payment' && (
                            <>
                                <div>
                                    <label className="label">Amount (OMR)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        className="input w-full"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="e.g. 100"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="label">Frequency</label>
                                    <select
                                        className="select w-full"
                                        value={frequency}
                                        onChange={(e) => setFrequency(e.target.value as Frequency)}
                                    >
                                        {FREQUENCIES.filter((f) => f !== 'one-time').map((f) => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                                {frequency === 'monthly' && (
                                    <div>
                                        <label className="label">Due Day of Month</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            className="input w-full"
                                            value={dueDay}
                                            onChange={(e) => setDueDay(e.target.value)}
                                            placeholder="e.g. 1"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                        {/* Budget fields */}
                        {kind === 'budget' && (
                            <div>
                                <label className="label">Weekly Budget (OMR)</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    className="input w-full"
                                    value={weeklyBudget}
                                    onChange={(e) => setWeeklyBudget(e.target.value)}
                                    placeholder="e.g. 25"
                                    required
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    Resets weekly; surplus/deficit carries over
                                </p>
                            </div>
                        )}
                        {/* One-time fields */}
                        {kind === 'one-time' && (
                            <>
                                <div>
                                    <label className="label">Amount (OMR)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        className="input w-full"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="e.g. 50"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="label">Due Date (optional)</label>
                                    <input
                                        type="date"
                                        className="input w-full"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Schedule when this payment is due</p>
                                </div>
                            </>
                        )}
                        {/* Future expense fields */}
                        {kind === 'future' && (
                            <>
                                <div>
                                    <label className="label">Estimated Total (OMR)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        className="input w-full"
                                        value={estimatedTotal}
                                        onChange={(e) => setEstimatedTotal(e.target.value)}
                                        placeholder="e.g. 2000"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="label">Deadline</label>
                                    <input
                                        type="date"
                                        className="input w-full"
                                        value={deadline}
                                        onChange={(e) => setDeadline(e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-slate-400 mt-1">
                                        {deadline ? `~${weeksUntil(deadline)} week(s) remaining` : 'When must this be fully paid?'}
                                    </p>
                                </div>
                            </>
                        )}
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
                        <div className="sm:col-span-2 flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isUnexpected}
                                    onChange={(e) => setIsUnexpected(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                />
                                <span className="text-sm text-slate-600">Unexpected expense</span>
                            </label>
                        </div>
                        <div className="sm:col-span-2 flex gap-2">
                            <button type="submit" className="btn-primary">
                                {editingId ? 'Update' : 'Add'}
                            </button>
                            <button type="button" onClick={resetForm} className="btn-secondary">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Pay From Account ──────────────────────── */}
            {accounts.length > 0 && isCurrentWeek && (
                <div className="card flex items-center gap-3">
                    <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Pay From:</label>
                    <select
                        className="select flex-1"
                        value={payFromAccount}
                        onChange={(e) => setPayFromAccount(e.target.value)}
                    >
                        {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-400">Payments will withdraw from this account&apos;s deposit bucket</p>
                </div>
            )}

            {/* ── All Entries This Week ────────────────── */}
            {(() => {
                const weekEntries = entries.filter(
                    (e) => e.type !== 'set-aside' && e.date >= selectedWeek.start && e.date <= selectedWeek.end
                );
                const weekTotal = weekEntries.reduce((sum, e) => sum + e.amount, 0);
                return (
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-800">
                                {isCurrentWeek ? 'This Week\u2019s Entries' : 'Week Entries'}
                            </h2>
                            <span className="text-sm font-bold text-slate-600">Total: {formatOMR(weekTotal)}</span>
                        </div>
                        {weekEntries.length === 0 ? (
                            <p className="text-sm text-slate-400">No expenses recorded this week.</p>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {weekEntries.map((entry) => {
                                    const expense = expenses.find((e) => e.id === entry.expenseId);
                                    const isEditing = editingEntryId === entry.id;
                                    const isMenuOpen = entryMenuId === entry.id;
                                    // Show merchant from notes if it's an SMS entry, otherwise the expense name
                                    const displayName = entry.notes?.replace(/\s*\(SMS\)\s*$/, '') || expense?.name || 'Unknown';
                                    const isSms = entry.notes?.endsWith('(SMS)');

                                    if (isEditing) {
                                        return (
                                            <form key={entry.id} onSubmit={handleSaveEntry} className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                                                <div className="grid gap-2 sm:grid-cols-3">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Amount (OMR)</label>
                                                        <input type="number" step="0.001" min="0.001" className="input w-full text-sm" value={editEntryAmount} onChange={(e) => setEditEntryAmount(e.target.value)} required />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Category</label>
                                                        <select className="select w-full text-sm" value={editEntryExpenseId} onChange={(e) => setEditEntryExpenseId(e.target.value)}>
                                                            {expenses.map((exp) => (
                                                                <option key={exp.id} value={exp.id}>{exp.name} ({exp.category})</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Notes</label>
                                                        <input type="text" className="input w-full text-sm" value={editEntryNotes} onChange={(e) => setEditEntryNotes(e.target.value)} />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="submit" className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Save</button>
                                                    <button type="button" onClick={() => setEditingEntryId(null)} className="text-xs bg-slate-200 text-slate-600 px-3 py-1 rounded hover:bg-slate-300">Cancel</button>
                                                </div>
                                            </form>
                                        );
                                    }

                                    return (
                                        <div key={entry.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">
                                                    {displayName}
                                                    <span className="ml-1.5 text-xs text-slate-400">{expense?.category}</span>
                                                    {isSms && <span className="ml-1 text-xs text-blue-400">SMS</span>}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {entry.date.toLocaleDateString()}
                                                    {!isSms && entry.notes && ` · ${entry.notes}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-red-600">{formatOMR(entry.amount)}</span>
                                                {!isViewer && (
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setEntryMenuId(isMenuOpen ? null : entry.id)}
                                                            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                                        </button>
                                                        {isMenuOpen && (
                                                            <div className="absolute right-0 top-8 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-28">
                                                                <button
                                                                    onClick={() => startEditEntry(entry)}
                                                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => { setEntryMenuId(null); handleDeleteEntry(entry); }}
                                                                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ── Weekly Summary ────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-5">
                <div className="card">
                    <p className="text-sm text-slate-500">Fixed / Week</p>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatOMR(fixedWeeklyImpact)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{fixedPayments.length} recurring</p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Budgets / Week</p>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatOMR(budgetTotalBase)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{budgetExpenses.length} tracked</p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Budget Spent</p>
                    <p className={`text-2xl font-bold ${budgetTotalSpent > budgetTotalBase ? 'text-red-500' : 'text-emerald-600'}`}>
                        {formatOMR(budgetTotalSpent)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Future / Week</p>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatOMR(futureExpenses.reduce((sum, e) => sum + futureWeeklyImpact(e), 0))}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{futureExpenses.length} planned</p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Total / Week</p>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatOMR(fixedWeeklyImpact + budgetTotalBase + futureExpenses.reduce((sum, e) => sum + futureWeeklyImpact(e), 0))}
                    </p>
                </div>
            </div>

            {/* ═══════════════════════════════════════════
                 SECTION 1: FIXED PAYMENTS
                 ═══════════════════════════════════════════ */}

            {/* ── This Week's Due ──────────────────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">
                        This Week&apos;s Payments
                    </h2>
                    <span className="text-sm text-slate-400">{formatDateRange(selectedWeek.start, selectedWeek.end)}</span>
                </div>
                {thisWeekFixed.length === 0 ? (
                    <p className="text-sm text-slate-400">No payments due this week.</p>
                ) : (
                    <div className="space-y-3">
                        {thisWeekFixed.map((expense) => {
                            const paid = isPaidInPeriod(expense, selectedWeek.start, selectedWeek.end);
                            const weeklyImpact = toWeekly(expense.amount, expense.frequency);
                            return (
                                <div
                                    key={expense.id}
                                    className={`flex items-center justify-between py-3 px-4 rounded-lg border ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                                        }`}
                                >
                                    <div>
                                        <p className={`text-sm font-medium ${paid ? 'text-emerald-700' : 'text-slate-700'}`}>
                                            {expense.name}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {expense.category} · {formatOMR(expense.amount)}/{expense.frequency}
                                            {expense.frequency === 'monthly' && ` · Day ${expense.dueDay ?? 1}`}
                                            {expense.frequency !== 'weekly' && ` · ~${formatOMR(weeklyImpact)}/wk`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className={`text-sm font-bold ${paid ? 'text-emerald-700' : 'text-slate-800'}`}>
                                            {formatOMR(expense.amount)}
                                        </p>
                                        {paid ? (
                                            isViewer ? (
                                                <span className="text-xs text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full">✓ Paid</span>
                                            ) : (
                                                <button
                                                    onClick={() => handleUndoPaid(expense, selectedWeek.start, selectedWeek.end)}
                                                    className="text-xs text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full hover:bg-emerald-200 transition-colors"
                                                >
                                                    ✓ Paid
                                                </button>
                                            )
                                        ) : !isViewer ? (
                                            <button
                                                onClick={() => handleMarkAsPaid(expense)}
                                                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full hover:bg-emerald-700 transition-colors"
                                            >
                                                Mark as Paid
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Next Week's Due ──────────────────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">
                        Next Week&apos;s Payments
                    </h2>
                    <span className="text-sm text-slate-400">{formatDateRange(selectedNextWeek.start, selectedNextWeek.end)}</span>
                </div>
                {nextWeekFixed.length === 0 ? (
                    <p className="text-sm text-slate-400">No payments due next week.</p>
                ) : (
                    <div className="space-y-3">
                        {nextWeekFixed.map((expense) => (
                            <div
                                key={expense.id}
                                className="flex items-center justify-between py-3 px-4 rounded-lg border border-slate-200 bg-slate-50"
                            >
                                <div>
                                    <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                    <p className="text-xs text-slate-400">
                                        {expense.category}
                                        {expense.frequency === 'monthly' && ` · Day ${expense.dueDay ?? 1}`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <p className="text-sm font-bold text-slate-800">{formatOMR(expense.amount)}</p>
                                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">Upcoming</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── All Fixed Payments (weekly impact) ───── */}
            {fixedPayments.length > 0 && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-800">All Fixed Payments</h2>
                        <span className="text-sm font-bold text-slate-600">
                            Weekly impact: {formatOMR(fixedWeeklyImpact)}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {fixedPayments.map((expense) => {
                            const weeklyImpact = toWeekly(expense.amount, expense.frequency);
                            return (
                                <div key={expense.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                        <p className="text-xs text-slate-400">
                                            {expense.category} · {formatOMR(expense.amount)}/{expense.frequency}
                                            {expense.frequency === 'monthly' && ` · Day ${expense.dueDay ?? 1}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-800">{formatOMR(weeklyImpact)}/wk</p>
                                        </div>
                                        {!isViewer && <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit</button>}
                                        {!isViewer && <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════
                 SECTION 2: WEEKLY BUDGETS (with carryover)
                 ═══════════════════════════════════════════ */}
            {budgetExpenses.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-slate-800">Weekly Budgets</h2>
                    {budgetExpenses.map((expense) => {
                        const { baseBudget, carryover, effectiveBudget } = getEffectiveBudget(expense, entries);
                        const spent = spentSelectedWeek(expense.id);
                        const remaining = effectiveBudget - spent;
                        const pct = effectiveBudget > 0 ? Math.min((spent / effectiveBudget) * 100, 100) : 0;
                        const isExpanded = expandedId === expense.id;
                        const expEntries = entriesForExpense(expense.id);

                        return (
                            <div key={expense.id} className="card">
                                <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                                >
                                    <div>
                                        <h3 className="font-semibold text-slate-800">{expense.name}</h3>
                                        <p className="text-xs text-slate-400">
                                            {expense.category} · {formatOMR(baseBudget)}/wk
                                            {carryover !== 0 && (
                                                <span className={carryover > 0 ? ' text-emerald-500' : ' text-red-400'}>
                                                    {' '}({carryover > 0 ? '+' : ''}{formatOMR(carryover)} from last wk)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800">
                                            {formatOMR(spent)}{' '}
                                            <span className="text-slate-400 font-normal">/ {formatOMR(effectiveBudget)}</span>
                                        </p>
                                        <p className={`text-xs ${remaining >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {remaining >= 0
                                                ? `${formatOMR(remaining)} left`
                                                : `${formatOMR(Math.abs(remaining))} over`}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>

                                {isExpanded && (
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        {!isViewer && (<form
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                if (!user || !entryAmount) return;
                                                const [ey, em, ed] = entryDate.split('-').map(Number);
                                                const entryDateObj = new Date(ey, em - 1, ed);
                                                const amt = parseFloat(entryAmount);
                                                const acc = accounts.find((a) => a.id === payFromAccount);
                                                const entryRef = await addExpenseEntry(user.uid, {
                                                    expenseId: expense.id,
                                                    amount: amt,
                                                    date: entryDateObj,
                                                    notes: entryNotes,
                                                    accountId: payFromAccount || undefined,
                                                });
                                                if (acc) {
                                                    const converted = acc.currency === 'OMR' ? amt : await convert(amt, 'OMR', acc.currency);
                                                    await addTransaction(user.uid, {
                                                        accountId: acc.id,
                                                        amount: -converted,
                                                        bucket: 'deposit',
                                                        date: entryDateObj,
                                                        notes: `Expense: ${expense.name} [entry:${entryRef.id}]`,
                                                    });
                                                }
                                                setEntryAmount('');
                                                setEntryNotes('');
                                            }}
                                            className="flex flex-wrap gap-2 mb-4"
                                        >
                                            <input
                                                type="number"
                                                step="0.001"
                                                min="0"
                                                className="input w-24"
                                                value={entryExpenseId === expense.id ? entryAmount : ''}
                                                onFocus={() => setEntryExpenseId(expense.id)}
                                                onChange={(e) => { setEntryExpenseId(expense.id); setEntryAmount(e.target.value); }}
                                                placeholder="Amount"
                                                required
                                            />
                                            <input
                                                type="date"
                                                className="input w-36"
                                                value={entryDate}
                                                onChange={(e) => setEntryDate(e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="input flex-1 min-w-[120px]"
                                                value={entryExpenseId === expense.id ? entryNotes : ''}
                                                onFocus={() => setEntryExpenseId(expense.id)}
                                                onChange={(e) => { setEntryExpenseId(expense.id); setEntryNotes(e.target.value); }}
                                                placeholder="What did you buy?"
                                            />
                                            <button type="submit" className="btn-primary text-xs">+ Add</button>
                                        </form>)}

                                        {expEntries.length === 0 ? (
                                            <p className="text-xs text-slate-400">No purchases logged yet.</p>
                                        ) : (
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {expEntries.map((entry) => (
                                                    <div key={entry.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-slate-400 w-20">{entry.date.toLocaleDateString()}</span>
                                                            <span className="text-slate-600">{entry.notes || 'Purchase'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-slate-800">{formatOMR(entry.amount)}</span>
                                                            {!isViewer && <button onClick={() => handleDeleteEntry(entry)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!isViewer && (
                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                                <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit Budget</button>
                                                <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════════════════════════════════════════
                 SECTION 3: ONE-TIME PAYMENTS
                 ═══════════════════════════════════════════ */}
            {oneTimeExpenses.length > 0 && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">One-Time Payments</h2>
                    <div className="space-y-3">
                        {oneTimeExpenses.map((expense) => {
                            const paid = entries.some((e) => e.expenseId === expense.id);
                            return (
                                <div
                                    key={expense.id}
                                    className={`flex items-center justify-between py-3 px-4 rounded-lg border ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                                        }`}
                                >
                                    <div>
                                        <p className={`text-sm font-medium ${paid ? 'text-emerald-700 line-through' : 'text-slate-700'}`}>
                                            {expense.name}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {expense.category}
                                            {expense.dueDate && ` · Due ${new Date(expense.dueDate).toLocaleDateString()}`}
                                            {expense.notes && ` · ${expense.notes}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className={`text-sm font-bold ${paid ? 'text-emerald-600' : 'text-slate-800'}`}>
                                            {formatOMR(expense.amount)}
                                        </p>
                                        {paid ? (
                                            <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">✓ Paid</span>
                                        ) : !isViewer ? (
                                            <button
                                                onClick={() => handleMarkAsPaid(expense)}
                                                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full hover:bg-emerald-700 transition-colors"
                                            >
                                                Pay
                                            </button>
                                        ) : null}
                                        {!isViewer && <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit</button>}
                                        {!isViewer && <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════
                 SECTION 4: FUTURE EXPENSES
                 ═══════════════════════════════════════════ */}
            {futureExpenses.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-slate-800">Future Expenses</h2>
                    {futureExpenses.map((expense) => {
                        const total = expense.estimatedTotal ?? 0;
                        const wks = expense.deadline ? weeksUntil(expense.deadline) : 1;
                        const weeklyImpact = futureWeeklyImpact(expense);
                        const expEntries = entriesForExpense(expense.id);
                        const totalPaid = expEntries.reduce((sum, e) => sum + e.amount, 0);
                        const remaining = total - totalPaid;
                        const pct = total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;
                        const isExpanded = expandedId === expense.id;

                        return (
                            <div key={expense.id} className="card">
                                <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                                >
                                    <div>
                                        <h3 className="font-semibold text-slate-800">{expense.name}</h3>
                                        <p className="text-xs text-slate-400">
                                            {expense.category} · ~{formatOMR(weeklyImpact)}/wk · {wks} week{wks !== 1 ? 's' : ''} left
                                            {expense.deadline && ` · Due ${new Date(expense.deadline).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800">
                                            {formatOMR(totalPaid)}{' '}
                                            <span className="text-slate-400 font-normal">/ {formatOMR(total)}</span>
                                        </p>
                                        <p className={`text-xs ${remaining <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                            {remaining <= 0 ? 'Fully paid!' : `${formatOMR(remaining)} remaining`}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-blue-500'
                                            }`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                {remaining > 0 && (() => {
                                    const portion = futureWeeklyPortion(expense);
                                    const weeksCovered = portion > 0 ? Math.floor(totalPaid / portion) : 0;
                                    const tWeeks = totalWeeksForFuture(expense);
                                    return weeksCovered > 0 ? (
                                        <p className="text-xs text-emerald-600 mt-1">
                                            {weeksCovered} of {tWeeks} week{tWeeks !== 1 ? 's' : ''} covered
                                        </p>
                                    ) : null;
                                })()}

                                {isExpanded && (
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        {!isViewer && (<form
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                if (!user || !entryAmount) return;
                                                const [ey, em, ed] = entryDate.split('-').map(Number);
                                                const entryDateObj = new Date(ey, em - 1, ed);
                                                const amt = parseFloat(entryAmount);
                                                const acc = accounts.find((a) => a.id === payFromAccount);
                                                const entryRef = await addExpenseEntry(user.uid, {
                                                    expenseId: expense.id,
                                                    amount: amt,
                                                    date: entryDateObj,
                                                    notes: entryNotes,
                                                    accountId: payFromAccount || undefined,
                                                });
                                                if (acc) {
                                                    const converted = acc.currency === 'OMR' ? amt : await convert(amt, 'OMR', acc.currency);
                                                    await addTransaction(user.uid, {
                                                        accountId: acc.id,
                                                        amount: -converted,
                                                        bucket: 'deposit',
                                                        date: entryDateObj,
                                                        notes: `Expense: ${expense.name} [entry:${entryRef.id}]`,
                                                    });
                                                }
                                                setEntryAmount('');
                                                setEntryNotes('');
                                            }}
                                            className="flex flex-wrap gap-2 mb-4"
                                        >
                                            <input
                                                type="number"
                                                step="0.001"
                                                min="0"
                                                className="input w-24"
                                                value={entryExpenseId === expense.id ? entryAmount : ''}
                                                onFocus={() => setEntryExpenseId(expense.id)}
                                                onChange={(e) => { setEntryExpenseId(expense.id); setEntryAmount(e.target.value); }}
                                                placeholder="Amount"
                                                required
                                            />
                                            <input
                                                type="date"
                                                className="input w-36"
                                                value={entryDate}
                                                onChange={(e) => setEntryDate(e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="input flex-1 min-w-[120px]"
                                                value={entryExpenseId === expense.id ? entryNotes : ''}
                                                onFocus={() => setEntryExpenseId(expense.id)}
                                                onChange={(e) => { setEntryExpenseId(expense.id); setEntryNotes(e.target.value); }}
                                                placeholder="Payment note"
                                            />
                                            <button type="submit" className="btn-primary text-xs">+ Log Payment</button>
                                        </form>)}

                                        {expEntries.length === 0 ? (
                                            <p className="text-xs text-slate-400">No payments logged yet.</p>
                                        ) : (
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {expEntries.map((entry) => (
                                                    <div key={entry.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-slate-400 w-20">{entry.date.toLocaleDateString()}</span>
                                                            <span className="text-slate-600">{entry.notes || 'Payment'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-slate-800">{formatOMR(entry.amount)}</span>
                                                            {!isViewer && <button onClick={() => handleDeleteEntry(entry)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!isViewer && (
                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                                <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit</button>
                                                <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Unexpected Expenses ──────────────────── */}
            {unexpectedExpenses.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6">
                    <h2 className="text-lg font-semibold text-red-700 mb-4">Unexpected Expenses</h2>
                    <div className="space-y-3">
                        {unexpectedExpenses.map((expense) => {
                            const display = getKind(expense) === 'budget'
                                ? `${formatOMR(expense.weeklyBudget ?? 0)}/wk`
                                : formatOMR(toWeekly(expense.amount, expense.frequency));
                            return (
                                <div key={expense.id} className="flex items-center justify-between bg-white/60 rounded-lg p-3">
                                    <div>
                                        <p className="text-sm font-medium text-red-700">{expense.name}</p>
                                        <p className="text-xs text-red-400">{expense.category} · {expense.frequency}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm font-bold text-red-600">{display}</p>
                                        {!isViewer && <button onClick={() => handleEdit(expense)} className="text-red-300 hover:text-red-600 text-xs">Edit</button>}
                                        {!isViewer && <button onClick={() => handleDelete(expense.id)} className="text-red-300 hover:text-red-600 text-xs">Delete</button>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Past Weeks & Months ──────────────────── */}
            <div className="grid gap-6 sm:grid-cols-2">
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Past Weeks</h2>
                    {pastExpenseData.weeks.length === 0 ? (
                        <p className="text-sm text-slate-400">No past weeks yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {pastExpenseData.weeks.map((w) => (
                                <div key={w.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                    <span className="text-sm text-slate-600">{w.label}</span>
                                    <span className={`text-sm font-bold ${w.total > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        {formatOMR(w.total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Past Months</h2>
                    {pastExpenseData.months.length === 0 ? (
                        <p className="text-sm text-slate-400">No past months yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {pastExpenseData.months.map((m) => (
                                <div key={m.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                    <span className="text-sm text-slate-600">{m.label}</span>
                                    <span className={`text-sm font-bold ${m.total > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        {formatOMR(m.total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

