import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const WEEKLY_GOAL = 385;
const EPOCH = new Date(2026, 2, 1, 0, 0, 0, 0); // March 1, 2026
const PRIMARY_CURRENCY = 'OMR';
const FALLBACK_RATES = { USD: 1, OMR: 0.385, EUR: 0.92, TRY: 32.5, GBP: 0.79, AED: 3.67, SAR: 3.75, INR: 83.5 };

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); // Saturday start
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

async function main() {
    const [accSnap, txnSnap, rates] = await Promise.all([
        db.collection(`users/${USER_ID}/accounts`).get(),
        db.collection(`users/${USER_ID}/transactions`).get(),
        getRates(),
    ]);

    const accountMap = new Map();
    for (const d of accSnap.docs) accountMap.set(d.id, d.data());

    // Gather all saving-bucket transactions, convert to OMR
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
            currency,
            amount,
            omr,
            date,
            key: weekKey(date),
        });
    }

    // Sum total savings in OMR
    const totalSaved = rows.reduce((sum, r) => sum + r.omr, 0);
    console.log(`Total saved (OMR): ${totalSaved.toFixed(3)}`);

    // Calculate number of weeks from epoch to now, never before March 1, 2026
    const now = new Date();
    const weeks = [];
    let wk = startOfWeek(EPOCH);
    // Ensure first week is never before March 1, 2026
    if (wk < EPOCH) {
        wk.setDate(wk.getDate() + 7);
    }
    while (wk <= startOfWeek(now)) {
        // Only add weeks on or after March 1, 2026
        if (wk >= EPOCH) {
            weeks.push(weekKey(wk));
        }
        wk.setDate(wk.getDate() + 7);
    }
    const nWeeks = weeks.length;
    console.log(`Weeks since epoch: ${nWeeks}`);

    // Distribute totalSaved so each week gets at least WEEKLY_GOAL, remainder as evenly as possible
    let remaining = totalSaved;
    const perWeek = Array(nWeeks).fill(0);
    for (let i = 0; i < nWeeks; ++i) {
        if (remaining >= WEEKLY_GOAL) {
            perWeek[i] = WEEKLY_GOAL;
            remaining -= WEEKLY_GOAL;
        } else {
            perWeek[i] = remaining;
            remaining = 0;
        }
    }
    // If any remainder, distribute it (e.g. add to last week)
    if (remaining > 0) perWeek[nWeeks - 1] += remaining;

    // Write manualGoalsOverrides for each week using collection().doc()
    const batch = db.batch();
    const overridesCol = db.collection(`users/${USER_ID}/settings/manualGoalsOverrides`);
    for (let i = 0; i < nWeeks; ++i) {
        const ref = overridesCol.doc(weeks[i]);
        batch.set(ref, { value: perWeek[i], updatedAt: new Date().toISOString() });
        console.log(`Set week ${weeks[i]}: ${perWeek[i].toFixed(3)} OMR`);
    }
    await batch.commit();
    console.log('Done. All weeks updated.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
