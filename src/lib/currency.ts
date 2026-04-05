import type { Currency } from '@/types';

interface RateCache {
    rates: Record<string, number>;
    timestamp: number;
}

let cache: RateCache | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch exchange rates from the free API (base = USD).
 * Uses https://open.er-api.com/v6/latest/USD (no API key required).
 * Caches in memory for 1 hour.
 */
export async function getRates(): Promise<Record<string, number>> {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return cache.rates;
    }
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) throw new Error('Failed to fetch rates');
        const data = await res.json();
        const rates: Record<string, number> = data.rates ?? {};
        cache = { rates, timestamp: Date.now() };
        return rates;
    } catch {
        // Return last known rates or fallback
        if (cache) return cache.rates;
        // Hardcoded fallback so the app doesn't break
        return { USD: 1, OMR: 0.385, EUR: 0.92, TRY: 32.5, GBP: 0.79, AED: 3.67, SAR: 3.75, INR: 83.5 };
    }
}

/** Convert amount from one currency to another */
export async function convert(
    amount: number,
    from: Currency,
    to: Currency,
): Promise<number> {
    if (from === to) return amount;
    const rates = await getRates();
    const fromRate = rates[from] ?? 1;
    const toRate = rates[to] ?? 1;
    // Convert from -> USD -> to
    return (amount / fromRate) * toRate;
}

/** Format a currency amount with its symbol */
export function formatCurrency(amount: number, currency: Currency): string {
    const abs = Math.abs(amount);
    const decimals = currency === 'OMR' ? 3 : 2;
    const formatted = abs.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    const sign = amount < 0 ? '-' : '';
    return `${sign}${currency} ${formatted}`;
}
