export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'one-time';

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

export interface Expense {
    id: string;
    name: string;
    amount: number;
    frequency: Frequency;
    category: Category;
    isUnexpected: boolean;
    weeklyBudget: number | null;
    createdAt: Date;
    notes: string;
}

export interface ExpenseEntry {
    id: string;
    expenseId: string;
    amount: number;
    date: Date;
    notes: string;
    createdAt: Date;
}

export type AccountId =
    | 'omr-cash'
    | 'usd-cash'
    | 'isbank'
    | 'ziraat-bank'
    | 'dhofar-bank'
    | 'upwork';

export interface Account {
    id: AccountId;
    name: string;
    type: 'Cash' | 'Bank' | 'Online';
}

export const ACCOUNTS: Account[] = [
    { id: 'omr-cash', name: 'OMR Cash', type: 'Cash' },
    { id: 'usd-cash', name: 'USD Cash', type: 'Cash' },
    { id: 'isbank', name: 'IsBank', type: 'Bank' },
    { id: 'ziraat-bank', name: 'Ziraat Bank', type: 'Bank' },
    { id: 'dhofar-bank', name: 'Dhofar Bank', type: 'Bank' },
    { id: 'upwork', name: 'Upwork', type: 'Online' },
];

export interface Transaction {
    id: string;
    accountId: AccountId;
    amount: number;
    date: Date;
    notes: string;
    createdAt: Date;
}

export interface Goals {
    weeklyTarget: number;
    monthlyTarget: number;
}
