'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import {
    subscribeToExpenses,
    subscribeToTransactions,
    subscribeToGoals,
    subscribeToExpenseEntries,
} from '@/lib/firestore';
import type { Expense, ExpenseEntry, Transaction, Goals } from '@/types';
import { ACCOUNTS } from '@/types';
import { formatOMR, toWeekly } from '@/lib/utils';
import { ProgressBar } from '@/components/ProgressBar';

export default function DashboardPage() {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [entries, setEntries] = useState<ExpenseEntry[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [goals, setGoals] = useState<Goals | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsub1 = subscribeToExpenses(user.uid, setExpenses);
        const unsub2 = subscribeToTransactions(user.uid, setTransactions);
        const unsub3 = subscribeToGoals(user.uid, setGoals);
        const unsub4 = subscribeToExpenseEntries(user.uid, setEntries);
        return () => {
            unsub1();
            unsub2();
            unsub3();
            unsub4();
        };
    }, [user]);

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const regularExpenses = expenses.filter((e) => !e.isUnexpected);
    const unexpectedExpenses = expenses.filter((e) => e.isUnexpected);

    const spentThisWeek = (expenseId: string) =>
        entries
            .filter((e) => e.expenseId === expenseId && e.date >= startOfWeek)
            .reduce((sum, e) => sum + e.amount, 0);

    const weeklySpentTotal = regularExpenses.reduce(
        (sum, e) => sum + spentThisWeek(e.id),
        0
    );
    const weeklyBudgetTotal = regularExpenses.reduce(
        (sum, e) => sum + (e.weeklyBudget ?? toWeekly(e.amount, e.frequency)),
        0
    );
    const unexpectedTotal = unexpectedExpenses.reduce(
        (sum, e) => sum + toWeekly(e.amount, e.frequency),
        0
    );

    const totalSaved = transactions.reduce((sum, t) => sum + t.amount, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const savedThisWeek = transactions
        .filter((t) => t.date >= startOfWeek)
        .reduce((sum, t) => sum + t.amount, 0);

    const savedThisMonth = transactions
        .filter((t) => t.date >= startOfMonth)
        .reduce((sum, t) => sum + t.amount, 0);

    const weeklyProgress = goals?.weeklyTarget
        ? (savedThisWeek / goals.weeklyTarget) * 100
        : 0;
    const monthlyProgress = goals?.monthlyTarget
        ? (savedThisMonth / goals.monthlyTarget) * 100
        : 0;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

            {/* ── Summary Cards ─────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card">
                    <p className="text-sm text-slate-500">Total Saved</p>
                    <p className="text-2xl font-bold text-emerald-600">
                        {formatOMR(totalSaved)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Weekly Expenses</p>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatOMR(weeklySpentTotal)}
                        <span className="text-sm text-slate-400 font-normal">
                            {' '}/ {formatOMR(weeklyBudgetTotal)}
                        </span>
                    </p>
                    {unexpectedExpenses.length > 0 && (
                        <p className="text-xs text-red-500 mt-1">
                            + {formatOMR(unexpectedTotal)} unexpected
                        </p>
                    )}
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Saved This Week</p>
                    <p className="text-2xl font-bold text-emerald-600">
                        {formatOMR(savedThisWeek)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-slate-500">Saved This Month</p>
                    <p className="text-2xl font-bold text-emerald-600">
                        {formatOMR(savedThisMonth)}
                    </p>
                </div>
            </div>

            {/* ── Goals Progress ────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-slate-800">
                            Weekly Savings Plan
                        </h3>
                        {goals?.weeklyTarget != null && (
                            <span className="text-sm text-slate-500">
                                {formatOMR(savedThisWeek)} / {formatOMR(goals.weeklyTarget)}
                            </span>
                        )}
                    </div>
                    <ProgressBar
                        value={weeklyProgress}
                        color={
                            weeklyProgress >= 100
                                ? 'emerald'
                                : weeklyProgress >= 50
                                    ? 'amber'
                                    : 'red'
                        }
                    />
                    {goals?.weeklyTarget ? (
                        <p className="text-sm text-slate-500 mt-2">
                            {weeklyProgress >= 100
                                ? `You're ahead by ${formatOMR(savedThisWeek - goals.weeklyTarget)}`
                                : `${formatOMR(goals.weeklyTarget - savedThisWeek)} more to hit target`}
                        </p>
                    ) : (
                        <p className="text-sm text-slate-400 mt-2">
                            Set a weekly target in Goals
                        </p>
                    )}
                </div>
                <div className="card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-slate-800">
                            Monthly Savings Plan
                        </h3>
                        {goals?.monthlyTarget != null && (
                            <span className="text-sm text-slate-500">
                                {formatOMR(savedThisMonth)} / {formatOMR(goals.monthlyTarget)}
                            </span>
                        )}
                    </div>
                    <ProgressBar
                        value={monthlyProgress}
                        color={
                            monthlyProgress >= 100
                                ? 'emerald'
                                : monthlyProgress >= 50
                                    ? 'amber'
                                    : 'red'
                        }
                    />
                    {goals?.monthlyTarget ? (
                        <p className="text-sm text-slate-500 mt-2">
                            {monthlyProgress >= 100
                                ? `You're ahead by ${formatOMR(savedThisMonth - goals.monthlyTarget)}`
                                : `${formatOMR(goals.monthlyTarget - savedThisMonth)} more to hit target`}
                        </p>
                    ) : (
                        <p className="text-sm text-slate-400 mt-2">
                            Set a monthly target in Goals
                        </p>
                    )}
                </div>
            </div>

            {/* ── Weekly Budget Breakdown ───────────────── */}
            <div className="card">
                <h3 className="font-semibold text-slate-800 mb-4">
                    Weekly Budget Breakdown
                </h3>
                {regularExpenses.length === 0 ? (
                    <p className="text-sm text-slate-400">
                        No regular expenses added yet.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {regularExpenses.map((expense) => {
                            const budget = expense.weeklyBudget ?? toWeekly(expense.amount, expense.frequency);
                            const spent = spentThisWeek(expense.id);
                            const remaining = budget - spent;
                            const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                            return (
                                <div
                                    key={expense.id}
                                    className="border-b border-slate-50 pb-3"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">
                                                {expense.name}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {expense.category}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-slate-800">
                                                {formatOMR(spent)}
                                                <span className="text-xs text-slate-400"> / {formatOMR(budget)}</span>
                                            </p>
                                            <p className={`text-xs ${remaining >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {remaining >= 0
                                                    ? `${formatOMR(remaining)} left`
                                                    : `${formatOMR(Math.abs(remaining))} over budget`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                                }`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Unexpected Expenses Alert ─────────────── */}
            {unexpectedExpenses.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6">
                    <h3 className="font-semibold text-red-700 mb-3">
                        Unexpected Expenses
                    </h3>
                    <div className="space-y-2">
                        {unexpectedExpenses.map((expense) => (
                            <div
                                key={expense.id}
                                className="flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-sm font-medium text-red-700">
                                        {expense.name}
                                    </p>
                                    <p className="text-xs text-red-400">{expense.category}</p>
                                </div>
                                <p className="text-sm font-semibold text-red-600">
                                    {formatOMR(toWeekly(expense.amount, expense.frequency))}
                                    {expense.frequency !== 'one-time' && (
                                        <span className="text-xs text-red-400">/wk</span>
                                    )}
                                </p>
                            </div>
                        ))}
                        <div className="border-t border-red-200 pt-2 mt-2">
                            <p className="text-sm font-bold text-red-700 text-right">
                                Total: {formatOMR(unexpectedTotal)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Account Balances ──────────────────────── */}
            <div className="card">
                <h3 className="font-semibold text-slate-800 mb-4">Account Balances</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ACCOUNTS.map((account) => {
                        const balance = transactions
                            .filter((t) => t.accountId === account.id)
                            .reduce((sum, t) => sum + t.amount, 0);
                        return (
                            <div
                                key={account.id}
                                className="rounded-lg border border-slate-100 p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">
                                            {account.name}
                                        </p>
                                        <p className="text-xs text-slate-400">{account.type}</p>
                                    </div>
                                    <p
                                        className={`text-sm font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                                    >
                                        {formatOMR(balance)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
