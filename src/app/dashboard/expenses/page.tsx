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
import { CATEGORIES, FREQUENCIES } from '@/types';
import type { Category, Frequency } from '@/types';
import { formatOMR, toWeekly } from '@/lib/utils';

export default function ExpensesPage() {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [entries, setEntries] = useState<ExpenseEntry[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Expense form state
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [frequency, setFrequency] = useState<Frequency>('monthly');
    const [category, setCategory] = useState<Category>('Other');
    const [isUnexpected, setIsUnexpected] = useState(false);
    const [weeklyBudget, setWeeklyBudget] = useState('');
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

    // ── Helpers ────────────────────────────
    const getWeekStart = () => {
        const now = new Date();
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
    };

    const entriesForExpense = (expenseId: string) =>
        entries.filter((e) => e.expenseId === expenseId);

    const thisWeekEntries = (expenseId: string) => {
        const weekStart = getWeekStart();
        return entriesForExpense(expenseId).filter((e) => e.date >= weekStart);
    };

    const spentThisWeek = (expenseId: string) =>
        thisWeekEntries(expenseId).reduce((sum, e) => sum + e.amount, 0);

    // ── Expense form ──────────────────────
    const resetForm = () => {
        setName('');
        setAmount('');
        setFrequency('monthly');
        setCategory('Other');
        setIsUnexpected(false);
        setWeeklyBudget('');
        setNotes('');
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !name) return;

        const data = {
            name,
            amount: amount ? parseFloat(amount) : 0,
            frequency,
            category,
            isUnexpected,
            weeklyBudget: weeklyBudget ? parseFloat(weeklyBudget) : null,
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
        setName(expense.name);
        setAmount(expense.amount.toString());
        setFrequency(expense.frequency);
        setCategory(expense.category);
        setIsUnexpected(expense.isUnexpected);
        setWeeklyBudget(expense.weeklyBudget?.toString() ?? '');
        setNotes(expense.notes);
        setEditingId(expense.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!user) return;
        await deleteExpense(user.uid, id);
    };

    const handleDeleteEntry = async (entryId: string) => {
        if (!user) return;
        await deleteExpenseEntry(user.uid, entryId);
    };

    const regularExpenses = expenses.filter((e) => !e.isUnexpected);
    const unexpectedExpenses = expenses.filter((e) => e.isUnexpected);
    const weeklyTotal = regularExpenses.reduce(
        (sum, e) => sum + spentThisWeek(e.id),
        0
    );
    const weeklyBudgetTotal = regularExpenses.reduce(
        (sum, e) => sum + (e.weeklyBudget ?? toWeekly(e.amount, e.frequency)),
        0
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
                <button
                    onClick={() => {
                        resetForm();
                        setShowForm(true);
                    }}
                    className="btn-primary"
                >
                    + Add Budget Category
                </button>
            </div>

            {/* ── Add / Edit Budget Category Form ──────── */}
            {showForm && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">
                        {editingId ? 'Edit Budget Category' : 'New Budget Category'}
                    </h2>
                    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="label">Name</label>
                            <input
                                type="text"
                                className="input w-full"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Groceries"
                                required
                            />
                        </div>
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
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Fixed Amount (OMR)</label>
                            <input
                                type="number"
                                step="0.001"
                                min="0"
                                className="input w-full"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="For fixed costs like rent"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                Leave 0 for tracked expenses (groceries, etc.)
                            </p>
                        </div>
                        <div>
                            <label className="label">Frequency</label>
                            <select
                                className="select w-full"
                                value={frequency}
                                onChange={(e) => setFrequency(e.target.value as Frequency)}
                            >
                                {FREQUENCIES.map((f) => (
                                    <option key={f} value={f}>
                                        {f}
                                    </option>
                                ))}
                            </select>
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
                        <div className="sm:col-span-2 flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isUnexpected}
                                    onChange={(e) => setIsUnexpected(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                />
                                <span className="text-sm text-slate-600">
                                    Unexpected expense
                                </span>
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

            {/* ── Summary ──────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="card">
                    <p className="text-sm text-slate-500">Weekly Budget</p>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatOMR(weeklyBudgetTotal)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Spent This Week</p>
                    <p className={`text-2xl font-bold ${weeklyTotal > weeklyBudgetTotal ? 'text-red-500' : 'text-emerald-600'}`}>
                        {formatOMR(weeklyTotal)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Remaining</p>
                    <p className={`text-2xl font-bold ${weeklyBudgetTotal - weeklyTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatOMR(weeklyBudgetTotal - weeklyTotal)}
                    </p>
                </div>
            </div>

            {/* ── Regular Expenses ─────────────────────── */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">
                    Budget Categories
                </h2>
                {regularExpenses.length === 0 ? (
                    <div className="card">
                        <p className="text-sm text-slate-400">
                            No budget categories yet. Add one above.
                        </p>
                    </div>
                ) : (
                    regularExpenses.map((expense) => {
                        const budget = expense.weeklyBudget ?? toWeekly(expense.amount, expense.frequency);
                        const spent = spentThisWeek(expense.id);
                        const remaining = budget - spent;
                        const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                        const isExpanded = expandedId === expense.id;
                        const expEntries = entriesForExpense(expense.id);

                        return (
                            <div key={expense.id} className="card">
                                {/* Header */}
                                <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                                >
                                    <div>
                                        <h3 className="font-semibold text-slate-800">
                                            {expense.name}
                                        </h3>
                                        <p className="text-xs text-slate-400">
                                            {expense.category}
                                            {expense.amount > 0 && ` · Fixed ${formatOMR(expense.amount)}/${expense.frequency}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800">
                                            {formatOMR(spent)}{' '}
                                            <span className="text-slate-400 font-normal">
                                                / {formatOMR(budget)}
                                            </span>
                                        </p>
                                        <p className={`text-xs ${remaining >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {remaining >= 0
                                                ? `${formatOMR(remaining)} left`
                                                : `${formatOMR(Math.abs(remaining))} over`}
                                        </p>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100
                                                ? 'bg-red-500'
                                                : pct >= 75
                                                    ? 'bg-amber-500'
                                                    : 'bg-emerald-500'
                                            }`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>

                                {/* Expanded section */}
                                {isExpanded && (
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        {/* Quick-add entry form */}
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
                                                onChange={(e) => {
                                                    setEntryExpenseId(expense.id);
                                                    setEntryAmount(e.target.value);
                                                }}
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
                                                onChange={(e) => {
                                                    setEntryExpenseId(expense.id);
                                                    setEntryNotes(e.target.value);
                                                }}
                                                placeholder="What did you buy?"
                                            />
                                            <button type="submit" className="btn-primary text-xs">
                                                + Add
                                            </button>
                                        </form>

                                        {/* Entry list */}
                                        {expEntries.length === 0 ? (
                                            <p className="text-xs text-slate-400">
                                                No purchases logged yet.
                                            </p>
                                        ) : (
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {expEntries.map((entry) => (
                                                    <div
                                                        key={entry.id}
                                                        className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-slate-400 w-20">
                                                                {entry.date.toLocaleDateString()}
                                                            </span>
                                                            <span className="text-slate-600">
                                                                {entry.notes || 'Purchase'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-slate-800">
                                                                {formatOMR(entry.amount)}
                                                            </span>
                                                            <button
                                                                onClick={() => handleDeleteEntry(entry.id)}
                                                                className="text-slate-300 hover:text-red-500 text-xs"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                            <button
                                                onClick={() => handleEdit(expense)}
                                                className="text-xs text-slate-400 hover:text-emerald-600"
                                            >
                                                Edit Budget
                                            </button>
                                            <button
                                                onClick={() => handleDelete(expense.id)}
                                                className="text-xs text-slate-400 hover:text-red-500"
                                            >
                                                Delete Category
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* ── Unexpected Expenses ──────────────────── */}
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
                <h2 className="text-lg font-semibold text-red-700 mb-4">
                    Unexpected Expenses
                </h2>
                {unexpectedExpenses.length === 0 ? (
                    <p className="text-sm text-red-300">
                        No unexpected expenses — great!
                    </p>
                ) : (
                    <div className="space-y-3">
                        {unexpectedExpenses.map((expense) => {
                            const weekly = toWeekly(expense.amount, expense.frequency);
                            return (
                                <div
                                    key={expense.id}
                                    className="flex items-center justify-between bg-white/60 rounded-lg p-3"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-red-700">
                                            {expense.name}
                                        </p>
                                        <p className="text-xs text-red-400">
                                            {expense.category} &middot; {expense.frequency}
                                        </p>
                                        {expense.notes && (
                                            <p className="text-xs text-red-300 mt-1">
                                                {expense.notes}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm font-bold text-red-600">
                                            {formatOMR(weekly)}
                                        </p>
                                        <button
                                            onClick={() => handleEdit(expense)}
                                            className="text-red-300 hover:text-red-600 text-xs"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(expense.id)}
                                            className="text-red-300 hover:text-red-600 text-xs"
                                        >
                                            Delete
                                        </button>
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

