// Service: Manual override for savings progress
// Allows user to set manual values for "saved this week" and "saved this month" for goals display.
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

function manualWeekOverridesRef(userId: string) {
    return doc(db, 'users', userId, 'settings', 'manualGoalsOverrides');
}

function readManualWeekOverrides(data: unknown): Record<string, number> {
    if (!data || typeof data !== 'object') return {};

    const raw = 'overrides' in data && data.overrides && typeof data.overrides === 'object'
        ? (data.overrides as Record<string, unknown>)
        : (data as Record<string, unknown>);

    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof value === 'number' && Number.isFinite(value)) {
            result[key] = value;
        }
    }

    return result;
}

export async function setManualWeekOverride(userId: string, weekKey: string, value: number) {
    const ref = manualWeekOverridesRef(userId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? readManualWeekOverrides(snap.data()) : {};
    await setDoc(ref, {
        overrides: { ...current, [weekKey]: value },
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}

export async function getManualWeekOverride(userId: string, weekKey: string): Promise<number | null> {
    const ref = manualWeekOverridesRef(userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const overrides = readManualWeekOverrides(snap.data());
    return overrides[weekKey] ?? null;
}

export async function clearManualWeekOverride(userId: string, weekKey: string) {
    const ref = manualWeekOverridesRef(userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const current = readManualWeekOverrides(snap.data());
    if (!(weekKey in current)) return;

    delete current[weekKey];

    if (Object.keys(current).length === 0) {
        await deleteDoc(ref);
        return;
    }

    await setDoc(ref, {
        overrides: current,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}

export async function getAllManualWeekOverrides(userId: string): Promise<Record<string, number>> {
    const ref = manualWeekOverridesRef(userId);
    const snap = await getDoc(ref);
    return snap.exists() ? readManualWeekOverrides(snap.data()) : {};
}
