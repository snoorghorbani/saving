import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const FULL_AMOUNT = 770;
const SPLIT_AMOUNT = 385;
const EPSILON = 0.001;

const CURRENT_WEEK_START = new Date(2026, 3, 18, 0, 0, 0, 0); // Apr 18, 2026
const CURRENT_WEEK_END = new Date(2026, 3, 24, 23, 59, 59, 999); // Apr 24, 2026
const DEBT_WEEK_DATE = new Date(2026, 3, 17, 12, 0, 0, 0); // Apr 17, 2026 noon
const DEBT_NOTE = 'Debt fill: Apr 11 – Apr 17';

function closeEnough(a, b) {
    return Math.abs((a ?? 0) - b) <= EPSILON;
}

function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

async function main() {
    const txnRef = db.collection(`users/${USER_ID}/transactions`);
    const snapshot = await txnRef.get();
    const txns = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));

    const alreadySplit = txns.some((t) => (
        t.bucket === 'saving'
        && closeEnough(t.amount, SPLIT_AMOUNT)
        && typeof t.notes === 'string'
        && t.notes.includes(DEBT_NOTE)
    ));
    if (alreadySplit) {
        console.log('Backfill already applied. No changes made.');
        return;
    }

    const savingCandidates = txns
        .filter((t) => {
            const dt = t.date?.toDate?.();
            return t.bucket === 'saving'
                && closeEnough(t.amount, FULL_AMOUNT)
                && dt instanceof Date
                && dt >= CURRENT_WEEK_START
                && dt <= CURRENT_WEEK_END;
        })
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    if (savingCandidates.length === 0) {
        throw new Error('No saving transaction of 770 found in Apr 18 – Apr 24 week.');
    }

    const sourceSaving = savingCandidates[0];
    const sourceSavingDate = sourceSaving.date.toDate();
    const sourceNotes = typeof sourceSaving.notes === 'string' ? sourceSaving.notes : '';
    const debtNotes = [sourceNotes, DEBT_NOTE].filter(Boolean).join(' · ');

    const batch = db.batch();

    console.log(`Updating saving txn ${sourceSaving.id}: 770 -> 385 (current week).`);
    batch.update(txnRef.doc(sourceSaving.id), { amount: SPLIT_AMOUNT });

    const debtSavingRef = txnRef.doc();
    console.log(`Creating saving debt txn ${debtSavingRef.id}: +385 on Apr 17.`);
    batch.set(debtSavingRef, {
        accountId: sourceSaving.accountId,
        amount: SPLIT_AMOUNT,
        bucket: 'saving',
        date: Timestamp.fromDate(DEBT_WEEK_DATE),
        notes: debtNotes,
        createdAt: Timestamp.now(),
    });

    const depositMatches = txns
        .filter((t) => {
            const dt = t.date?.toDate?.();
            return t.bucket === 'deposit'
                && t.accountId === sourceSaving.accountId
                && closeEnough(t.amount, -FULL_AMOUNT)
                && typeof t.notes === 'string'
                && t.notes === sourceNotes
                && dt instanceof Date
                && sameLocalDay(dt, sourceSavingDate);
        })
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    const matchingDeposit = depositMatches[0];
    if (matchingDeposit) {
        console.log(`Updating matching deposit txn ${matchingDeposit.id}: -770 -> -385.`);
        batch.update(txnRef.doc(matchingDeposit.id), { amount: -SPLIT_AMOUNT });

        const debtDepositRef = txnRef.doc();
        console.log(`Creating matching deposit debt txn ${debtDepositRef.id}: -385 on Apr 17.`);
        batch.set(debtDepositRef, {
            accountId: matchingDeposit.accountId,
            amount: -SPLIT_AMOUNT,
            bucket: 'deposit',
            date: Timestamp.fromDate(DEBT_WEEK_DATE),
            notes: debtNotes,
            createdAt: Timestamp.now(),
        });
    } else {
        console.log('No matching deposit transfer txn found. Only saving side will be split.');
    }

    await batch.commit();
    console.log('Done. Split applied: 385 to Apr 11–Apr 17, 385 stays in current week.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
