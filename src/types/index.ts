export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'one-time';

export type ExpenseKind = 'fixed-payment' | 'budget' | 'one-time' | 'future';

export const EXPENSE_KINDS: { value: ExpenseKind; label: string; desc: string }[] = [
    { value: 'fixed-payment', label: 'Fixed Payment', desc: 'Recurring bill (rent, subscriptions) — shows weekly impact' },
    { value: 'budget', label: 'Weekly Budget', desc: 'Tracked spending (groceries, dining) — resets weekly with carryover' },
    { value: 'one-time', label: 'One-Time', desc: 'Single payment — optionally schedule a due date' },
    { value: 'future', label: 'Future Expense', desc: 'Estimated total with a deadline — divided across weeks, log payments as you go' },
];

export type Category =
    | 'Rent'
    | 'Groceries'
    | 'Tech & Subscriptions'
    | 'Utilities'
    | 'Transport'
    | 'Entertainment'
    | 'Dining'
    | 'Healthcare'
    | 'Other';

export const CATEGORIES: Category[] = [
    'Rent',
    'Groceries',
    'Tech & Subscriptions',
    'Utilities',
    'Transport',
    'Entertainment',
    'Dining',
    'Healthcare',
    'Other',
];

export const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'yearly', 'one-time'];

export type Currency = 'OMR' | 'USD' | 'EUR' | 'TRY' | 'GBP' | 'AED' | 'SAR' | 'INR';

export const CURRENCIES: Currency[] = ['OMR', 'USD', 'EUR', 'TRY', 'GBP', 'AED', 'SAR', 'INR'];

export interface Expense {
    id: string;
    kind: ExpenseKind;
    name: string;
    amount: number;          // fixed payment amount, or 0 for budgets
    frequency: Frequency;
    category: Category;
    isUnexpected: boolean;
    weeklyBudget: number | null;  // weekly budget cap for 'budget' kind
    dueDay: number | null;        // day of month (1-31) for monthly fixed payments
    dueDate: string | null;       // ISO date string for scheduled one-time payments
    estimatedTotal: number | null; // total estimated amount for 'future' kind
    deadline: string | null;       // ISO date string deadline for 'future' kind
    createdAt: Date;
    notes: string;
}

export interface ExpenseEntry {
    id: string;
    expenseId: string;
    amount: number;
    date: Date;
    notes: string;
    type?: 'purchase' | 'set-aside';
    accountId?: string;        // which account's deposit bucket this payment came from
    createdAt: Date;
}

export type AccountType = 'Cash' | 'Bank' | 'Online';

export interface Account {
    id: string;
    name: string;
    type: AccountType;
    currency: Currency;
    isExternal?: boolean;      // true → not funded by tracked income (excluded from untracked calc)
    cards?: string[];          // last 4 digits of linked payment cards
    createdAt: Date;
}

export type Bucket = 'deposit' | 'saving';

export interface Transaction {
    id: string;
    accountId: string;
    amount: number;
    bucket: Bucket;
    date: Date;
    notes: string;
    loanId?: string;
    createdAt: Date;
}

export interface Goals {
    weeklyTarget: number;
    monthlyTarget: number;
}

export interface IncomeSettings {
    weeklyAmount: number;
    currency: Currency;
    startDate: string; // ISO date string — first week of income
    weeksReceived: number; // total weeks of income received so far
    depositAccountId?: string; // account that receives auto weekly income deposits
}

export interface ViewerAccess {
    ownerUid: string;
    ownerEmail: string;
    grantedAt: Date;
}

export interface Loan {
    id: string;
    accountId: string;         // savings account the loan was taken from (saving bucket)
    depositAccountId: string;  // savings account the loan goes to (deposit bucket)
    principal: number;         // original loan amount (in account currency)
    balance: number;           // outstanding balance remaining
    date: Date;                // date loan was issued
    notes: string;
    createdAt: Date;
}

export interface LoanRepayment {
    id: string;
    loanId: string;
    amount: number;            // repayment amount (in account currency)
    date: Date;
    notes: string;
    createdAt: Date;
}
