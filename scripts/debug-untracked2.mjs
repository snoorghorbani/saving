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
    console.log(`=== INCOME ===`);
    console.log(`  ${income?.weeklyAmount} × ${income?.weeksReceived} weeks = ${totalIncome} OMR\n`);

    // 2. Accounts
    const accSnap = await db.collection(`users/${UID}/accounts`).get();
    const accounts = {};
    accSnap.docs.forEach(d => { accounts[d.id] = { id: d.id, ...d.data() }; });

    // 3. All expenses
    const expSnap = await db.collection(`users/${UID}/expenses`).get();
    const expenses = {};
    expSnap.docs.forEach(d => { expenses[d.id] = { id: d.id, ...d.data() }; });

    // 4. All expense entries
    const entrySnap = await db.collection(`users/${UID}/expenseEntries`).get();
    const entries = entrySnap.docs.map(d => ({
        id: d.id, ...d.data(),
        date: d.data().date?.toDate(),
    }));

    console.log(`=== EXPENSE ENTRIES (excl set-aside) ===`);
    let totalExpenses = 0;
    const byExpense = {};
    for (const e of entries) {
        if (e.type === 'set-aside') continue;
        totalExpenses += e.amount;
        const exp = expenses[e.expenseId];
        const name = exp?.name || `UNKNOWN(${e.expenseId})`;
        if (!byExpense[name]) byExpense[name] = { total: 0, entries: [] };
        byExpense[name].total += e.amount;
        byExpense[name].entries.push(e);
    }
    for (const [name, data] of Object.entries(byExpense).sort((a, b) => b[1].total - a[1].total)) {
        console.log(`  ${name}: ${data.total.toFixed(3)} OMR (${data.entries.length} entries)`);
        for (const e of data.entries.sort((a, b) => a.date - b.date)) {
            const hasLink = e.accountId ? '✓ linked' : '✗ no deposit link';
            console.log(`    ${e.date?.toISOString().slice(0, 10)} | ${e.amount} OMR | ${e.notes || '(no notes)'} | ${hasLink}`);
        }
    }
    console.log(`  TOTAL EXPENSES: ${totalExpenses.toFixed(3)} OMR\n`);

    // 5. All transactions by bucket
    const txnSnap = await db.collection(`users/${UID}/transactions`).get();
    const txns = txnSnap.docs.map(d => ({
        id: d.id, ...d.data(),
        date: d.data().date?.toDate(),
    }));
    txns.sort((a, b) => a.date - b.date);

    console.log(`=== SAVING BUCKET TRANSACTIONS ===`);
    let savingTotal = 0;
    for (const t of txns) {
        const bucket = t.bucket ?? 'saving';
        if (bucket !== 'saving') continue;
        const acc = accounts[t.accountId];
        const cur = acc?.currency ?? 'OMR';
        console.log(`  ${t.date?.toISOString().slice(0, 10)} | ${t.amount} ${cur} | ${acc?.name} | ${t.notes || ''}`);
        savingTotal += t.amount * (cur === 'OMR' ? 1 : 0.385);
    }
    console.log(`  TOTAL SAVING (approx OMR @0.385): ${savingTotal.toFixed(3)} OMR\n`);

    console.log(`=== DEPOSIT BUCKET TRANSACTIONS ===`);
    let depositTotal = 0;
    let depositIn = 0;
    let depositTransfers = 0;
    let depositExpenseOut = 0;
    for (const t of txns) {
        const bucket = t.bucket ?? 'saving';
        if (bucket !== 'deposit') continue;
        const acc = accounts[t.accountId];
        const cur = acc?.currency ?? 'OMR';
        const omr = t.amount * (cur === 'OMR' ? 1 : 0.385);
        depositTotal += omr;
        const isTransfer = (t.notes || '').includes('Transfer:');
        const isExpense = (t.notes || '').includes('Expense:');
        if (t.amount > 0) depositIn += omr;
        else if (isTransfer) depositTransfers += omr;
        else if (isExpense) depositExpenseOut += omr;
        console.log(`  ${t.date?.toISOString().slice(0, 10)} | ${t.amount} ${cur} (${omr.toFixed(3)} OMR) | ${acc?.name} | ${t.notes || ''}`);
    }
    console.log(`  Deposits in: ${depositIn.toFixed(3)} OMR`);
    console.log(`  Saving transfers: ${depositTransfers.toFixed(3)} OMR`);
    console.log(`  Expense withdrawals: ${depositExpenseOut.toFixed(3)} OMR`);
    console.log(`  NET DEPOSIT (approx OMR): ${depositTotal.toFixed(3)} OMR\n`);

    // 6. The formula
    console.log(`=== UNTRACKED FORMULA ===`);
    console.log(`  Income:    ${totalIncome.toFixed(3)}`);
    console.log(`  Expenses: -${totalExpenses.toFixed(3)}`);
    console.log(`  Savings:  -${savingTotal.toFixed(3)}`);
    console.log(`  Deposits: -${depositTotal.toFixed(3)}`);
    console.log(`  ─────────────────────`);
    console.log(`  Untracked: ${(totalIncome - totalExpenses - savingTotal - depositTotal).toFixed(3)} OMR`);

    // 7. Check for issues
    console.log(`\n=== POTENTIAL ISSUES ===`);

    // Entries without deposit links
    const unlinkedTotal = entries.filter(e => e.type !== 'set-aside' && !e.accountId).reduce((s, e) => s + e.amount, 0);
    console.log(`  Expense entries WITHOUT deposit account link: ${unlinkedTotal.toFixed(3)} OMR`);
    console.log(`  (These expenses reduce untracked but didn't withdraw from any account)`);

    // Check for orphan entries
    for (const e of entries) {
        if (!expenses[e.expenseId]) {
            console.log(`  ⚠ ORPHAN: entry ${e.id} (${e.amount} OMR) references missing expense ${e.expenseId}`);
        }
    }

    // Check for possible duplicate transactions
    console.log(`\n  Checking for duplicate-looking transactions...`);
    for (let i = 0; i < txns.length; i++) {
        for (let j = i + 1; j < txns.length; j++) {
            const a = txns[i], b = txns[j];
            if (a.amount === b.amount && a.accountId === b.accountId && a.bucket === b.bucket &&
                Math.abs(a.date - b.date) < 60000) {
                console.log(`  ⚠ POSSIBLE DUP: ${a.id} and ${b.id} (${a.amount}, same account/bucket, <1min apart)`);
            }
        }
    }
}

main().catch(console.error);
