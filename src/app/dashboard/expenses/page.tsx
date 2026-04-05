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
} from '@/lib/firestore';
import type { Expense, ExpenseEntry } from '@/types';
import { CATEGORIES, FREQUENCIES, EXPENSE_KINDS } from '@/types';
import type { Category, Frequency, ExpenseKind } from '@/types';
import { formatOMR, toWeekly, getWeekRange, isDueInWeek, getEffectiveBudget, futureWeeklyImpact, weeksUntil, futureWeeklyPortion, totalWeeksForFuture } from '@/lib/utils';

export default function ExpensesPage() {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [entries, setEntries] = useState<ExpenseEntry[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

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

    useEffect(() => {
        if (!user) return;
        const unsub1 = subscribeToExpenses(user.uid, setExpenses);
        const unsub2 = subscribeToExpenseEntries(user.uid, setEntries);
        return () => {
            unsub1();
            unsub2();
        };
    }, [user]);

    // ── Week helpers ──────────────────────
    const thisWeek = getWeekRange(0);
    const nextWeek = getWeekRange(1);

    const entriesForExpense = (expenseId: string) =>
        entries.filter((e) => e.expenseId === expenseId);

    const spentInWeek = (expenseId: string, start: Date, end: Date) =>
        entries
            .filter((e) => e.expenseId === expenseId && e.date >= start && e.date <= end)
            .reduce((sum, e) => sum + e.amount, 0);

    const spentThisWeek = (expenseId: string) => spentInWeek(expenseId, thisWeek.start, thisWeek.end);

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
        if (!user) return;
        if (!confirm(`Mark "${expense.name}" as paid (${formatOMR(expense.amount)})?`)) return;
        await addExpenseEntry(user.uid, {
            expenseId: expense.id,
            amount: expense.amount,
            date: new Date(),
            notes: `${expense.name} payment`,
        });
    };

    const handleUndoPaid = async (expense: Expense, weekStart: Date, weekEnd: Date) => {
        if (!user) return;
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
            await deleteExpenseEntry(user.uid, matchEntries[0].id);
        }
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
        if (!user || !name) return;

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
        if (!user) return;
        if (!confirm('Delete this expense?')) return;
        await deleteExpense(user.uid, id);
    };

    const handleDeleteEntry = async (entryId: string) => {
        if (!user) return;
        if (!confirm('Delete this entry?')) return;
        await deleteExpenseEntry(user.uid, entryId);
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
    const thisWeekFixed = fixedPayments.filter((e) => isDueInWeek(e, thisWeek.start, thisWeek.end));
    const nextWeekFixed = fixedPayments.filter((e) => isDueInWeek(e, nextWeek.start, nextWeek.end));

    // Weekly impact of all fixed payments
    const fixedWeeklyImpact = fixedPayments.reduce((sum, e) => sum + toWeekly(e.amount, e.frequency), 0);

    // Budget totals
    const budgetTotalBase = budgetExpenses.reduce((sum, e) => sum + (e.weeklyBudget ?? 0), 0);
    const budgetTotalSpent = budgetExpenses.reduce((sum, e) => sum + spentThisWeek(e.id), 0);

    const formatDateRange = (start: Date, end: Date) =>
        `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="btn-primary"
                >
                    + Add Expense
                </button>
            </div>

            {/* ── Add / Edit Form ──────────────────────── */}
            {showForm && (
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
                    <span className="text-sm text-slate-400">{formatDateRange(thisWeek.start, thisWeek.end)}</span>
                </div>
                {thisWeekFixed.length === 0 ? (
                    <p className="text-sm text-slate-400">No payments due this week.</p>
                ) : (
                    <div className="space-y-3">
                        {thisWeekFixed.map((expense) => {
                            const paid = isPaidInPeriod(expense, thisWeek.start, thisWeek.end);
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
                                            <button
                                                onClick={() => handleUndoPaid(expense, thisWeek.start, thisWeek.end)}
                                                className="text-xs text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full hover:bg-emerald-200 transition-colors"
                                            >
                                                ✓ Paid
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleMarkAsPaid(expense)}
                                                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full hover:bg-emerald-700 transition-colors"
                                            >
                                                Mark as Paid
                                            </button>
                                        )}
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
                    <span className="text-sm text-slate-400">{formatDateRange(nextWeek.start, nextWeek.end)}</span>
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
                                        <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit</button>
                                        <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
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
                        const spent = spentThisWeek(expense.id);
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
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (!user || !entryAmount) return;
                                                addExpenseEntry(user.uid, {
                                                    expenseId: expense.id,
                                                    amount: parseFloat(entryAmount),
                                                    date: new Date(entryDate),
                                                    notes: entryNotes,
                                                });
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
                                        </form>

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
                                                            <button onClick={() => handleDeleteEntry(entry.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                            <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit Budget</button>
                                            <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                                        </div>
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
                                        ) : (
                                            <button
                                                onClick={() => handleMarkAsPaid(expense)}
                                                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full hover:bg-emerald-700 transition-colors"
                                            >
                                                Pay
                                            </button>
                                        )}
                                        <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit</button>
                                        <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
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
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (!user || !entryAmount) return;
                                                addExpenseEntry(user.uid, {
                                                    expenseId: expense.id,
                                                    amount: parseFloat(entryAmount),
                                                    date: new Date(entryDate),
                                                    notes: entryNotes,
                                                });
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
                                        </form>

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
                                                            <button onClick={() => handleDeleteEntry(entry.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                            <button onClick={() => handleEdit(expense)} className="text-xs text-slate-400 hover:text-emerald-600">Edit</button>
                                            <button onClick={() => handleDelete(expense.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                                        </div>
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
                                        <button onClick={() => handleEdit(expense)} className="text-red-300 hover:text-red-600 text-xs">Edit</button>
                                        <button onClick={() => handleDelete(expense.id)} className="text-red-300 hover:text-red-600 text-xs">Delete</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

