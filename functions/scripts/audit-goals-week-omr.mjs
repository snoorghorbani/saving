import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const FALLBACK_RATES = { USD: 1, OMR: 0.385, EUR: 0.92, TRY: 32.5, GBP: 0.79, AED: 3.67, SAR: 3.75, INR: 83.5 };

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); // Saturday
    d.setHours(0, 0, 0, 0);
    return d;
}

function weekKey(date) {
    const s = startOfWeek(date);
    const y = s.getFullYear();
    const m = String(s.getMonth() + 1).padStart(2, '0');
    const d = String(s.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function weekLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    const s = new Date(y, m - 1, d, 0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

async function getRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) throw new Error(`rates status=${res.status}`);
        const data = await res.json();
        return data?.rates ?? FALLBACK_RATES;
    } catch {
        return FALLBACK_RATES;
    }
}

function convert(amount, from, to, rates) {
    if (from === to) return amount;
    const fromRate = rates[from] ?? 1;
    const toRate = rates[to] ?? 1;
    return (amount / fromRate) * toRate;
}

async function main() {
    const [accSnap, txnSnap, rates] = await Promise.all([
        db.collection(`users/${USER_ID}/accounts`).get(),
        db.collection(`users/${USER_ID}/transactions`).get(),
        getRates(),
    ]);

    const accountMap = new Map();
    for (const d of accSnap.docs) {
        accountMap.set(d.id, d.data());
    }

    const rows = [];
    for (const d of txnSnap.docs) {
        const t = d.data();
        if ((t.bucket ?? 'saving') !== 'saving') continue;
        const date = t.date?.toDate?.() ?? t.createdAt?.toDate?.() ?? new Date(0);
        if (!(date instanceof Date)) continue;
        const account = accountMap.get(t.accountId);
        const currency = account?.currency ?? 'OMR';
        const amount = t.amount ?? 0;
        const omr = convert(amount, currency, 'OMR', rates);
        rows.push({
            id: d.id,
            accountId: t.accountId,
            accountName: account?.name ?? '(unknown)',
            currency,
            amount,
            omr,
            notes: t.notes ?? '',
            date,
            hasExplicitDate: !!t.date?.toDate?.(),
            key: weekKey(date),
        });
    }

    const totals = new Map();
    for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.omr);
    const sorted = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
    console.log('Goals-style OMR totals by week:');
    for (const [k, total] of sorted) {
        console.log(`  ${weekLabel(k)} (${k}) => ${total.toFixed(6)} OMR`);
    }

    const targetKey = '2026-04-04';
    console.log(`\nSaving transactions in ${weekLabel(targetKey)} (${targetKey}):`);
    const targetRows = rows
        .filter((r) => r.key === targetKey)
        .sort((a, b) => a.date - b.date);
    if (targetRows.length === 0) {
        console.log('  (none)');
    } else {
        for (const r of targetRows) {
            const src = r.hasExplicitDate ? 'date' : 'createdAt';
            console.log(`  ${r.id} | ${r.date.toISOString().slice(0, 10)} (${src}) | ${r.amount} ${r.currency} (~${r.omr.toFixed(6)} OMR) | ${r.accountName}/${r.accountId} | ${r.notes}`);
        }
    }

    const mar14Key = '2026-03-14';
    console.log(`\nSaving transactions in ${weekLabel(mar14Key)} (${mar14Key}):`);
    const marRows = rows
        .filter((r) => r.key === mar14Key)
        .sort((a, b) => a.date - b.date);
    if (marRows.length === 0) {
        console.log('  (none)');
    } else {
        for (const r of marRows) {
            const src = r.hasExplicitDate ? 'date' : 'createdAt';
            console.log(`  ${r.id} | ${r.date.toISOString().slice(0, 10)} (${src}) | ${r.amount} ${r.currency} (~${r.omr.toFixed(6)} OMR) | ${r.accountName}/${r.accountId} | ${r.notes}`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
