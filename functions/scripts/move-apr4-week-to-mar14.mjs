import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

// Saturday -> Friday week
const SOURCE_WEEK_START = new Date(2026, 3, 4, 0, 0, 0, 0);      // Apr 4, 2026
const SOURCE_WEEK_END = new Date(2026, 3, 10, 23, 59, 59, 999);   // Apr 10, 2026
const TARGET_WEEK_DATE = new Date(2026, 2, 20, 12, 0, 0, 0);      // Mar 20, 2026 (inside Mar 14–Mar 20)
const MOVE_NOTE = 'Moved to Mar 14 – Mar 20';

function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function withMoveNote(notes) {
    const base = typeof notes === 'string' ? notes.trim() : '';
    if (base.includes(MOVE_NOTE)) return base;
    return base ? `${base} · ${MOVE_NOTE}` : MOVE_NOTE;
}

async function main() {
    const txnRef = db.collection(`users/${USER_ID}/transactions`);
    const snap = await txnRef.get();
    const txns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const sourceSaving = txns
        .filter((t) => {
            if (t.bucket !== 'saving') return false;
            const date = t.date?.toDate?.();
            if (!(date instanceof Date)) return false;
            return date >= SOURCE_WEEK_START && date <= SOURCE_WEEK_END;
        })
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    if (sourceSaving.length === 0) {
        console.log('No saving transactions found in Apr 4 – Apr 10. Nothing to move.');
        return;
    }

    let movedCount = 0;
    const batch = db.batch();

    for (const s of sourceSaving) {
        const sDate = s.date.toDate();
        console.log(`Moving saving ${s.id}: ${s.amount} on ${sDate.toISOString().slice(0, 10)}`);
        batch.update(txnRef.doc(s.id), {
            date: Timestamp.fromDate(TARGET_WEEK_DATE),
            notes: withMoveNote(s.notes),
        });
        movedCount++;

        // Move matching deposit transfer (if found) to keep transfer pair aligned.
        const matchDeposit = txns
            .filter((t) => {
                if (t.bucket !== 'deposit') return false;
                if (t.accountId !== s.accountId) return false;
                if ((t.amount ?? 0) !== -(s.amount ?? 0)) return false;
                const d = t.date?.toDate?.();
                if (!(d instanceof Date)) return false;
                return sameLocalDay(d, sDate);
            })
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0];

        if (matchDeposit) {
            const dDate = matchDeposit.date.toDate();
            console.log(`Moving deposit ${matchDeposit.id}: ${matchDeposit.amount} on ${dDate.toISOString().slice(0, 10)}`);
            batch.update(txnRef.doc(matchDeposit.id), {
                date: Timestamp.fromDate(TARGET_WEEK_DATE),
                notes: withMoveNote(matchDeposit.notes),
            });
        } else {
            console.log(`No matching deposit pair found for saving ${s.id}.`);
        }
    }

    await batch.commit();
    console.log(`Done. Moved ${movedCount} saving transaction(s) from Apr 4 – Apr 10 to Mar 14 – Mar 20.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
