// One-time: create negative deposit transactions for all existing SMS expense entries
// that don't already have a matching SMS deduction transaction.
// Run from functions/ dir: cd functions && GOOGLE_APPLICATION_CREDENTIALS="" node ../scripts/backfill-sms-deductions.mjs
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const userId = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function run() {
    // 1. Get the SMS account setting
    const smsDoc = await db.doc(`users/${userId}/settings/smsApiKey`).get();
    const accountId = smsDoc.exists ? smsDoc.data().accountId : null;
    if (!accountId) {
        console.log('No SMS accountId set. Go to Dashboard > SMS Setup and select Dhofar, then re-run.');
        process.exit(1);
    }
    console.log('SMS deduct account:', accountId);

    // 2. Find the SMS Expenses expense doc
    const expSnap = await db.collection(`users/${userId}/expenses`)
        .where('name', '==', 'SMS Expenses').limit(1).get();
    if (expSnap.empty) {
        console.log('No "SMS Expenses" expense found. Nothing to back-fill.');
        return;
    }
    const smsExpenseId = expSnap.docs[0].id;
    console.log('SMS Expenses doc:', smsExpenseId);

    // 3. Get all SMS expense entries
    const entriesSnap = await db.collection(`users/${userId}/expenseEntries`)
        .where('expenseId', '==', smsExpenseId).get();
    console.log(`Found ${entriesSnap.size} SMS expense entries`);

    // 4. Get existing SMS deduction transactions to avoid duplicates
    const txnSnap = await db.collection(`users/${userId}/transactions`)
        .where('notes', '>=', 'SMS:')
        .where('notes', '<=', 'SMS:\uf8ff')
        .get();
    // Build a set of existing deductions by amount+date for dedup
    const existingDeductions = new Set();
    txnSnap.docs.forEach((d) => {
        const data = d.data();
        const dateKey = data.date?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? '';
        existingDeductions.add(`${Math.abs(data.amount)}_${dateKey}`);
    });
    console.log(`Found ${txnSnap.size} existing SMS deduction transactions`);

    // 5. Create missing deductions
    const batch = db.batch();
    let count = 0;
    for (const doc of entriesSnap.docs) {
        const entry = doc.data();
        const entryDate = entry.date?.toDate?.() ?? new Date();
        const dateKey = entryDate.toISOString().slice(0, 10);
        const key = `${entry.amount}_${dateKey}`;

        if (existingDeductions.has(key)) {
            console.log(`  Skip (exists): ${entry.amount} on ${dateKey}`);
            continue;
        }

        const ref = db.collection(`users/${userId}/transactions`).doc();
        batch.set(ref, {
            accountId,
            amount: -entry.amount,
            bucket: 'deposit',
            date: entry.date,
            notes: entry.notes?.includes('(SMS)')
                ? `SMS: ${entry.notes.replace(' (SMS)', '')}`
                : `SMS expense`,
            createdAt: Timestamp.now(),
        });
        count++;
        console.log(`  Add: -${entry.amount} on ${dateKey} — ${entry.notes}`);
    }

    if (count > 0) {
        await batch.commit();
        console.log(`\nCreated ${count} deduction transactions on account ${accountId}`);
    } else {
        console.log('\nAll SMS entries already have matching deductions. Nothing to do.');
    }
}

run().catch(console.error);
