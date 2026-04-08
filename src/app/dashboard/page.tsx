'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import {
    subscribeToExpenses,
    subscribeToTransactions,
    subscribeToGoals,
    subscribeToExpenseEntries,
    subscribeToAccounts,
    subscribeToIncomeSettings,
    setIncomeSettings,
    addExpenseEntry,
    deleteExpenseEntry,
} from '@/lib/firestore';
import type { Expense, ExpenseEntry, Transaction, Goals, ExpenseKind, Account, IncomeSettings } from '@/types';
import { formatOMR, toWeekly, getWeekRange, isDueInWeek, getEffectiveBudget, futureWeeklyImpact, isFutureWeekPaid } from '@/lib/utils';
import { formatCurrency, convert } from '@/lib/currency';
import { ProgressBar } from '@/components/ProgressBar';

export default function DashboardPage() {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [entries, setEntries] = useState<ExpenseEntry[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [goals, setGoals] = useState<Goals | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [income, setIncome] = useState<IncomeSettings | null>(null);
    const [editingIncome, setEditingIncome] = useState(false);
    const [incomeForm, setIncomeForm] = useState({ weeklyAmount: '550', weeksReceived: '5' });
    const [showInUSD, setShowInUSD] = useState(false);
    const [convertedTotalOMR, setConvertedTotalOMR] = useState<number | null>(null);
    const [convertedTotalUSD, setConvertedTotalUSD] = useState<number | null>(null);
    const [convertedDepositOMR, setConvertedDepositOMR] = useState<number | null>(null);
    const [convertedDepositUSD, setConvertedDepositUSD] = useState<number | null>(null);
    const [convertedSavingOMR, setConvertedSavingOMR] = useState<number | null>(null);
    const [convertedSavingUSD, setConvertedSavingUSD] = useState<number | null>(null);
    const [convertedWeek, setConvertedWeek] = useState<number | null>(null);
    const [convertedMonth, setConvertedMonth] = useState<number | null>(null);
    const [omrToUsdRate, setOmrToUsdRate] = useState<number | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsub1 = subscribeToExpenses(user.uid, setExpenses);
        const unsub2 = subscribeToTransactions(user.uid, setTransactions);
        const unsub3 = subscribeToGoals(user.uid, setGoals);
        const unsub4 = subscribeToExpenseEntries(user.uid, setEntries);
        const unsub5 = subscribeToAccounts(user.uid, setAccounts);
        const unsub6 = subscribeToIncomeSettings(user.uid, (inc) => {
            if (inc && inc.currency !== 'OMR') {
                // Migrate old USD income to OMR 550/wk
                setIncomeSettings(user.uid, {
                    weeklyAmount: 550,
                    currency: 'OMR',
                    startDate: inc.startDate,
                    weeksReceived: inc.weeksReceived,
                });
                return; // will re-trigger via onSnapshot
            }
            setIncome(inc);
            if (inc) {
                setIncomeForm({
                    weeklyAmount: String(inc.weeklyAmount),
                    weeksReceived: String(inc.weeksReceived),
                });
            } else {
                // First time — auto-save default income (550 OMR/wk × 5 weeks)
                setIncomeSettings(user.uid, {
                    weeklyAmount: 550,
                    currency: 'OMR',
                    startDate: new Date().toISOString(),
                    weeksReceived: 5,
                });
            }
        });
        return () => {
            unsub1();
            unsub2();
            unsub3();
            unsub4();
            unsub5();
            unsub6();
        };
    }, [user]);

    // Convert total savings to OMR and USD (split by bucket)
    useEffect(() => {
        let cancelled = false;
        async function calc() {
            let totalOMR = 0;
            let totalUSD = 0;
            let depositOMR = 0;
            let depositUSD = 0;
            let savingOMR = 0;
            let savingUSD = 0;
            let weekOMR = 0;
            let monthOMR = 0;
            const now_ = new Date();
            const weekStart = new Date(now_);
            weekStart.setDate(now_.getDate() - now_.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const monthStart = new Date(now_.getFullYear(), now_.getMonth(), 1);
            const accountMap = new Map(accounts.map((a) => [a.id, a]));
            for (const txn of transactions) {
                const acc = accountMap.get(txn.accountId);
                const currency = acc?.currency ?? 'OMR';
                const inOMR = await convert(txn.amount, currency, 'OMR');
                const inUSD = await convert(txn.amount, currency, 'USD');
                totalOMR += inOMR;
                totalUSD += inUSD;
                if (txn.bucket === 'deposit') { depositOMR += inOMR; depositUSD += inUSD; }
                else { savingOMR += inOMR; savingUSD += inUSD; }
                if (txn.date >= weekStart) weekOMR += inOMR;
                if (txn.date >= monthStart) monthOMR += inOMR;
            }
            if (!cancelled) {
                setConvertedTotalOMR(totalOMR);
                setConvertedTotalUSD(totalUSD);
                setConvertedDepositOMR(depositOMR);
                setConvertedDepositUSD(depositUSD);
                setConvertedSavingOMR(savingOMR);
                setConvertedSavingUSD(savingUSD);
                setConvertedWeek(weekOMR);
                setConvertedMonth(monthOMR);
                // Cache OMR→USD rate for income/expenses conversion
                const rate = await convert(1, 'OMR', 'USD');
                setOmrToUsdRate(rate);
            }
        }
        calc();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts, transactions]);

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const regularExpenses = expenses.filter((e) => !e.isUnexpected);
    const unexpectedExpenses = expenses.filter((e) => e.isUnexpected);

    // Backwards compat: old expenses without `kind` infer from fields
    const getKind = (e: Expense): ExpenseKind =>
        e.kind ?? (e.frequency === 'one-time' ? 'one-time' : e.weeklyBudget != null && e.amount <= 0 ? 'budget' : 'fixed-payment');

    const fixedPayments = regularExpenses.filter((e) => getKind(e) === 'fixed-payment');
    const budgetExpenses = regularExpenses.filter((e) => getKind(e) === 'budget');
    const futureExpenses = regularExpenses.filter((e) => getKind(e) === 'future');
    const futureImpact = futureExpenses.reduce((sum, e) => sum + futureWeeklyImpact(e), 0);

    const thisWeek = getWeekRange(0);
    const nextWeek = getWeekRange(1);

    const thisWeekFixed = fixedPayments.filter((e) => isDueInWeek(e, thisWeek.start, thisWeek.end));
    const nextWeekFixed = fixedPayments.filter((e) => isDueInWeek(e, nextWeek.start, nextWeek.end));

    const isPaidInPeriod = (expense: Expense, weekStart: Date, weekEnd: Date): boolean => {
        if (expense.frequency === 'weekly') {
            return entries.some(
                (e) => e.expenseId === expense.id && e.type !== 'set-aside' && e.date >= weekStart && e.date <= weekEnd
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
                (e) => e.expenseId === expense.id && e.type !== 'set-aside' && e.date >= monthStart && e.date <= monthEnd
            );
        }
        return false;
    };

    const setAsideThisWeek = (expenseId: string) =>
        entries
            .filter((e) => e.expenseId === expenseId && e.type === 'set-aside' && e.date >= startOfWeek)
            .reduce((sum, e) => sum + e.amount, 0);

    const setAsideEntriesThisWeek = (expenseId: string) =>
        entries.filter((e) => e.expenseId === expenseId && e.type === 'set-aside' && e.date >= startOfWeek);

    const handleSetAside = async (expense: Expense) => {
        if (!user) return;
        const weeklyAmount = getKind(expense) === 'future'
            ? futureWeeklyImpact(expense)
            : toWeekly(expense.amount, expense.frequency);
        if (!confirm(`Set aside ${formatOMR(weeklyAmount)} for "${expense.name}"?`)) return;
        await addExpenseEntry(user.uid, {
            expenseId: expense.id,
            amount: weeklyAmount,
            date: new Date(),
            notes: 'Set aside',
            type: 'set-aside',
        });
    };

    const handleUndoSetAside = async (expense: Expense) => {
        if (!user) return;
        if (!confirm(`Undo set-aside for "${expense.name}"?`)) return;
        const asideEntries = setAsideEntriesThisWeek(expense.id);
        for (const entry of asideEntries) {
            await deleteExpenseEntry(user.uid, entry.id);
        }
    };

    const spentThisWeek = (expenseId: string) =>
        entries
            .filter((e) => e.expenseId === expenseId && e.date >= startOfWeek)
            .reduce((sum, e) => sum + e.amount, 0);

    const fixedWeeklyImpact = fixedPayments.reduce((sum, e) => sum + toWeekly(e.amount, e.frequency), 0);
    const budgetTotalBase = budgetExpenses.reduce((sum, e) => sum + (e.weeklyBudget ?? 0), 0);
    const budgetTotalSpent = budgetExpenses.reduce((sum, e) => sum + spentThisWeek(e.id), 0);
    const weeklyBudgetTotal = fixedWeeklyImpact + budgetTotalBase + futureImpact;
    const weeklySpentTotal = regularExpenses.reduce(
        (sum, e) => sum + spentThisWeek(e.id),
        0
    );
    const unexpectedTotal = unexpectedExpenses.reduce(
        (sum, e) => sum + toWeekly(e.amount, e.frequency),
        0
    );

    // ── This Week totals (all types) ─────────────────
    const oneTimeExpenses = regularExpenses.filter((e) => getKind(e) === 'one-time');
    const unpaidOneTime = oneTimeExpenses.filter((e) => !entries.some((en) => en.expenseId === e.id));
    const paidOneTimeThisWeek = oneTimeExpenses.filter((e) =>
        entries.some((en) => en.expenseId === e.id && en.date >= thisWeek.start && en.date <= thisWeek.end)
    );

    const thisWeekFixedExpected = thisWeekFixed.reduce((sum, e) => sum + e.amount, 0);
    const thisWeekFixedPaid = thisWeekFixed
        .filter((e) => isPaidInPeriod(e, thisWeek.start, thisWeek.end))
        .reduce((sum, e) => sum + e.amount, 0);

    const thisWeekBudgetEffective = budgetExpenses.reduce(
        (sum, e) => sum + getEffectiveBudget(e, entries).effectiveBudget, 0
    );

    const thisWeekOneTimeExpected = unpaidOneTime.reduce((sum, e) => sum + e.amount, 0)
        + paidOneTimeThisWeek.reduce((sum, e) => sum + e.amount, 0);

    // Use fixedWeeklyImpact (all fixed payments prorated) instead of only due-this-week amounts
    const thisWeekExpected = fixedWeeklyImpact + thisWeekBudgetEffective + thisWeekOneTimeExpected + futureImpact;
    const fixedSetAsideThisWeek = fixedPayments
        .filter((e) => !isDueInWeek(e, thisWeek.start, thisWeek.end))
        .reduce((sum, e) => sum + setAsideThisWeek(e.id), 0);
    const futureSetAsideThisWeek = futureExpenses.reduce((sum, e) => sum + setAsideThisWeek(e.id), 0);
    const futureSpentThisWeek = futureExpenses.reduce((sum, e) => sum + spentThisWeek(e.id), 0);
    const thisWeekSpent = thisWeekFixedPaid + fixedSetAsideThisWeek + budgetTotalSpent + paidOneTimeThisWeek.reduce((sum, e) => sum + e.amount, 0) + futureSpentThisWeek;
    const thisWeekDiff = thisWeekExpected - thisWeekSpent; // positive = under budget, negative = over

    // ── Next Week totals ─────────────────────────────
    const nextWeekFixedExpected = nextWeekFixed.reduce((sum, e) => sum + e.amount, 0);
    // Use fixedWeeklyImpact for next week too — all fixed payments have weekly impact
    const nextWeekExpected = fixedWeeklyImpact + budgetTotalBase + unpaidOneTime.reduce((sum, e) => sum + e.amount, 0) + futureImpact;

    const formatDateRange = (start: Date, end: Date) =>
        `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    // ── Total known expenses until end of 2026 ───────
    const endOf2026 = new Date(2026, 11, 31, 23, 59, 59, 999);
    const weeksLeft = Math.max(0, Math.ceil((endOf2026.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const fixedTotalTillEnd = fixedPayments.reduce((sum, e) => sum + toWeekly(e.amount, e.frequency) * weeksLeft, 0);
    const oneTimeTotalTillEnd = oneTimeExpenses
        .filter((e) => !entries.some((en) => en.expenseId === e.id))
        .reduce((sum, e) => sum + e.amount, 0);
    const futureTotalTillEnd = futureExpenses.reduce((sum, e) => {
        const total = e.estimatedTotal ?? 0;
        const paid = entries.filter((en) => en.expenseId === e.id && en.type !== 'set-aside').reduce((s, en) => s + en.amount, 0);
        return sum + Math.max(0, total - paid);
    }, 0);
    const totalExpensesTillEnd = fixedTotalTillEnd + oneTimeTotalTillEnd + futureTotalTillEnd;

    const savedThisWeek = convertedWeek ?? 0;
    const savedThisMonth = convertedMonth ?? 0;

    // ── Income totals ────────────────────────────────
    const totalIncome = income ? income.weeklyAmount * income.weeksReceived : 0;
    // Total expenses spent so far (actual payments only, excluding set-asides)
    const totalExpensesSpent = entries
        .filter((e) => e.type !== 'set-aside')
        .reduce((sum, e) => sum + e.amount, 0);
    // Untracked = Income - Expenses - Saved - Deposit
    const totalDepositOMR = convertedDepositOMR ?? 0;
    const totalSavingOMR = convertedSavingOMR ?? 0;
    const totalUntracked = totalIncome - totalExpensesSpent - totalSavingOMR - totalDepositOMR;

    const handleSaveIncome = async () => {
        if (!user) return;
        const weeklyAmount = parseFloat(incomeForm.weeklyAmount);
        const weeksReceived = parseInt(incomeForm.weeksReceived, 10);
        if (isNaN(weeklyAmount) || isNaN(weeksReceived) || weeklyAmount <= 0 || weeksReceived < 0) return;
        await setIncomeSettings(user.uid, {
            weeklyAmount,
            currency: 'OMR',
            startDate: new Date().toISOString(),
            weeksReceived,
        });
        setEditingIncome(false);
    };

    const weeklyProgress = goals?.weeklyTarget
        ? (savedThisWeek / goals.weeklyTarget) * 100
        : 0;
    const monthlyProgress = goals?.monthlyTarget
        ? (savedThisMonth / goals.monthlyTarget) * 100
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                    <button
                        onClick={() => setShowInUSD(!showInUSD)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${showInUSD ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        {showInUSD ? 'USD' : 'OMR'}
                    </button>
                </div>
                <button
                    onClick={() => setEditingIncome(!editingIncome)}
                    className="text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                    {editingIncome ? 'Cancel' : income ? 'Edit Income' : 'Set Income'}
                </button>
            </div>

            {/* ── Income Edit Form ─────────────────────── */}
            {editingIncome && (
                <div className="card">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="text-xs text-slate-500 mb-1 block">Weekly Income (OMR)</label>
                            <input
                                type="number"
                                value={incomeForm.weeklyAmount}
                                onChange={(e) => setIncomeForm({ ...incomeForm, weeklyAmount: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                min="0"
                                step="0.01"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 mb-1 block">Weeks Received So Far</label>
                            <input
                                type="number"
                                value={incomeForm.weeksReceived}
                                onChange={(e) => setIncomeForm({ ...incomeForm, weeksReceived: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                min="0"
                            />
                        </div>
                    </div>
                    <button
                        onClick={handleSaveIncome}
                        className="mt-3 w-full rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        Save Income Settings
                    </button>
                </div>
            )}

            {/* ── Top Row: Income / Expenses / Deposit / Saved / Net / Untracked */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {(() => {
                    const cur = showInUSD ? 'USD' as const : 'OMR' as const;
                    const r = showInUSD && omrToUsdRate ? omrToUsdRate : 1;
                    const incomeVal = totalIncome * r;
                    const expensesVal = totalExpensesSpent * r;
                    const depositVal = showInUSD ? (convertedDepositUSD ?? null) : (convertedDepositOMR ?? null);
                    const savingVal = showInUSD ? (convertedSavingUSD ?? null) : (convertedSavingOMR ?? null);
                    const netVal = incomeVal - expensesVal;
                    const untrackedVal = depositVal !== null && savingVal !== null ? incomeVal - expensesVal - savingVal - depositVal : null;
                    return (
                        <>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                                <p className="text-xs font-medium text-emerald-600 mb-1">Total Income</p>
                                <p className="text-2xl font-bold text-emerald-700">
                                    {formatCurrency(incomeVal, cur)}
                                </p>
                                <p className="text-xs text-emerald-500 mt-1">
                                    {income ? `${formatCurrency(income.weeklyAmount * r, cur)}/wk × ${income.weeksReceived} wks` : 'Not set'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                                <p className="text-xs font-medium text-red-600 mb-1">Total Expenses</p>
                                <p className="text-2xl font-bold text-red-700">
                                    {formatCurrency(expensesVal, cur)}
                                </p>
                                <p className="text-xs text-red-500 mt-1">All logged entries</p>
                            </div>
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                                <p className="text-xs font-medium text-blue-600 mb-1">Total Deposit</p>
                                <p className="text-2xl font-bold text-blue-700">
                                    {depositVal !== null ? formatCurrency(depositVal, cur) : '…'}
                                </p>
                                <p className="text-xs text-blue-500 mt-1">Across all accounts</p>
                            </div>
                            <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
                                <p className="text-xs font-medium text-teal-600 mb-1">Total Saved</p>
                                <p className="text-2xl font-bold text-teal-700">
                                    {savingVal !== null ? formatCurrency(savingVal, cur) : '…'}
                                </p>
                                <p className="text-xs text-teal-500 mt-1">Saving buckets only</p>
                            </div>
                            <div className={`rounded-xl p-5 border ${netVal >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                                <p className={`text-xs font-medium mb-1 ${netVal >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                                    Net (Income − Expenses)
                                </p>
                                <p className={`text-2xl font-bold ${netVal >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                                    {formatCurrency(netVal, cur)}
                                </p>
                                <p className={`text-xs mt-1 ${netVal >= 0 ? 'text-blue-500' : 'text-amber-500'}`}>
                                    {netVal >= 0 ? 'Positive balance' : 'Over budget'}
                                </p>
                            </div>
                            <div className={`rounded-xl p-5 border ${(untrackedVal ?? 0) >= 0 ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'}`}>
                                <p className={`text-xs font-medium mb-1 ${(untrackedVal ?? 0) >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                    Untracked
                                </p>
                                <p className={`text-2xl font-bold ${(untrackedVal ?? 0) >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
                                    {untrackedVal !== null ? formatCurrency(untrackedVal, cur) : '…'}
                                </p>
                                <p className={`text-xs mt-1 ${(untrackedVal ?? 0) >= 0 ? 'text-purple-500' : 'text-red-500'}`}>
                                    Income − Expenses − Saved − Deposit
                                </p>
                            </div>
                        </>
                    );
                })()}
            </div>

            {/* ── Summary Cards ─────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="card">
                    <p className="text-sm text-slate-500">Expenses Till End of 2026</p>
                    <p className="text-2xl font-bold text-red-600">
                        {formatOMR(totalExpensesTillEnd)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        {weeksLeft} weeks · Fixed {formatOMR(fixedTotalTillEnd)} + One-time {formatOMR(oneTimeTotalTillEnd)} + Future {formatOMR(futureTotalTillEnd)}
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
                        {fixedPayments.map((expense) => {
                            const weeklyImpact = toWeekly(expense.amount, expense.frequency);
                            return (
                                <div key={expense.id} className="border-b border-slate-50 pb-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                            <p className="text-xs text-slate-400">{expense.category} · Fixed</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-slate-800">
                                                {formatOMR(weeklyImpact)}<span className="text-xs text-slate-400">/wk</span>
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {formatOMR(expense.amount)}/{expense.frequency}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {budgetExpenses.map((expense) => {
                            const { baseBudget, carryover, effectiveBudget } = getEffectiveBudget(expense, entries);
                            const spent = spentThisWeek(expense.id);
                            const remaining = effectiveBudget - spent;
                            const pct = effectiveBudget > 0 ? Math.min((spent / effectiveBudget) * 100, 100) : 0;
                            return (
                                <div key={expense.id} className="border-b border-slate-50 pb-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                            <p className="text-xs text-slate-400">
                                                {expense.category} · Budget
                                                {carryover !== 0 && (
                                                    <span className={carryover > 0 ? ' text-emerald-500' : ' text-red-400'}>
                                                        {' '}({carryover > 0 ? '+' : ''}{formatOMR(carryover)})
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-slate-800">
                                                {formatOMR(spent)}
                                                <span className="text-xs text-slate-400"> / {formatOMR(effectiveBudget)}</span>
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
                                            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {futureExpenses.map((expense) => {
                            const impact = futureWeeklyImpact(expense);
                            const totalPaid = entries.filter((e) => e.expenseId === expense.id && e.type !== 'set-aside').reduce((s, e) => s + e.amount, 0);
                            const total = expense.estimatedTotal ?? 0;
                            const pct = total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;
                            return (
                                <div key={expense.id} className="border-b border-slate-50 pb-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                            <p className="text-xs text-slate-400">{expense.category} · Future</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-slate-800">
                                                {formatOMR(impact)}<span className="text-xs text-slate-400">/wk</span>
                                            </p>
                                            <p className="text-xs text-blue-600">
                                                {formatOMR(totalPaid)} / {formatOMR(total)} paid
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500 bg-blue-500" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── This Week's Expected Expenses ─────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-slate-800">
                        This Week&apos;s Expenses
                    </h3>
                    <span className="text-xs text-slate-400">
                        {formatDateRange(thisWeek.start, thisWeek.end)}
                    </span>
                </div>
                {/* Status banner */}
                <div className={`rounded-lg px-4 py-3 mb-4 ${thisWeekDiff > 0 ? 'bg-emerald-50 border border-emerald-200' :
                    thisWeekDiff < 0 ? 'bg-red-50 border border-red-200' :
                        'bg-slate-50 border border-slate-200'
                    }`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">Expected</p>
                            <p className="text-lg font-bold text-slate-800">{formatOMR(thisWeekExpected)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-slate-500">Spent</p>
                            <p className="text-lg font-bold text-slate-800">{formatOMR(thisWeekSpent)}</p>
                        </div>
                        <div className="text-right">
                            <p className={`text-xs ${thisWeekDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {thisWeekDiff >= 0 ? 'Under Budget' : 'Over Budget'}
                            </p>
                            <p className={`text-lg font-bold ${thisWeekDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {thisWeekDiff >= 0 ? '' : '+'}{formatOMR(Math.abs(thisWeekDiff))}
                            </p>
                        </div>
                    </div>
                    {thisWeekExpected > 0 && (
                        <div className="mt-2 h-2 rounded-full bg-white/60 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${thisWeekSpent > thisWeekExpected ? 'bg-red-500' :
                                    thisWeekSpent > thisWeekExpected * 0.75 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                style={{ width: `${Math.min((thisWeekSpent / thisWeekExpected) * 100, 100)}%` }}
                            />
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    {/* Fixed payments — show ALL with weekly impact */}
                    {fixedPayments.map((expense) => {
                        const weeklyImpact = toWeekly(expense.amount, expense.frequency);
                        const dueThisWeek = isDueInWeek(expense, thisWeek.start, thisWeek.end);
                        const paid = dueThisWeek && isPaidInPeriod(expense, thisWeek.start, thisWeek.end);
                        const aside = setAsideThisWeek(expense.id);
                        const isSetAside = aside >= weeklyImpact * 0.99;
                        return (
                            <div key={expense.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${paid ? 'bg-emerald-50' : isSetAside ? 'bg-emerald-50' : dueThisWeek ? 'bg-amber-50' : 'bg-slate-50'
                                }`}>
                                <div>
                                    <p className={`text-sm font-medium ${paid || isSetAside ? 'text-emerald-700' : 'text-slate-700'}`}>{expense.name}</p>
                                    <p className="text-xs text-slate-400">
                                        Fixed · {expense.category} · {formatOMR(expense.amount)}/{expense.frequency}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <p className={`text-sm font-bold ${paid || isSetAside ? 'text-emerald-600' : 'text-slate-800'}`}>{formatOMR(weeklyImpact)}<span className="text-xs text-slate-400 font-normal">/wk</span></p>
                                    </div>
                                    {dueThisWeek ? (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${paid ? 'text-emerald-600 bg-emerald-100' : 'text-amber-600 bg-amber-100'}`}>
                                            {paid ? '✓ Paid' : `Due${expense.frequency === 'monthly' ? ` day ${expense.dueDay ?? 1}` : ''}`}
                                        </span>
                                    ) : isSetAside ? (
                                        <button
                                            onClick={() => handleUndoSetAside(expense)}
                                            className="text-xs px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-100 hover:bg-red-100 hover:text-red-600 transition-colors"
                                        >
                                            ✓ Set Aside
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleSetAside(expense)}
                                            className="text-xs px-2 py-0.5 rounded-full text-blue-600 bg-blue-100 hover:bg-blue-200 transition-colors"
                                        >
                                            Set Aside
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {/* Budgets */}
                    {budgetExpenses.map((expense) => {
                        const { effectiveBudget, carryover } = getEffectiveBudget(expense, entries);
                        const spent = spentThisWeek(expense.id);
                        const remaining = effectiveBudget - spent;
                        const pct = effectiveBudget > 0 ? Math.min((spent / effectiveBudget) * 100, 100) : 0;
                        return (
                            <div key={expense.id} className="py-2 px-3 rounded-lg bg-slate-50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                        <p className="text-xs text-slate-400">
                                            Budget · {expense.category}
                                            {carryover !== 0 && (
                                                <span className={carryover > 0 ? ' text-emerald-500' : ' text-red-400'}>
                                                    {' '}({carryover > 0 ? '+' : ''}{formatOMR(carryover)})
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800">
                                            {formatOMR(spent)} <span className="text-xs text-slate-400 font-normal">/ {formatOMR(effectiveBudget)}</span>
                                        </p>
                                        <p className={`text-xs ${remaining >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {remaining >= 0 ? `${formatOMR(remaining)} left` : `${formatOMR(Math.abs(remaining))} over`}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                    {/* One-time */}
                    {paidOneTimeThisWeek.map((expense) => (
                        <div key={expense.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50">
                            <div>
                                <p className="text-sm font-medium text-emerald-700 line-through">{expense.name}</p>
                                <p className="text-xs text-slate-400">One-time · {expense.category}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-emerald-600">{formatOMR(expense.amount)}</p>
                                <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Paid</span>
                            </div>
                        </div>
                    ))}
                    {unpaidOneTime.map((expense) => (
                        <div key={expense.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50">
                            <div>
                                <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                <p className="text-xs text-slate-400">One-time · {expense.category}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-800">{formatOMR(expense.amount)}</p>
                                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pending</span>
                            </div>
                        </div>
                    ))}
                    {/* Future expenses */}
                    {futureExpenses.map((expense) => {
                        const impact = futureWeeklyImpact(expense);
                        const totalPaid = entries.filter((e) => e.expenseId === expense.id && e.type !== 'set-aside').reduce((s, e) => s + e.amount, 0);
                        const total = expense.estimatedTotal ?? 0;
                        const aside = setAsideThisWeek(expense.id);
                        const isSetAside = aside >= impact * 0.99;
                        const weekPaid = isFutureWeekPaid(expense, totalPaid, 0);
                        return (
                            <div key={expense.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${weekPaid || isSetAside ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                                <div>
                                    <p className={`text-sm font-medium ${weekPaid || isSetAside ? 'text-emerald-700' : 'text-slate-700'}`}>{expense.name}</p>
                                    <p className="text-xs text-slate-400">
                                        Future · {expense.category} · {formatOMR(totalPaid)}/{formatOMR(total)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <p className={`text-sm font-bold ${weekPaid || isSetAside ? 'text-emerald-600' : 'text-slate-800'}`}>{formatOMR(impact)}<span className="text-xs text-slate-400 font-normal">/wk</span></p>
                                    </div>
                                    {weekPaid ? (
                                        <span className="text-xs px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-100">
                                            ✓ Paid
                                        </span>
                                    ) : isSetAside ? (
                                        <button
                                            onClick={() => handleUndoSetAside(expense)}
                                            className="text-xs px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-100 hover:bg-red-100 hover:text-red-600 transition-colors"
                                        >
                                            ✓ Set Aside
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleSetAside(expense)}
                                            className="text-xs px-2 py-0.5 rounded-full text-blue-600 bg-blue-100 hover:bg-blue-200 transition-colors"
                                        >
                                            Set Aside
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {fixedPayments.length === 0 && budgetExpenses.length === 0 && oneTimeExpenses.length === 0 && futureExpenses.length === 0 && (
                        <p className="text-sm text-slate-400">No expenses this week.</p>
                    )}
                </div>
            </div>

            {/* ── Next Week's Expected Expenses ────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-slate-800">
                        Next Week&apos;s Expenses
                    </h3>
                    <span className="text-xs text-slate-400">
                        {formatDateRange(nextWeek.start, nextWeek.end)}
                    </span>
                </div>
                <div className="rounded-lg px-4 py-3 mb-4 bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">Expected Total</p>
                            <p className="text-lg font-bold text-slate-800">{formatOMR(nextWeekExpected)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-400">
                                {fixedPayments.length} fixed + {budgetExpenses.length} budget{budgetExpenses.length !== 1 ? 's' : ''}
                                {nextWeekFixed.length > 0 && ` · ${nextWeekFixed.length} due`}
                                {unpaidOneTime.length > 0 && ` + ${unpaidOneTime.length} pending`}
                                {futureExpenses.length > 0 && ` + ${futureExpenses.length} future`}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    {fixedPayments.map((expense) => {
                        const weeklyImpact = toWeekly(expense.amount, expense.frequency);
                        const dueNextWeek = isDueInWeek(expense, nextWeek.start, nextWeek.end);
                        return (
                            <div key={expense.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${dueNextWeek ? 'bg-amber-50' : 'bg-slate-50'}`}>
                                <div>
                                    <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                    <p className="text-xs text-slate-400">
                                        Fixed · {expense.category} · {formatOMR(expense.amount)}/{expense.frequency}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-slate-800">{formatOMR(weeklyImpact)}<span className="text-xs text-slate-400 font-normal">/wk</span></p>
                                    {dueNextWeek && (
                                        <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                            Due{expense.frequency === 'monthly' ? ` day ${expense.dueDay ?? 1}` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {budgetExpenses.map((expense) => (
                        <div key={expense.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                            <div>
                                <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                <p className="text-xs text-slate-400">Budget · {expense.category}</p>
                            </div>
                            <p className="text-sm font-bold text-slate-800">{formatOMR(expense.weeklyBudget ?? 0)}</p>
                        </div>
                    ))}
                    {unpaidOneTime.map((expense) => (
                        <div key={expense.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                            <div>
                                <p className="text-sm font-medium text-slate-700">{expense.name}</p>
                                <p className="text-xs text-slate-400">One-time · {expense.category}</p>
                            </div>
                            <p className="text-sm font-bold text-slate-800">{formatOMR(expense.amount)}</p>
                        </div>
                    ))}
                    {futureExpenses.map((expense) => {
                        const totalPaid = entries.filter((e) => e.expenseId === expense.id && e.type !== 'set-aside').reduce((s, e) => s + e.amount, 0);
                        const nextWeekPaid = isFutureWeekPaid(expense, totalPaid, 1);
                        return (
                            <div key={expense.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${nextWeekPaid ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                                <div>
                                    <p className={`text-sm font-medium ${nextWeekPaid ? 'text-emerald-700' : 'text-slate-700'}`}>{expense.name}</p>
                                    <p className="text-xs text-slate-400">Future · {expense.category}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className={`text-sm font-bold ${nextWeekPaid ? 'text-emerald-600' : 'text-slate-800'}`}>{formatOMR(futureWeeklyImpact(expense))}<span className="text-xs text-slate-400 font-normal">/wk</span></p>
                                    {nextWeekPaid && (
                                        <span className="text-xs px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-100">
                                            ✓ Paid
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {fixedPayments.length === 0 && budgetExpenses.length === 0 && unpaidOneTime.length === 0 && futureExpenses.length === 0 && (
                        <p className="text-sm text-slate-400">No expenses expected next week.</p>
                    )}
                </div>
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
                {accounts.length === 0 ? (
                    <p className="text-sm text-slate-400">No saving places created yet.</p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {accounts.map((account) => {
                            const balance = transactions
                                .filter((t) => t.accountId === account.id)
                                .reduce((sum, t) => sum + t.amount, 0);
                            return (
                                <div key={account.id} className="rounded-lg border border-slate-100 p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{account.name}</p>
                                            <p className="text-xs text-slate-400">{account.type} · {account.currency}</p>
                                        </div>
                                        <p className={`text-sm font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {formatCurrency(balance, account.currency)}
                                        </p>
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
