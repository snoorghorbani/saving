# Data Model

All data is stored in Cloud Firestore under a per-user path.

## Collection Structure

```
users/{userId}/
├── accounts/            Saving places (cash, bank, online)
│   └── {accountId}
├── expenses/            Expense definitions
│   └── {expenseId}
├── expenseEntries/      Logged payments and set-asides
│   └── {entryId}
├── transactions/        Savings deposits/withdrawals
│   └── {transactionId}
├── loans/               Loans taken from savings accounts
│   └── {loanId}
├── loanRepayments/      Partial repayments toward loans
│   └── {repaymentId}
├── goals/
│   └── current          Single document for weekly/monthly targets
└── settings/
    ├── income           Single document for income config
    └── smsApiKey        API key for SMS auto-tracking
```

## Types

### Expense

```typescript
{
  id: string;               // Firestore doc ID
  kind: 'fixed-payment' | 'budget' | 'one-time' | 'future';
  name: string;
  amount: number;           // Fixed/one-time amount
  frequency: 'weekly' | 'monthly' | 'yearly' | 'one-time';
  category: Category;       // Rent, Groceries, Tech & Subscriptions, etc.
  isUnexpected: boolean;
  weeklyBudget?: number;    // Budget kind only
  dueDay?: number;          // Monthly fixed payments (1–31)
  dueDate?: string;         // One-time due date (ISO string)
  estimatedTotal?: number;  // Future kind only
  deadline?: string;        // Future kind only (ISO string)
  notes?: string;
  createdAt: Timestamp;
}
```

### ExpenseEntry

```typescript
{
  id: string;
  expenseId: string;        // Links to parent expense
  amount: number;
  date: Date;               // Firestore Timestamp, converted on read
  notes?: string;
  type: 'purchase' | 'set-aside';
  accountId?: string;       // Which account's deposit bucket this payment came from
}
```

### Account

```typescript
{
  id: string;
  name: string;
  type: 'Cash' | 'Bank' | 'Online';
  currency: Currency;       // OMR, USD, EUR, TRY, GBP, AED, SAR, INR
  isExternal?: boolean;     // true → not funded by tracked income (excluded from untracked calc)
}
```

### Transaction

```typescript
{
  id: string;
  accountId: string;        // Links to parent account
  amount: number;           // Positive = deposit/save, negative = withdrawal
  bucket: 'deposit' | 'saving';
  date: Date;               // Firestore Timestamp, converted on read
  notes?: string;
  createdAt: Timestamp;
}
```

### Goals

```typescript
{
  weeklyTarget: number;     // OMR
  monthlyTarget: number;    // OMR
}
```

Single document at `goals/current`.

### IncomeSettings

```typescript
{
  weeklyAmount: number;     // OMR per week
  currency: 'OMR';
  startDate: string;        // ISO date string
  weeksReceived: number;    // How many weeks of income received so far
}
```

Single document at `settings/income`.

### Loan

```typescript
{
  id: string;
  accountId: string;        // Savings account the loan was taken from (saving bucket)
  depositAccountId: string; // Savings account the loan goes to (deposit bucket)
  principal: number;        // Original loan amount (in account currency)
  balance: number;          // Outstanding balance remaining
  date: Date;               // Date loan was issued
  notes?: string;
  createdAt: Timestamp;
}
```

When a loan is created, the principal is withdrawn from the source account's `saving` bucket and deposited into the destination account's `deposit` bucket.

### LoanRepayment

```typescript
{
  id: string;
  loanId: string;           // Links to parent loan
  amount: number;           // Repayment amount (in account currency)
  date: Date;
  notes?: string;
  createdAt: Timestamp;
}
```

When a repayment is made, the amount is deposited back into the account's `saving` bucket.

### SmsApiKey

```typescript
{
  key: string;              // Random API key for authenticating SMS requests
  updatedAt: Timestamp;     // When the key was last generated
}
```

Single document at `settings/smsApiKey`. Used by the `parseSms` Cloud Function to authenticate iOS Shortcut requests.

## ViewerAccess (top-level collection)

```
viewerAccess/{viewerEmail}
```

```typescript
{
  ownerUid: string;         // The account owner's Firebase UID
  ownerEmail: string;       // The account owner's email
  grantedAt: Timestamp;
}
```

Grants the viewer (identified by email) read-only access to the owner's data. Document ID is the viewer's email address.

## Relationships

```
Account  ◄──── Transaction.accountId
Expense  ◄──── ExpenseEntry.expenseId
Account  ◄──── ExpenseEntry.accountId  (payment source)
ExpenseEntry ◄──── Transaction.notes   (linked via [entry:{id}] tag)
Account  ◄──── Loan.accountId          (savings account loaned from)
Loan     ◄──── LoanRepayment.loanId
```

- Deleting an account does NOT cascade-delete its transactions (they become orphaned).
- Deleting an expense does NOT cascade-delete its entries.
- Deleting an expense entry also deletes the linked withdrawal transaction (matched by `[entry:{id}]` in transaction notes).
- Loan balance is tracked both via `Loan.balance` and computed from `principal − sum(repayments)`.

## Backwards Compatibility

- Old transactions without a `bucket` field default to `'saving'` on read.
- Old income settings with `currency !== 'OMR'` are auto-migrated to OMR 550/week.
- Old expenses without a `kind` field are inferred: `one-time` if frequency is one-time, `budget` if weeklyBudget exists, otherwise `fixed-payment`.

## Real-Time Subscriptions

Every collection uses `onSnapshot` for real-time data. Changes made in one tab appear instantly in another. The subscription pattern:

```typescript
const unsub = subscribeToX(userId, (data) => setState(data));
// Cleanup on unmount:
return () => unsub();
```

## Security Rules

Firestore rules enforce that users can only read/write their own data under `users/{userId}/`.
