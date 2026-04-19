import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const UID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    // 1. Check for existing Rent expense
    const expSnap = await db.collection(`users/${UID}/expenses`).get();
    let rentExpId = null;
    for (const doc of expSnap.docs) {
        const d = doc.data();
        if (d.category === 'Rent' || d.name?.toLowerCase().includes('rent')) {
            console.log('Found rent expense:', doc.id, d.name, d.kind, d.amount, d.category);
            rentExpId = doc.id;
        }
    }

    // 2. If no rent expense exists, create one
    if (!rentExpId) {
        console.log('No rent expense found. Creating one...');
        const ref = await db.collection(`users/${UID}/expenses`).add({
            kind: 'fixed-payment',
            name: 'Rent',
            amount: 230,
            frequency: 'monthly',
            category: 'Rent',
            isUnexpected: false,
            weeklyBudget: null,
            dueDay: 11,
            dueDate: null,
            estimatedTotal: null,
            deadline: null,
            notes: 'Monthly rent 11th to 11th',
            createdAt: Timestamp.now(),
        });
        rentExpId = ref.id;
        console.log('Created rent expense:', rentExpId);
    }

    // 3. Add 230 OMR entry for Mar 11 – Apr 11 period
    const entryDate = new Date(2026, 2, 11); // March 11, 2026
    const entryRef = await db.collection(`users/${UID}/expenseEntries`).add({
        expenseId: rentExpId,
        amount: 230,
        date: Timestamp.fromDate(entryDate),
        notes: 'Rent: Mar 11 – Apr 11, 2026',
        type: 'purchase',
        createdAt: Timestamp.now(),
    });
    console.log('Added entry:', entryRef.id, '230 OMR on', entryDate.toDateString());
    console.log('Done.');
}

main().catch(console.error);
