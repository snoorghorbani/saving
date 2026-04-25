import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const TXN_ID = 'RovBMzQubGH2808vn4Mo';
const TARGET_OMR = 385;
const FALLBACK_RATES = { USD: 1, OMR: 0.385, EUR: 0.92, TRY: 32.5, GBP: 0.79, AED: 3.67, SAR: 3.75, INR: 83.5 };

async function getRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) throw new Error(`rates status=${res.status}`);
        const data = await res.json();
        return data?.rates ?? FALLBACK_RATES;
    } catch {
        return FALLBACK_RATES;
    }
}

async function main() {
    const [accSnap, rates] = await Promise.all([
        db.collection(`users/${USER_ID}/accounts`).get(),
        getRates(),
    ]);

    const accountMap = new Map();
    for (const d of accSnap.docs) accountMap.set(d.id, d.data());

    const txnRef = db.doc(`users/${USER_ID}/transactions/${TXN_ID}`);
    const txnSnap = await txnRef.get();
    if (!txnSnap.exists) throw new Error(`Transaction ${TXN_ID} not found`);
    const txn = txnSnap.data();

    const account = accountMap.get(txn.accountId);
    const currency = account?.currency ?? 'OMR';
    if (currency !== 'USD') {
        throw new Error(`Expected USD transaction, found ${currency}`);
    }

    const usdToOmr = (rates.OMR ?? FALLBACK_RATES.OMR) / (rates.USD ?? FALLBACK_RATES.USD);
    const newAmount = TARGET_OMR / usdToOmr;
    const roundedAmount = Math.round(newAmount * 1e6) / 1e6;

    console.log(`Using USD->OMR rate: ${usdToOmr}`);
    console.log(`Old amount: ${txn.amount} USD`);
    console.log(`New amount target: ${roundedAmount} USD`);
    console.log(`Projected OMR: ${(roundedAmount * usdToOmr).toFixed(6)}`);

    await txnRef.update({
        amount: roundedAmount,
        bucket: 'saving',
    });

    console.log('Updated successfully.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
