import type { Frequency } from '@/types';

export function formatOMR(amount: number): string {
    const formatted = Math.abs(amount).toLocaleString('en-US', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    });
    return amount < 0 ? `OMR -${formatted}` : `OMR ${formatted}`;
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
