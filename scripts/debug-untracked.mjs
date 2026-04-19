import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const UID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    // 1. Income
    const incomeSnap = await db.collection(`users/${UID}/settings`).doc('income').get();
    const income = incomeSnap.data();
    const totalIncome = income ? income.weeklyAmount * income.weeksReceived : 0;
    console.log(`=== Income ===`);
    console.log(`  weeklyAmount: ${income?.weeklyAmount}, weeksReceived: ${income?.weeksReceived}`);
    console.log(`  Total Income: ${totalIncome}`);

    // 2. Expense entries (excluding set-asides)
    const entrySnap = await db.collection(`users/${UID}/expenseEntries`).get();
    let totalExpenses = 0;
    let totalSetAside = 0;
    const entries = [];
    for (const d of entrySnap.docs) {
        const data = d.data();
        const date = data.date?.toDate();
        if (data.type === 'set-aside') {
            totalSetAside += data.amount;
        } else {
            totalExpenses += data.amount;
            entries.push({ id: d.id, amount: data.amount, type: data.type, date, notes: data.notes, expenseId: data.expenseId });
        }
    }
    console.log(`\n=== Expense Entries ===`);
    console.log(`  Total (excl set-aside): ${totalExpenses.toFixed(3)} OMR (${entrySnap.docs.length - 0} entries)`);
    console.log(`  Total set-aside: ${totalSetAside.toFixed(3)} OMR`);

    // 3. Transactions (for deposit and saving totals)
    const accSnap = await db.collection(`users/${UID}/accounts`).get();
    const accounts = {};
    accSnap.docs.forEach(d => { accounts[d.id] = d.data(); });

    const txnSnap = await db.collection(`users/${UID}/transactions`).get();
    let depositOMR = 0;
    let savingOMR = 0;
    const OMR_RATE = 0.385; // fallback USD->OMR

    // We need real rates. Let's approximate with the fallback
    // USD/OMR: 1 USD = 0.385 OMR, so amount_in_usd * 0.385 = OMR
    for (const d of txnSnap.docs) {
        const data = d.data();
        const acc = accounts[data.accountId];
        const currency = acc?.currency ?? 'OMR';
        const amount = data.amount;
        const bucket = data.bucket ?? 'saving';

        // Convert to OMR
        let inOMR;
        if (currency === 'OMR') {
            inOMR = amount;
        } else if (currency === 'USD') {
            inOMR = amount * OMR_RATE;
        } else {
            inOMR = amount; // fallback
        }

        if (bucket === 'deposit') {
            depositOMR += inOMR;
        } else {
            savingOMR += inOMR;
        }
    }

    console.log(`\n=== Transactions (converted to OMR, rate: 1 USD = ${OMR_RATE} OMR) ===`);
    console.log(`  Total Deposit (OMR): ${depositOMR.toFixed(3)}`);
    console.log(`  Total Saving (OMR): ${savingOMR.toFixed(3)}`);

    // 4. Untracked
    const untracked = totalIncome - totalExpenses - savingOMR - depositOMR;
    console.log(`\n=== Untracked ===`);
    console.log(`  ${totalIncome} - ${totalExpenses.toFixed(3)} - ${savingOMR.toFixed(3)} - ${depositOMR.toFixed(3)} = ${untracked.toFixed(3)}`);

    // 5. Detail all transactions
    console.log(`\n=== All Transactions ===`);
    const txns = txnSnap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() }));
    txns.sort((a, b) => a.date - b.date);
    for (const t of txns) {
        const acc = accounts[t.accountId];
        const currency = acc?.currency ?? 'OMR';
        const bucket = t.bucket ?? 'saving';
        console.log(`  ${t.id}: ${t.amount} ${currency} | bucket=${bucket} | ${t.date?.toISOString()} | ${acc?.name} | ${t.notes || ''}`);
    }

    // 6. Detail all expense entries (non set-aside)
    console.log(`\n=== All Expense Entries (non set-aside) ===`);
    entries.sort((a, b) => a.date - b.date);
    for (const e of entries) {
        console.log(`  ${e.id}: ${e.amount} OMR | ${e.date?.toISOString()} | expId=${e.expenseId} | ${e.notes || ''}`);
    }

    // 7. Look for duplicate or suspicious data
    console.log(`\n=== Potential Issues ===`);

    // Check if expense entries reference missing expenses
    const expSnap = await db.collection(`users/${UID}/expenses`).get();
    const expenseIds = new Set(expSnap.docs.map(d => d.id));
    for (const e of entries) {
        if (!expenseIds.has(e.expenseId)) {
            console.log(`  ORPHAN ENTRY: ${e.id} references missing expense ${e.expenseId} (${e.amount} OMR)`);
        }
    }

    // Check for deposit transactions that look like duplicates of expense entries
    // (both reduce balance - double counting?)
    console.log('\n  Expense-linked deposit withdrawals:');
    for (const t of txns) {
        if (t.notes && t.notes.includes('[entry:')) {
            const acc = accounts[t.accountId];
            console.log(`  ${t.id}: ${t.amount} ${acc?.currency} | ${t.notes}`);
        }
    }
}

main().catch(console.error);
