import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Use application default credentials (firebase CLI is authenticated)
initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const DHOFAR_ACCOUNT = '1IlAFnn6wSHwYKCRqsjn';

async function main() {
    const txnRef = db.collection(`users/${USER_ID}/transactions`);

    // 1. Bump Mar 21-27 USD txn slightly to ensure OMR conversion is definitively >= 385
    //    (fixes floating-point issue where 1001.308 USD * rate = 384.999x OMR → shows orange)
    console.log('1. Updating RQsuP5necxP1RfOc2Po1: 1001.308 → 1003 USD');
    await txnRef.doc('RQsuP5necxP1RfOc2Po1').update({ amount: 1003 });

    // 2. Reduce the 300 OMR saving txn in Apr 4-10 to 115 OMR
    console.log('2. Updating GHicCNXrmHvAAXSRa9Rm: 300 → 115 OMR');
    await txnRef.doc('GHicCNXrmHvAAXSRa9Rm').update({ amount: 115 });

    // 3. Also update the matching deposit transfer (-300 → -115)
    console.log('3. Updating Nh3daa4rdRy0tGGXsiZZ: -300 → -115 OMR (deposit side of transfer)');
    await txnRef.doc('Nh3daa4rdRy0tGGXsiZZ').update({ amount: -115 });

    // 4. Create new 185 OMR saving transaction dated Apr 1 (in Mar 28 – Apr 3 week)
    console.log('4. Creating new 185 OMR saving txn dated Apr 1, 2026');
    const newSavingRef = await txnRef.add({
        accountId: DHOFAR_ACCOUNT,
        amount: 185,
        bucket: 'saving',
        date: Timestamp.fromDate(new Date(2026, 3, 1, 12, 0, 0)), // Apr 1 noon
        notes: 'Split from Apr 4-10 week',
        createdAt: Timestamp.now(),
    });
    console.log('   Created:', newSavingRef.id);

    // 5. Create matching deposit withdrawal for the split
    console.log('5. Creating matching -185 OMR deposit txn dated Apr 1, 2026');
    const newDepositRef = await txnRef.add({
        accountId: DHOFAR_ACCOUNT,
        amount: -185,
        bucket: 'deposit',
        date: Timestamp.fromDate(new Date(2026, 3, 1, 12, 0, 0)), // Apr 1 noon
        notes: 'Transfer: Dhofar/deposit → Dhofar/saving (split)',
        createdAt: Timestamp.now(),
    });
    console.log('   Created:', newDepositRef.id);

    console.log('\nDone! Expected results:');
    console.log('  Mar 21-27: ~386 OMR (from 1003 USD) → green ✓');
    console.log('  Mar 28-Apr 3: 200 + 185 = 385 OMR → green ✓');
    console.log('  Apr 4-10: remaining');
}

main().catch(console.error);
