import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Use your service account key
const serviceAccount = JSON.parse(fs.readFileSync('/Users/soushiansnoorghorbani/Downloads/soushians-4d02a-c55686c588bc.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount), projectId: 'soushians-4d02a' });
const db = getFirestore();

const USER_ID = 'KlrSuSRoJSZhd7a5KfHBQ7dhQQo2';
const weekOverrides = {
    '2026-05-16': 385,
    '2026-05-09': 385,
    '2026-05-02': 385,
    '2026-04-25': 385,
};

async function main() {
    const ref = db.collection('users').doc(USER_ID).collection('settings').doc('manualGoalsOverrides');
    const snap = await ref.get();
    const current = snap.exists ? (snap.data()?.overrides ?? {}) : {};
    const overrides = { ...current, ...weekOverrides };

    await ref.set({
        overrides,
        updatedAt: new Date().toISOString(),
    }, { merge: true });

    for (const [weekKey, value] of Object.entries(weekOverrides)) {
        console.log(`Set week ${weekKey}: ${value.toFixed(3)} OMR`);
    }

    console.log('Done. Selected weeks updated.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
