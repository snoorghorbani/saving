import { db } from './firebase';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    getDoc,
    getDocs,
    query,
    orderBy,
    where,
    Timestamp,
    onSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import type { Expense, ExpenseEntry, Transaction, Goals, Account, AccountType, Currency, IncomeSettings, ViewerAccess, Loan, LoanRepayment } from '@/types';

// ─── Accounts (dynamic saving places) ────────────────

export function addAccount(
    userId: string,
    account: Omit<Account, 'id' | 'createdAt'>
) {
    const ref = collection(db, 'users', userId, 'accounts');
    return addDoc(ref, { ...account, createdAt: Timestamp.now() });
}

export function updateAccount(
    userId: string,
    accountId: string,
    data: Partial<Omit<Account, 'id' | 'createdAt'>>
) {
    const ref = doc(db, 'users', userId, 'accounts', accountId);
    return updateDoc(ref, data);
}

export function deleteAccount(userId: string, accountId: string) {
    const ref = doc(db, 'users', userId, 'accounts', accountId);
    return deleteDoc(ref);
}

export function subscribeToAccounts(
    userId: string,
    callback: (accounts: Account[]) => void
): Unsubscribe {
    const ref = collection(db, 'users', userId, 'accounts');
    const q = query(ref, orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const accounts = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            isExternal: d.data().isExternal ?? false,
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })) as Account[];
        callback(accounts);
    });
}

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

export function updateExpenseEntry(
    userId: string,
    entryId: string,
    data: Partial<Omit<ExpenseEntry, 'id' | 'createdAt'>>
) {
    const ref = doc(db, 'users', userId, 'expenseEntries', entryId);
    const payload: Record<string, unknown> = { ...data };
    if (data.date) payload.date = Timestamp.fromDate(data.date);
    return updateDoc(ref, payload);
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

export function updateTransaction(
    userId: string,
    transactionId: string,
    data: Partial<Omit<Transaction, 'id' | 'createdAt'>>
) {
    const ref = doc(db, 'users', userId, 'transactions', transactionId);
    const payload: Record<string, unknown> = { ...data };
    if (data.date) payload.date = Timestamp.fromDate(data.date);
    return updateDoc(ref, payload);
}

export function deleteTransaction(userId: string, transactionId: string) {
    const ref = doc(db, 'users', userId, 'transactions', transactionId);
    return deleteDoc(ref);
}

export async function deleteTransactionsByLoanId(userId: string, loanId: string) {
    const ref = collection(db, 'users', userId, 'transactions');
    const q = query(ref, where('loanId', '==', loanId));
    const snapshot = await getDocs(q);
    const deletes = snapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);
}

export async function deleteLoanCascade(userId: string, loanId: string) {
    // Delete all repayments for this loan
    const repRef = collection(db, 'users', userId, 'loanRepayments');
    const repQ = query(repRef, where('loanId', '==', loanId));
    const repSnap = await getDocs(repQ);
    const repDeletes = repSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(repDeletes);
    // Delete all transactions linked to this loan
    await deleteTransactionsByLoanId(userId, loanId);
    // Delete the loan itself
    const loanRef = doc(db, 'users', userId, 'loans', loanId);
    await deleteDoc(loanRef);
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
            bucket: d.data().bucket ?? 'saving',
            notes: d.data().notes ?? '',
            date: d.data().date?.toDate?.() ?? d.data().createdAt?.toDate?.() ?? new Date(0),
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(0),
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

// ─── Income Settings ─────────────────────────────────

export function setIncomeSettings(userId: string, income: IncomeSettings) {
    const ref = doc(db, 'users', userId, 'settings', 'income');
    return setDoc(ref, income);
}

export function subscribeToIncomeSettings(
    userId: string,
    callback: (income: IncomeSettings | null) => void
): Unsubscribe {
    const ref = doc(db, 'users', userId, 'settings', 'income');
    return onSnapshot(ref, (snapshot) => {
        callback(snapshot.exists() ? (snapshot.data() as IncomeSettings) : null);
    });
}

// ─── SMS API Key ─────────────────────────────────────

export async function getSmsSettings(userId: string): Promise<{ key: string | null; accountId: string | null }> {
    const ref = doc(db, 'users', userId, 'settings', 'smsApiKey');
    const snap = await getDoc(ref);
    if (!snap.exists()) return { key: null, accountId: null };
    const data = snap.data();
    return { key: data.key ?? null, accountId: data.accountId ?? null };
}

export async function getSmsApiKey(userId: string): Promise<string | null> {
    const { key } = await getSmsSettings(userId);
    return key;
}

export function setSmsApiKey(userId: string, key: string) {
    const ref = doc(db, 'users', userId, 'settings', 'smsApiKey');
    return setDoc(ref, { key, updatedAt: Timestamp.now() }, { merge: true });
}

export function setSmsAccountId(userId: string, accountId: string) {
    const ref = doc(db, 'users', userId, 'settings', 'smsApiKey');
    return setDoc(ref, { accountId, updatedAt: Timestamp.now() }, { merge: true });
}

// ─── Viewer Access (read-only sharing) ───────────────

export async function getViewerAccess(
    viewerEmail: string
): Promise<ViewerAccess | null> {
    const ref = doc(db, 'viewerAccess', viewerEmail);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
        ownerUid: data.ownerUid,
        ownerEmail: data.ownerEmail,
        grantedAt: data.grantedAt?.toDate?.() ?? new Date(),
    };
}

export function grantViewerAccess(
    ownerUid: string,
    ownerEmail: string,
    viewerEmail: string
) {
    const ref = doc(db, 'viewerAccess', viewerEmail);
    return setDoc(ref, {
        ownerUid,
        ownerEmail,
        grantedAt: Timestamp.now(),
    });
}

export function revokeViewerAccess(viewerEmail: string) {
    const ref = doc(db, 'viewerAccess', viewerEmail);
    return deleteDoc(ref);
}

export function subscribeToViewers(
    ownerUid: string,
    callback: (viewers: { email: string; grantedAt: Date }[]) => void
): Unsubscribe {
    const ref = collection(db, 'viewerAccess');
    const q = query(ref, where('ownerUid', '==', ownerUid));
    return onSnapshot(q, (snapshot) => {
        const viewers = snapshot.docs.map((d) => ({
            email: d.id,
            grantedAt: d.data().grantedAt?.toDate?.() ?? new Date(),
        }));
        callback(viewers);
    });
}

// ─── Loans ───────────────────────────────────────────

export function addLoan(
    userId: string,
    loan: Omit<Loan, 'id' | 'createdAt'>
) {
    const ref = collection(db, 'users', userId, 'loans');
    return addDoc(ref, {
        ...loan,
        date: Timestamp.fromDate(loan.date),
        createdAt: Timestamp.now(),
    });
}

export function updateLoan(
    userId: string,
    loanId: string,
    data: Partial<Omit<Loan, 'id' | 'createdAt'>>
) {
    const ref = doc(db, 'users', userId, 'loans', loanId);
    const payload: Record<string, unknown> = { ...data };
    if (data.date) payload.date = Timestamp.fromDate(data.date);
    return updateDoc(ref, payload);
}

export function deleteLoan(userId: string, loanId: string) {
    const ref = doc(db, 'users', userId, 'loans', loanId);
    return deleteDoc(ref);
}

export function subscribeToLoans(
    userId: string,
    callback: (loans: Loan[]) => void
): Unsubscribe {
    const ref = collection(db, 'users', userId, 'loans');
    const q = query(ref, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const loans = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            date: d.data().date?.toDate?.() ?? new Date(),
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })) as Loan[];
        callback(loans);
    });
}

// ─── Loan Repayments ─────────────────────────────────

export function addLoanRepayment(
    userId: string,
    repayment: Omit<LoanRepayment, 'id' | 'createdAt'>
) {
    const ref = collection(db, 'users', userId, 'loanRepayments');
    return addDoc(ref, {
        ...repayment,
        date: Timestamp.fromDate(repayment.date),
        createdAt: Timestamp.now(),
    });
}

export function deleteLoanRepayment(userId: string, repaymentId: string) {
    const ref = doc(db, 'users', userId, 'loanRepayments', repaymentId);
    return deleteDoc(ref);
}

export function subscribeToLoanRepayments(
    userId: string,
    callback: (repayments: LoanRepayment[]) => void
): Unsubscribe {
    const ref = collection(db, 'users', userId, 'loanRepayments');
    const q = query(ref, orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const repayments = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            date: d.data().date?.toDate?.() ?? new Date(),
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })) as LoanRepayment[];
        callback(repayments);
    });
}
