import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const TARGET_OMR = 385;
const EPSILON = 0.001;

// Weeks are Saturday -> Friday
const SOURCE_WEEK_START = new Date(2026, 3, 4, 0, 0, 0, 0);   // Apr 4, 2026
const SOURCE_WEEK_END = new Date(2026, 3, 10, 23, 59, 59, 999); // Apr 10, 2026
const TARGET_WEEK_DATE = new Date(2026, 2, 20, 12, 0, 0, 0);   // Mar 20, 2026 (inside Mar 14-20 week)

const FALLBACK_RATES = { USD: 1, OMR: 0.385, EUR: 0.92, TRY: 32.5, GBP: 0.79, AED: 3.67, SAR: 3.75, INR: 83.5 };

function closeEnough(a, b) {
    return Math.abs((a ?? 0) - (b ?? 0)) <= EPSILON;
}

function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

async function getRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) throw new Error(`rate fetch failed: ${res.status}`);
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

function appendMoveNote(baseNotes) {
    const base = typeof baseNotes === 'string' ? baseNotes.trim() : '';
    const suffix = 'Moved excess to Mar 14 – Mar 20';
    return base ? `${base} · ${suffix}` : suffix;
}

async function main() {
    const [accSnap, txnSnap, rates] = await Promise.all([
        db.collection(`users/${USER_ID}/accounts`).get(),
        db.collection(`users/${USER_ID}/transactions`).get(),
        getRates(),
    ]);

    const accountCurrency = new Map();
    for (const d of accSnap.docs) {
        const a = d.data();
        accountCurrency.set(d.id, a.currency ?? 'OMR');
    }

    const txns = txnSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const sourceSaving = txns
        .filter((t) => {
            if (t.bucket !== 'saving') return false;
            const date = t.date?.toDate?.();
            if (!(date instanceof Date)) return false;
            return date >= SOURCE_WEEK_START && date <= SOURCE_WEEK_END;
        })
        .map((t) => {
            const currency = accountCurrency.get(t.accountId) ?? 'OMR';
            const amount = t.amount ?? 0;
            const amountOmr = convert(amount, currency, 'OMR', rates);
            return { ...t, currency, amountOmr, dateObj: t.date.toDate() };
        });

    const sourceTotalOmr = sourceSaving.reduce((s, t) => s + t.amountOmr, 0);
    const excessOmr = sourceTotalOmr - TARGET_OMR;

    console.log(`Apr 4 – Apr 10 total (OMR): ${sourceTotalOmr.toFixed(3)}`);
    console.log(`Target (OMR): ${TARGET_OMR.toFixed(3)}`);
    console.log(`Excess to move (OMR): ${excessOmr.toFixed(3)}`);

    if (excessOmr <= EPSILON) {
        console.log('No excess found above 385 OMR. Nothing changed.');
        return;
    }

    const movable = sourceSaving
        .filter((t) => t.amount > EPSILON && t.amountOmr > EPSILON)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    if (movable.length === 0) {
        throw new Error('Found excess but no positive saving transactions to move.');
    }

    const batch = db.batch();
    const txnRef = db.collection(`users/${USER_ID}/transactions`);
    let remainingOmr = excessOmr;
    let movedOmr = 0;

    for (const s of movable) {
        if (remainingOmr <= EPSILON) break;

        const moveOmr = Math.min(remainingOmr, s.amountOmr);
        const moveInAccount = convert(moveOmr, 'OMR', s.currency, rates);
        const isFull = closeEnough(moveInAccount, s.amount);

        console.log(`Processing saving txn ${s.id}: move ${moveOmr.toFixed(3)} OMR (${moveInAccount.toFixed(3)} ${s.currency})`);

        if (isFull) {
            batch.update(txnRef.doc(s.id), {
                date: Timestamp.fromDate(TARGET_WEEK_DATE),
                notes: appendMoveNote(s.notes),
            });
        } else {
            batch.update(txnRef.doc(s.id), {
                amount: s.amount - moveInAccount,
            });
            const newSaving = txnRef.doc();
            batch.set(newSaving, {
                accountId: s.accountId,
                amount: moveInAccount,
                bucket: 'saving',
                date: Timestamp.fromDate(TARGET_WEEK_DATE),
                notes: appendMoveNote(s.notes),
                createdAt: Timestamp.now(),
            });
        }

        const depositMatch = txns
            .filter((t) => {
                if (t.bucket !== 'deposit') return false;
                if (t.accountId !== s.accountId) return false;
                const d = t.date?.toDate?.();
                if (!(d instanceof Date)) return false;
                if (!sameLocalDay(d, s.dateObj)) return false;
                return closeEnough(t.amount ?? 0, -s.amount);
            })
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0];

        if (depositMatch) {
            if (isFull) {
                batch.update(txnRef.doc(depositMatch.id), {
                    date: Timestamp.fromDate(TARGET_WEEK_DATE),
                    notes: appendMoveNote(depositMatch.notes),
                });
            } else {
                batch.update(txnRef.doc(depositMatch.id), {
                    amount: (depositMatch.amount ?? 0) + moveInAccount,
                });
                const newDeposit = txnRef.doc();
                batch.set(newDeposit, {
                    accountId: depositMatch.accountId,
                    amount: -moveInAccount,
                    bucket: 'deposit',
                    date: Timestamp.fromDate(TARGET_WEEK_DATE),
                    notes: appendMoveNote(depositMatch.notes),
                    createdAt: Timestamp.now(),
                });
            }
        }

        remainingOmr -= moveOmr;
        movedOmr += moveOmr;
    }

    if (movedOmr <= EPSILON) {
        console.log('No movable amount found. Nothing changed.');
        return;
    }

    await batch.commit();
    console.log(`Done. Moved ${movedOmr.toFixed(3)} OMR from Apr 4 – Apr 10 to Mar 14 – Mar 20.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
