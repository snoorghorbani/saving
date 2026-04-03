import { db } from './firebase';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    orderBy,
    where,
    Timestamp,
    onSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import type { Expense, ExpenseEntry, Transaction, Goals } from '@/types';

// ─── Expenses ─────────────────────────────────────────

export function addExpense(
    userId: string,
    expense: Omit<Expense, 'id' | 'createdAt'>
) {
    const ref = collection(db, 'users', userId, 'expenses');
    return addDoc(ref, { ...expense, createdAt: Timestamp.now() });
}

export function updateExpense(
    userId: string,
    expenseId: string,
    data: Partial<Omit<Expense, 'id' | 'createdAt'>>
) {
    const ref = doc(db, 'users', userId, 'expenses', expenseId);
    return updateDoc(ref, data);
}

export function deleteExpense(userId: string, expenseId: string) {
    const ref = doc(db, 'users', userId, 'expenses', expenseId);
    return deleteDoc(ref);
}

export function subscribeToExpenses(
    userId: string,
    callback: (expenses: Expense[]) => void
): Unsubscribe {
    const ref = collection(db, 'users', userId, 'expenses');
    const q = query(ref, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const expenses = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })) as Expense[];
        callback(expenses);
    });
}

// ─── Expense Entries (purchases against a budget) ────

export function addExpenseEntry(
    userId: string,
    entry: Omit<ExpenseEntry, 'id' | 'createdAt'>
) {
    const ref = collection(db, 'users', userId, 'expenseEntries');
    return addDoc(ref, {
        ...entry,
        date: Timestamp.fromDate(entry.date),
        createdAt: Timestamp.now(),
    });
}

export function deleteExpenseEntry(userId: string, entryId: string) {
    const ref = doc(db, 'users', userId, 'expenseEntries', entryId);
    return deleteDoc(ref);
}

export function subscribeToExpenseEntries(
    userId: string,
    callback: (entries: ExpenseEntry[]) => void
): Unsubscribe {
    const ref = collection(db, 'users', userId, 'expenseEntries');
    const q = query(ref, orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const entries = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            date: d.data().date?.toDate?.() ?? new Date(),
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })) as ExpenseEntry[];
        callback(entries);
    });
}

// ─── Transactions (Savings) ──────────────────────────

export function addTransaction(
    userId: string,
    transaction: Omit<Transaction, 'id' | 'createdAt'>
) {
    const ref = collection(db, 'users', userId, 'transactions');
    return addDoc(ref, {
        ...transaction,
        date: Timestamp.fromDate(transaction.date),
        createdAt: Timestamp.now(),
    });
}

export function subscribeToTransactions(
    userId: string,
    callback: (transactions: Transaction[]) => void
): Unsubscribe {
    const ref = collection(db, 'users', userId, 'transactions');
    const q = query(ref, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const txns = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            date: d.data().date?.toDate?.() ?? new Date(),
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })) as Transaction[];
        callback(txns);
    });
}

// ─── Goals ────────────────────────────────────────────

export function setGoals(userId: string, goals: Goals) {
    const ref = doc(db, 'users', userId, 'goals', 'current');
    return setDoc(ref, goals);
}

export function subscribeToGoals(
    userId: string,
    callback: (goals: Goals | null) => void
): Unsubscribe {
    const ref = doc(db, 'users', userId, 'goals', 'current');
    return onSnapshot(ref, (snapshot) => {
        callback(snapshot.exists() ? (snapshot.data() as Goals) : null);
    });
}
