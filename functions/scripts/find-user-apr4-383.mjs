import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const FALLBACK_RATES = { USD: 1, OMR: 0.385, EUR: 0.92, TRY: 32.5, GBP: 0.79, AED: 3.67, SAR: 3.75, INR: 83.5 };

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
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

async function totalForWeek(userId, key, rates) {
    const [accSnap, txnSnap] = await Promise.all([
        db.collection(`users/${userId}/accounts`).get(),
        db.collection(`users/${userId}/transactions`).get(),
    ]);
    const accountMap = new Map();
    for (const d of accSnap.docs) accountMap.set(d.id, d.data());

    let total = 0;
    for (const d of txnSnap.docs) {
        const t = d.data();
        if (t.bucket !== 'saving') continue;
        const date = t.date?.toDate?.() ?? t.createdAt?.toDate?.() ?? new Date(0);
        if (weekKey(date) !== key) continue;
        const currency = accountMap.get(t.accountId)?.currency ?? 'OMR';
        total += convert(t.amount ?? 0, currency, 'OMR', rates);
    }
    return total;
}

async function main() {
    const rates = await getRates();
    const usersSnap = await db.collection('users').get();
    const keys = ['2026-04-04', '2026-03-28', '2026-04-11', '2026-04-18'];
    console.log(`Scanning ${usersSnap.size} user(s)...`);
    for (const d of usersSnap.docs) {
        const userId = d.id;
        const totals = {};
        for (const key of keys) {
            totals[key] = await totalForWeek(userId, key, rates);
        }
        const apr4 = totals['2026-04-04'];
        if (Math.abs(apr4 - 383.994) < 0.01 || Math.abs(apr4 - 385) < 0.01 || apr4 > 0.001) {
            console.log(userId, Object.fromEntries(keys.map((k) => [k, Number(totals[k].toFixed(6))])));
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
