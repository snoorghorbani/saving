import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();
const UID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    const txnRef = db.collection(`users/${UID}/transactions`);

    // Delete the stray 200 OMR saving transaction (test entry)
    console.log('Deleting stray 200 OMR saving entry (fdRrbYxXKPF1r8N3joYt)...');
    await txnRef.doc('fdRrbYxXKPF1r8N3joYt').delete();
    console.log('Done. Savings reduced by 200 OMR. Untracked will increase by ~200.');
}

main().catch(console.error);
