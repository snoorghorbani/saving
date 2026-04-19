import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const UID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const GROCERY_ID = 'AuARNPtf9976SK2pzxVw';

async function main() {
    const snap = await db.collection(`users/${UID}/expenseEntries`)
        .where('expenseId', '==', GROCERY_ID)
        .get();

    const start = new Date(2026, 3, 4, 0, 0, 0, 0);
    const end = new Date(2026, 3, 10, 23, 59, 59, 999);

    let lastWeekTotal = 0;
    console.log('Groceries entries in last week (Apr 4 - Apr 10):');
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() }));
    entries.sort((a, b) => a.date - b.date);

    for (const e of entries) {
        if (e.date >= start && e.date <= end) {
            lastWeekTotal += e.amount;
            console.log(`  ${e.date.toISOString()} | ${e.amount} OMR | ${e.type || 'purchase'} | ${e.notes || '(no notes)'}`);
        }
    }
    console.log(`\nTotal in last week: ${lastWeekTotal.toFixed(3)} OMR`);
    console.log(`Budget: 25.000/wk`);
    console.log(`Carryover: ${(25 - lastWeekTotal).toFixed(3)} OMR`);
}

main().catch(console.error);
