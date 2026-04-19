// One-time script: mark Upwork, Ziraat, IsBank as external (not salary-funded)
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'soushians-4d02a' });
const db = getFirestore();

const userId = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';

async function main() {
    const snap = await db.collection(`users/${userId}/accounts`).get();
    for (const doc of snap.docs) {
        const name = doc.data().name;
        // Dhofar is salary-funded, everything else is external
        const isExternal = name !== 'Dhofar';
        await doc.ref.update({ isExternal });
        console.log(`${name} (${doc.id}): isExternal = ${isExternal}`);
    }
    console.log('Done.');
}

main().catch(console.error);
