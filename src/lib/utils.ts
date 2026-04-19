import type { Expense, ExpenseEntry, Frequency } from '@/types';
import { formatCurrency } from './currency';

export function formatOMR(amount: number): string {
    return formatCurrency(amount, 'OMR');
}

/** Weeks remaining from now until a deadline date (minimum 1). */
export function weeksUntil(deadline: string): number {
    const ms = new Date(deadline).getTime() - Date.now();
    return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

/** Weekly impact of a future expense: estimatedTotal / weeks until deadline. */
export function futureWeeklyImpact(expense: Expense): number {
    if (expense.kind !== 'future' || !expense.estimatedTotal || !expense.deadline) return 0;
    return expense.estimatedTotal / weeksUntil(expense.deadline);
}

/** Total weeks from expense creation to deadline (stable denominator for advance-payment logic). */
export function totalWeeksForFuture(expense: Expense): number {
    if (!expense.deadline) return 1;
    const ms = new Date(expense.deadline).getTime() - expense.createdAt.getTime();
    return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

/** Fixed weekly portion based on the full timeline (creation → deadline). */
export function futureWeeklyPortion(expense: Expense): number {
    if (expense.kind !== 'future' || !expense.estimatedTotal || !expense.deadline) return 0;
    return expense.estimatedTotal / totalWeeksForFuture(expense);
}

/**
 * Check if a future expense is "paid" for a specific week.
 * If totalPaid covers the cumulative weekly portions up to the target week,
 * that week is considered paid (advance payments cover future weeks).
 *
 * @param expense - The future expense
 * @param totalPaid - Sum of all actual payments (excluding set-asides)
 * @param weekOffset - 0 = this week, 1 = next week, etc.
 */
export function isFutureWeekPaid(expense: Expense, totalPaid: number, weekOffset: number = 0): boolean {
    if (expense.kind !== 'future' || !expense.estimatedTotal || !expense.deadline) return false;
    const total = expense.estimatedTotal;
    if (total <= 0) return false;
    if (totalPaid >= total) return true;
    const portion = futureWeeklyPortion(expense);
    if (portion <= 0) return false;
    const msElapsed = Date.now() - expense.createdAt.getTime();
    const currentWeekNum = Math.max(1, Math.ceil(msElapsed / (7 * 24 * 60 * 60 * 1000)));
    const targetWeekNum = currentWeekNum + weekOffset;
    return totalPaid >= targetWeekNum * portion;
}

export function toWeekly(amount: number, frequency: Frequency): number {
    switch (frequency) {
        case 'weekly':
            return amount;
        case 'monthly':
            return amount / 4.33;
        case 'yearly':
            return amount / 52;
        case 'one-time':
            return amount;
    }
}

/** Returns the start (Saturday 00:00) and end (Friday 23:59) of a week.
 *  offset 0 = this week, 1 = next week, -1 = last week, etc. */
export function getWeekRange(offset = 0): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 1) % 7) + offset * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

/** Check if a fixed-payment expense is due within a given week. */
export function isDueInWeek(expense: Expense, weekStart: Date, weekEnd: Date): boolean {
    if (expense.kind !== 'fixed-payment') return false;
    if (expense.frequency === 'weekly') return true;
    if (expense.frequency === 'monthly') {
        const day = expense.dueDay ?? 1;
        const d1 = new Date(weekStart.getFullYear(), weekStart.getMonth(), day);
        if (d1 >= weekStart && d1 <= weekEnd) return true;
        if (weekStart.getMonth() !== weekEnd.getMonth()) {
            const d2 = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), day);
            if (d2 >= weekStart && d2 <= weekEnd) return true;
        }
        return false;
    }
    return false;
}

/**
 * Calculate the effective budget for a weekly-budget expense this week,
 * accounting for chained carryover from all past weeks since the expense was created.
 * Positive carryover = underspent last week (bonus), negative = overspent (penalty).
 */
export function getEffectiveBudget(
    expense: Expense,
    entries: ExpenseEntry[],
): { baseBudget: number; carryover: number; effectiveBudget: number } {
    const baseBudget = expense.weeklyBudget ?? 0;
    const thisWeek = getWeekRange(0);

    // If the expense was created after this week started, this is its first week — no carryover
    if (expense.createdAt > thisWeek.start) {
        return { baseBudget, carryover: 0, effectiveBudget: baseBudget };
    }

    // Walk backwards week by week, accumulating carryover
    const expenseEntries = entries.filter(
        (e) => e.expenseId === expense.id && e.type !== 'set-aside'
    );

    let carryover = 0;
    for (let offset = -1; ; offset--) {
        const week = getWeekRange(offset);
        // Stop if we've gone before the expense was created
        if (week.end < expense.createdAt) break;

        const weekEffective = baseBudget + carryover;
        const weekSpent = expenseEntries
            .filter((e) => e.date >= week.start && e.date <= week.end)
            .reduce((sum, e) => sum + e.amount, 0);
        carryover = weekEffective - weekSpent;
    }

    return {
        baseBudget,
        carryover,
        effectiveBudget: baseBudget + carryover,
    };
}
