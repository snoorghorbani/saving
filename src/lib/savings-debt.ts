const EPSILON = 1e-6;

export interface SavingDebtAllocation {
    weekStart: Date;
    weekEnd: Date;
    amountOmr: number;
    isCurrentWeek: boolean;
}

export function startOfSavingsWeek(date: Date): Date {
    const start = new Date(date);
    start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
    start.setHours(0, 0, 0, 0);
    return start;
}

export function endOfSavingsWeek(weekStart: Date): Date {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

export function isSameSavingsWeek(a: Date, b: Date): boolean {
    return startOfSavingsWeek(a).getTime() === startOfSavingsWeek(b).getTime();
}

export function savingsWeekKey(date: Date): string {
    const start = startOfSavingsWeek(date);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function formatSavingsWeekLabel(weekStart: Date, weekEnd: Date): string {
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

interface PlanSavingDebtAllocationsParams {
    selectedDate: Date;
    totalAmountOmr: number;
    weeklyTargetOmr: number;
    savedByWeekKey: Record<string, number>;
    maxLookbackWeeks?: number;
}

export function planSavingDebtAllocations({
    selectedDate,
    totalAmountOmr,
    weeklyTargetOmr,
    savedByWeekKey,
    maxLookbackWeeks = 52,
}: PlanSavingDebtAllocationsParams): SavingDebtAllocation[] {
    if (weeklyTargetOmr <= EPSILON || totalAmountOmr <= EPSILON) return [];

    const currentWeekStart = startOfSavingsWeek(selectedDate);
    const allocations: SavingDebtAllocation[] = [];
    let remainingOmr = totalAmountOmr;

    // Fill missed weeks immediately before the selected week.
    for (let i = 1; i <= maxLookbackWeeks && remainingOmr > EPSILON; i++) {
        const debtWeekStart = new Date(currentWeekStart);
        debtWeekStart.setDate(debtWeekStart.getDate() - 7 * i);
        const debtWeekEnd = endOfSavingsWeek(debtWeekStart);
        const weekSaved = savedByWeekKey[savingsWeekKey(debtWeekStart)] ?? 0;
        const deficit = Math.max(0, weeklyTargetOmr - weekSaved);
        if (deficit <= EPSILON) break;

        const allocation = Math.min(deficit, remainingOmr);
        allocations.push({
            weekStart: debtWeekStart,
            weekEnd: debtWeekEnd,
            amountOmr: allocation,
            isCurrentWeek: false,
        });
        remainingOmr -= allocation;
    }

    if (remainingOmr > EPSILON) {
        allocations.push({
            weekStart: currentWeekStart,
            weekEnd: endOfSavingsWeek(currentWeekStart),
            amountOmr: remainingOmr,
            isCurrentWeek: true,
        });
    }

    return allocations;
}
