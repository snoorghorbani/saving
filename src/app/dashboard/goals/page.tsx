'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import {
    subscribeToGoals,
    setGoals,
    subscribeToTransactions,
    subscribeToAccounts,
} from '@/lib/firestore';
import type { Goals, Transaction, Account } from '@/types';
import { formatOMR } from '@/lib/utils';
import { formatCurrency, convert } from '@/lib/currency';
import { ProgressBar } from '@/components/ProgressBar';

export default function GoalsPage() {
    const { user } = useAuth();
    const [goals, setGoalsState] = useState<Goals | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [weeklyTarget, setWeeklyTarget] = useState('');
    const [monthlyTarget, setMonthlyTarget] = useState('');
    const [editing, setEditing] = useState(false);
    const [convertedWeek, setConvertedWeek] = useState<number | null>(null);
    const [convertedMonth, setConvertedMonth] = useState<number | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsub1 = subscribeToGoals(user.uid, (g) => {
            setGoalsState(g);
            if (g) {
                setWeeklyTarget(g.weeklyTarget.toString());
                setMonthlyTarget(g.monthlyTarget.toString());
            }
        });
        const unsub2 = subscribeToTransactions(user.uid, setTransactions);
        const unsub3 = subscribeToAccounts(user.uid, setAccounts);
        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    }, [user]);

    // Convert savings to OMR for accurate totals across currencies
    useEffect(() => {
        let cancelled = false;
        async function calc() {
            const now_ = new Date();
            const weekStart = new Date(now_);
            weekStart.setDate(now_.getDate() - now_.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const monthStart = new Date(now_.getFullYear(), now_.getMonth(), 1);
            const accountMap = new Map(accounts.map((a) => [a.id, a]));
            let weekOMR = 0;
            let monthOMR = 0;
            for (const txn of transactions) {
                const acc = accountMap.get(txn.accountId);
                const currency = acc?.currency ?? 'OMR';
                const inOMR = await convert(txn.amount, currency, 'OMR');
                if (txn.date >= weekStart) weekOMR += inOMR;
                if (txn.date >= monthStart) monthOMR += inOMR;
            }
            if (!cancelled) {
                setConvertedWeek(weekOMR);
                setConvertedMonth(monthOMR);
            }
        }
        calc();
        return () => { cancelled = true; };
    }, [accounts, transactions]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        await setGoals(user.uid, {
            weeklyTarget: parseFloat(weeklyTarget) || 0,
            monthlyTarget: parseFloat(monthlyTarget) || 0,
        });
        setEditing(false);
    };

    const savedThisWeek = convertedWeek ?? 0;
    const savedThisMonth = convertedMonth ?? 0;

    const weeklyProgress = goals?.weeklyTarget
        ? (savedThisWeek / goals.weeklyTarget) * 100
        : 0;
    const monthlyProgress = goals?.monthlyTarget
        ? (savedThisMonth / goals.monthlyTarget) * 100
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-900">Goals</h1>
                <button
                    onClick={() => setEditing(!editing)}
                    className="btn-primary"
                >
                    {editing ? 'Cancel' : goals ? 'Edit Goals' : 'Set Goals'}
                </button>
            </div>

            {/* ── Goal Form ────────────────────────────── */}
            {editing && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">
                        Set Savings Targets
                    </h2>
                    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="label">Weekly Target (OMR)</label>
                            <input
                                type="number"
                                step="0.001"
                                min="0"
                                className="input w-full"
                                value={weeklyTarget}
                                onChange={(e) => setWeeklyTarget(e.target.value)}
                                placeholder="e.g. 1000"
                            />
                        </div>
                        <div>
                            <label className="label">Monthly Target (OMR)</label>
                            <input
                                type="number"
                                step="0.001"
                                min="0"
                                className="input w-full"
                                value={monthlyTarget}
                                onChange={(e) => setMonthlyTarget(e.target.value)}
                                placeholder="e.g. 4000"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <button type="submit" className="btn-primary">
                                Save Goals
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Current Goals ────────────────────────── */}
            {goals ? (
                <div className="grid gap-6 sm:grid-cols-2">
                    <div className="card">
                        <h3 className="font-semibold text-slate-800 mb-1">
                            Weekly Savings Goal
                        </h3>
                        <p className="text-3xl font-bold text-emerald-600 mb-4">
                            {formatOMR(goals.weeklyTarget)}
                        </p>
                        <div className="mb-2">
                            <div className="flex justify-between text-sm text-slate-500 mb-1">
                                <span>Saved this week</span>
                                <span>{formatOMR(savedThisWeek)}</span>
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
                        </div>
                        <p className="text-sm mt-2">
                            {weeklyProgress >= 100 ? (
                                <span className="text-emerald-600 font-medium">
                                    Ahead by {formatOMR(savedThisWeek - goals.weeklyTarget)}
                                </span>
                            ) : (
                                <span className="text-slate-500">
                                    {formatOMR(goals.weeklyTarget - savedThisWeek)} remaining
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="card">
                        <h3 className="font-semibold text-slate-800 mb-1">
                            Monthly Savings Goal
                        </h3>
                        <p className="text-3xl font-bold text-emerald-600 mb-4">
                            {formatOMR(goals.monthlyTarget)}
                        </p>
                        <div className="mb-2">
                            <div className="flex justify-between text-sm text-slate-500 mb-1">
                                <span>Saved this month</span>
                                <span>{formatOMR(savedThisMonth)}</span>
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
                        </div>
                        <p className="text-sm mt-2">
                            {monthlyProgress >= 100 ? (
                                <span className="text-emerald-600 font-medium">
                                    Ahead by {formatOMR(savedThisMonth - goals.monthlyTarget)}
                                </span>
                            ) : (
                                <span className="text-slate-500">
                                    {formatOMR(goals.monthlyTarget - savedThisMonth)} remaining
                                </span>
                            )}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="card text-center py-12">
                    <p className="text-lg font-semibold text-slate-700 mb-2">
                        No goals set yet
                    </p>
                    <p className="text-sm text-slate-400">
                        Set weekly and monthly savings targets to track your progress.
                    </p>
                </div>
            )}
        </div>
    );
}
