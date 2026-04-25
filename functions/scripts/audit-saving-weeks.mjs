import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); // Saturday start
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfWeek(start) {
    const e = new Date(start);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
}

function keyOfWeek(start) {
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function labelOfWeek(start) {
    const end = endOfWeek(start);
    const fmt = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', fmt)} – ${end.toLocaleDateString('en-US', fmt)}`;
}

async function main() {
    const [accSnap, txnSnap] = await Promise.all([
        db.collection(`users/${USER_ID}/accounts`).get(),
        db.collection(`users/${USER_ID}/transactions`).get(),
    ]);

    const accountCurrency = new Map();
    for (const d of accSnap.docs) {
        const a = d.data();
        accountCurrency.set(d.id, a.currency ?? 'OMR');
    }

    const weeks = new Map();
    const savingTxns = [];
    for (const d of txnSnap.docs) {
        const t = d.data();
        if (t.bucket !== 'saving') continue;
        const date = t.date?.toDate?.();
        if (!(date instanceof Date)) continue;
        const weekStart = startOfWeek(date);
        const key = keyOfWeek(weekStart);
        const item = {
            id: d.id,
            accountId: t.accountId,
            currency: accountCurrency.get(t.accountId) ?? 'OMR',
            amount: t.amount ?? 0,
            date,
            notes: t.notes ?? '',
            weekKey: key,
            weekLabel: labelOfWeek(weekStart),
        };
        savingTxns.push(item);
        weeks.set(key, (weeks.get(key) ?? 0) + item.amount);
    }

    const sortedWeeks = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
    console.log('Saving totals by week (raw currency amounts; most are OMR):');
    for (const [k, total] of sortedWeeks) {
        const [y, m, d] = k.split('-').map(Number);
        const label = labelOfWeek(new Date(y, m - 1, d));
        console.log(`  ${label} (${k}) => ${total.toFixed(3)}`);
    }

    const targetWeeks = ['2026-03-14', '2026-04-04'];
    for (const wk of targetWeeks) {
        console.log(`\nTransactions in week ${wk}:`);
        const rows = savingTxns
            .filter((t) => t.weekKey === wk)
            .sort((a, b) => a.date - b.date);
        if (rows.length === 0) {
            console.log('  (none)');
            continue;
        }
        for (const r of rows) {
            console.log(
                `  ${r.id} | ${r.date.toISOString().slice(0, 10)} | ${r.amount} ${r.currency} | acc=${r.accountId} | ${r.notes}`
            );
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
