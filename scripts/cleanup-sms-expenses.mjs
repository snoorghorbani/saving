import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const UID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    const expensesRef = db.collection(`users/${UID}/expenses`);
    const entriesRef = db.collection(`users/${UID}/expenseEntries`);

    // 1. Find or create the single "SMS Expenses" expense
    let smsExpenseId;
    const smsSnap = await expensesRef.where('name', '==', 'SMS Expenses').limit(1).get();
    if (!smsSnap.empty) {
        smsExpenseId = smsSnap.docs[0].id;
        console.log(`Found "SMS Expenses" → ${smsExpenseId}`);
    } else {
        const newExp = await expensesRef.add({
            kind: 'one-time',
            name: 'SMS Expenses',
            amount: 0,
            frequency: 'one-time',
            category: 'Other',
            isUnexpected: false,
            weeklyBudget: null,
            dueDay: null,
            dueDate: null,
            estimatedTotal: null,
            deadline: null,
            notes: 'Auto-created for SMS-parsed expenses',
            createdAt: Timestamp.now(),
        });
        smsExpenseId = newExp.id;
        console.log(`Created "SMS Expenses" → ${smsExpenseId}`);
    }

    // 2. Find all per-merchant SMS expenses (notes = "Auto-created from SMS")
    const allExpenses = await expensesRef.get();
    const orphanExpenses = allExpenses.docs.filter(d => {
        const data = d.data();
        return data.notes === 'Auto-created from SMS' && d.id !== smsExpenseId;
    });

    console.log(`Found ${orphanExpenses.length} orphan per-merchant expenses to clean up:`);
    orphanExpenses.forEach(d => console.log(`  - ${d.data().name} (${d.id})`));

    // 3. Reassign entries from orphan expenses to the single "SMS Expenses"
    let reassigned = 0;
    for (const orphan of orphanExpenses) {
        const orphanEntries = await entriesRef.where('expenseId', '==', orphan.id).get();
        for (const entry of orphanEntries.docs) {
            await entry.ref.update({ expenseId: smsExpenseId });
            reassigned++;
            console.log(`  Reassigned entry ${entry.id} from "${orphan.data().name}" → SMS Expenses`);
        }
    }
    console.log(`Reassigned ${reassigned} entries.`);

    // 4. Delete orphan expenses
    for (const orphan of orphanExpenses) {
        await orphan.ref.delete();
        console.log(`  Deleted expense "${orphan.data().name}" (${orphan.id})`);
    }
    console.log(`Deleted ${orphanExpenses.length} orphan expenses.`);

    // 5. Also delete any duplicate transaction entries created by manual "Pay" clicks on orphan expenses
    // These are transactions with notes like "Expense: MERCHANT_NAME [entry:...]"
    // that correspond to entries we just reassigned — they are fine, no action needed
    // since the transaction amounts are real withdrawals the user made.

    console.log('\nDone! All SMS entries now point to the single "SMS Expenses" expense.');
}

main().catch(console.error);
