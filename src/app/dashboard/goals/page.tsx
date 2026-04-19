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
    const { user, effectiveUserId, isViewer } = useAuth();
    const [goals, setGoalsState] = useState<Goals | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [weeklyTarget, setWeeklyTarget] = useState('');
    const [monthlyTarget, setMonthlyTarget] = useState('');
    const [editing, setEditing] = useState(false);
    const [convertedWeek, setConvertedWeek] = useState<number | null>(null);
    const [convertedMonth, setConvertedMonth] = useState<number | null>(null);
    const [pastWeeks, setPastWeeks] = useState<{ label: string; saved: number }[]>([]);
    const [pastMonths, setPastMonths] = useState<{ label: string; saved: number }[]>([]);

    useEffect(() => {
        if (!effectiveUserId) return;
        const unsub1 = subscribeToGoals(effectiveUserId, (g) => {
            setGoalsState(g);
            if (g) {
                setWeeklyTarget(g.weeklyTarget.toString());
                setMonthlyTarget(g.monthlyTarget.toString());
            }
        });
        const unsub2 = subscribeToTransactions(effectiveUserId, setTransactions);
        const unsub3 = subscribeToAccounts(effectiveUserId, setAccounts);
        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    }, [effectiveUserId]);

    // Convert savings to OMR for accurate totals across currencies (saving bucket only)
    useEffect(() => {
        let cancelled = false;
        async function calc() {
            const now_ = new Date();
            const accountMap = new Map(accounts.map((a) => [a.id, a]));

            // Pre-convert all saving txns to OMR
            const converted: { omr: number; date: Date }[] = [];
            for (const txn of transactions) {
                if (txn.bucket !== 'saving') continue;
                const acc = accountMap.get(txn.accountId);
                const currency = acc?.currency ?? 'OMR';
                const inOMR = await convert(txn.amount, currency, 'OMR');
                converted.push({ omr: inOMR, date: txn.date });
            }

            // Current week/month
            const curWeekStart = new Date(now_);
            curWeekStart.setDate(now_.getDate() - ((now_.getDay() + 1) % 7));
            curWeekStart.setHours(0, 0, 0, 0);
            const curMonthStart = new Date(now_.getFullYear(), now_.getMonth(), 1);

            let weekOMR = 0;
            let monthOMR = 0;
            for (const c of converted) {
                if (c.date >= curWeekStart) weekOMR += c.omr;
                if (c.date >= curMonthStart) monthOMR += c.omr;
            }

            // Past weeks (back to March 1, 2026)
            const earliest = new Date(2026, 2, 1); // March 1, 2026
            const weeks: { label: string; saved: number }[] = [];
            for (let i = 1; ; i++) {
                const wStart = new Date(curWeekStart);
                wStart.setDate(wStart.getDate() - 7 * i);
                if (wStart < earliest) break;
                const wEnd = new Date(wStart);
                wEnd.setDate(wEnd.getDate() + 7);
                wEnd.setMilliseconds(-1);
                let total = 0;
                for (const c of converted) {
                    if (c.date >= wStart && c.date <= wEnd) total += c.omr;
                }
                const label = `${wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                weeks.push({ label, saved: total });
            }

            // Past months (back to March 2026)
            const months: { label: string; saved: number }[] = [];
            for (let i = 1; ; i++) {
                const mStart = new Date(now_.getFullYear(), now_.getMonth() - i, 1);
                if (mStart < earliest) break;
                const mEnd = new Date(now_.getFullYear(), now_.getMonth() - i + 1, 0, 23, 59, 59, 999);
                let total = 0;
                for (const c of converted) {
                    if (c.date >= mStart && c.date <= mEnd) total += c.omr;
                }
                const label = mStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                months.push({ label, saved: total });
            }

            if (!cancelled) {
                setConvertedWeek(weekOMR);
                setConvertedMonth(monthOMR);
                setPastWeeks(weeks);
                setPastMonths(months);
            }
        }
        calc();
        return () => { cancelled = true; };
    }, [accounts, transactions]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isViewer) return;
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
                {!isViewer && (
                    <button
                        onClick={() => setEditing(!editing)}
                        className="btn-primary"
                    >
                        {editing ? 'Cancel' : goals ? 'Edit Goals' : 'Set Goals'}
                    </button>
                )}
            </div>

            {/* ── Goal Form ────────────────────────────── */}
            {editing && !isViewer && (
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
                        <p className="text-xs text-slate-400">
                            {(() => { const s = new Date(); s.setDate(s.getDate() - ((s.getDay() + 1) % 7)); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 6); return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; })()}
                        </p>
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
                        <p className="text-xs text-slate-400">
                            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </p>
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

            {/* ── Past Weeks History ───────────────────── */}
            {goals && pastWeeks.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold text-slate-800 mb-3">Past Weeks</h3>
                    <div className="space-y-2">
                        {pastWeeks.map((w, i) => {
                            const pct = goals.weeklyTarget ? (w.saved / goals.weeklyTarget) * 100 : 0;
                            const hit = pct >= 100;
                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="text-slate-500">{w.label}</span>
                                        <span className={hit ? 'text-emerald-600 font-medium' : 'text-slate-600'}>
                                            {formatOMR(w.saved)}
                                            {goals.weeklyTarget > 0 && (
                                                <span className="text-xs text-slate-400 ml-1">/ {formatOMR(goals.weeklyTarget)}</span>
                                            )}
                                            {hit && ' ✓'}
                                        </span>
                                    </div>
                                    <ProgressBar
                                        value={Math.min(pct, 100)}
                                        color={hit ? 'emerald' : pct >= 50 ? 'amber' : 'red'}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Past Months History ──────────────────── */}
            {goals && pastMonths.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold text-slate-800 mb-3">Past Months</h3>
                    <div className="space-y-2">
                        {pastMonths.map((m, i) => {
                            const pct = goals.monthlyTarget ? (m.saved / goals.monthlyTarget) * 100 : 0;
                            const hit = pct >= 100;
                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="text-slate-500">{m.label}</span>
                                        <span className={hit ? 'text-emerald-600 font-medium' : 'text-slate-600'}>
                                            {formatOMR(m.saved)}
                                            {goals.monthlyTarget > 0 && (
                                                <span className="text-xs text-slate-400 ml-1">/ {formatOMR(goals.monthlyTarget)}</span>
                                            )}
                                            {hit && ' ✓'}
                                        </span>
                                    </div>
                                    <ProgressBar
                                        value={Math.min(pct, 100)}
                                        color={hit ? 'emerald' : pct >= 50 ? 'amber' : 'red'}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
