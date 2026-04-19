import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    // Get all expenses to find Groceries
    const expSnap = await db.collection(`users/${USER_ID}/expenses`).get();
    for (const d of expSnap.docs) {
        const data = d.data();
        if (data.weeklyBudget) {
            console.log(`Expense: ${d.id} - ${data.name} (budget: ${data.weeklyBudget}/wk)`);
        }
    }

    // Get all expense entries
    const entrySnap = await db.collection(`users/${USER_ID}/expenseEntries`).get();
    const entries = entrySnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate?.() ?? new Date(),
    }));
    entries.sort((a, b) => a.date - b.date);

    // Last week: Apr 4 – Apr 10 (Saturday to Friday)
    const lastWeekStart = new Date(2026, 3, 4, 0, 0, 0, 0);
    const lastWeekEnd = new Date(2026, 3, 10, 23, 59, 59, 999);

    console.log(`\nAll entries in last week (Apr 4-10):`);
    for (const e of entries) {
        if (e.date >= lastWeekStart && e.date <= lastWeekEnd) {
            console.log(`  ${e.id}: expenseId=${e.expenseId}, amount=${e.amount}, type=${e.type || 'undefined'}, date=${e.date.toISOString()}, notes=${e.notes || ''}`);
        }
    }

    console.log(`\nAll entries in this week (Apr 11+):`);
    const thisWeekStart = new Date(2026, 3, 11, 0, 0, 0, 0);
    for (const e of entries) {
        if (e.date >= thisWeekStart) {
            console.log(`  ${e.id}: expenseId=${e.expenseId}, amount=${e.amount}, type=${e.type || 'undefined'}, date=${e.date.toISOString()}, notes=${e.notes || ''}`);
        }
    }
}

main().catch(console.error);
