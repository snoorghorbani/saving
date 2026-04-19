import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const UID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    // Get live OMR rate
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    const rates = data.rates;
    const omrRate = rates.OMR;
    console.log(`Live rate: 1 USD = ${omrRate} OMR`);

    function toOMR(amount, currency) {
        if (currency === 'OMR') return amount;
        // amount in currency → USD → OMR
        const fromRate = rates[currency] ?? 1;
        return (amount / fromRate) * omrRate;
    }

    // Income
    const incomeSnap = await db.collection(`users/${UID}/settings`).doc('income').get();
    const income = incomeSnap.data();
    const totalIncome = income.weeklyAmount * income.weeksReceived;

    // Accounts
    const accSnap = await db.collection(`users/${UID}/accounts`).get();
    const accounts = {};
    accSnap.docs.forEach(d => { accounts[d.id] = d.data(); });

    // ALL expense entries
    const entrySnap = await db.collection(`users/${UID}/expenseEntries`).get();
    let totalExpenses = 0;
    for (const d of entrySnap.docs) {
        const e = d.data();
        if (e.type === 'set-aside') continue;
        totalExpenses += e.amount;
    }

    // ALL transactions
    const txnSnap = await db.collection(`users/${UID}/transactions`).get();
    let savingOMR = 0;
    let depositOMR = 0;

    console.log('\n=== All Transactions (with live OMR conversion) ===');
    const txns = txnSnap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() }));
    txns.sort((a, b) => a.date - b.date);

    for (const t of txns) {
        const acc = accounts[t.accountId];
        const currency = acc?.currency ?? 'OMR';
        const bucket = t.bucket ?? 'saving';
        const inOMR = toOMR(t.amount, currency);

        if (bucket === 'saving') savingOMR += inOMR;
        else depositOMR += inOMR;

        console.log(`  ${t.date?.toISOString().slice(0, 10)} | ${t.amount} ${currency} → ${inOMR.toFixed(3)} OMR | bucket=${bucket} | ${acc?.name} | ${t.notes || ''}`);
    }

    console.log('\n=== UNTRACKED CALCULATION ===');
    console.log(`  Income:       ${totalIncome.toFixed(3)} OMR`);
    console.log(`  - Expenses:   ${totalExpenses.toFixed(3)} OMR`);
    console.log(`  - Savings:    ${savingOMR.toFixed(3)} OMR`);
    console.log(`  - Deposits:   ${depositOMR.toFixed(3)} OMR`);
    console.log(`  ─────────────────────────`);
    console.log(`  = Untracked:  ${(totalIncome - totalExpenses - savingOMR - depositOMR).toFixed(3)} OMR`);

    // Breakdown of where income went
    console.log('\n=== WHERE DID THE INCOME GO? ===');
    console.log(`  Total Income:               ${totalIncome.toFixed(3)} OMR`);
    console.log(`  Logged Expenses (non-sa):   ${totalExpenses.toFixed(3)} OMR`);

    // Net savings (what's in saving bucket)
    console.log(`  In Saving accounts:         ${savingOMR.toFixed(3)} OMR`);

    // Net deposit (what's still in deposit after all withdrawals)
    console.log(`  In Deposit accounts:        ${depositOMR.toFixed(3)} OMR`);

    const tracked = totalExpenses + savingOMR + depositOMR;
    console.log(`  Total tracked:              ${tracked.toFixed(3)} OMR`);
    console.log(`  Unaccounted (untracked):    ${(totalIncome - tracked).toFixed(3)} OMR`);

    // Note about double counting
    console.log('\n=== IMPORTANT NOTE ===');
    console.log('Deposit withdrawals for expenses are already negative in deposit total.');
    console.log('So an expense paid from deposit: +expense AND -deposit → they do NOT cancel.');
    console.log('An expense paid from CASH: +expense only, no deposit change.');
    console.log('Both reduce untracked the same way.');

    // Show savings detail
    console.log('\n=== SAVING ENTRIES DETAIL ===');
    for (const t of txns) {
        const bucket = t.bucket ?? 'saving';
        if (bucket !== 'saving') continue;
        const acc = accounts[t.accountId];
        const currency = acc?.currency ?? 'OMR';
        const inOMR = toOMR(t.amount, currency);
        console.log(`  ${t.id} | ${t.date?.toISOString().slice(0, 10)} | ${t.amount} ${currency} = ${inOMR.toFixed(3)} OMR | ${acc?.name} | ${t.notes || ''}`);
    }
}

main().catch(console.error);
