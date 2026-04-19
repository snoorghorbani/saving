# Architecture

## Code Organization

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx              Thin page — state, subscriptions, JSX only
│   │   ├── expenses/page.tsx
│   │   ├── savings/page.tsx
│   │   └── goals/page.tsx
│   ├── sign-in/
│   └── sign-up/
├── components/
│   ├── Navbar.tsx
│   └── ProgressBar.tsx
├── lib/
│   ├── services/                 ← Business logic lives here
│   │   ├── income.ts
│   │   ├── expenses.ts
│   │   ├── savings.ts
│   │   └── goals.ts
│   ├── firestore.ts              Firestore CRUD & real-time subscriptions
│   ├── utils.ts                  Formatting & date helpers
│   ├── currency.ts               Exchange rates & conversion
│   ├── auth-context.tsx          Auth provider & hook
│   └── firebase.ts               Firebase SDK init
├── types/
│   └── index.ts                  All TypeScript types
└── middleware.ts                  (minimal — auth is client-side)
```

## Layered Architecture

```
┌─────────────────────────────────────────────┐
│                  Pages                       │
│  (state, subscriptions, JSX — NO logic)      │
├─────────────────────────────────────────────┤
│               Services                       │
│  (pure functions — all business logic)       │
├─────────────────────────────────────────────┤
│            Firestore / Utils                 │
│  (CRUD, subscriptions, formatting, dates)    │
├─────────────────────────────────────────────┤
│          Firebase SDK / Currency API         │
│  (external services)                         │
└─────────────────────────────────────────────┘
```

### Pages (thin components)

Pages in `src/app/dashboard/` should only:

1. Declare state (`useState`).
2. Subscribe to Firestore data (`useEffect` with `subscribeToX`).
3. Call service functions to compute derived values.
4. Render JSX with the results.

Pages must NOT contain calculation logic, business rules, or data transformations inline.

### Services (`src/lib/services/`)

Pure functions that take data in and return results. No side effects, no Firestore calls, no React state.

| Service | Responsibility | Example Functions |
|---------|---------------|-------------------|
| `income.ts` | Income totals | `totalIncome(settings)`, `weeklyIncome(settings)` |
| `expenses.ts` | Expense calculations | `weeklyImpact(expense)`, `effectiveBudget(expense, entries)`, `projectedExpenses(expenses, entries, endDate)` |
| `savings.ts` | Savings aggregation | `bucketTotals(transactions, accounts)`, `savedThisWeek(transactions, accounts)`, `convertAllToOMR(transactions, accounts)` |
| `goals.ts` | Goal progress & history | `weeklyProgress(saved, target)`, `pastWeeksHistory(transactions, accounts, earliest)`, `pastMonthsHistory(...)` |

### Auth Context (`src/lib/auth-context.tsx`)

- Provides `user`, `loading`, `signInWithGoogle`, `signOut`.
- Detects viewer mode: on login, checks `viewerAccess/{email}` to see if the user is a viewer.
- Exposes `effectiveUserId` (owner's UID when viewing, own UID otherwise), `isViewer`, `ownerEmail`.
- All pages use `effectiveUserId` for Firestore subscriptions and hide write operations when `isViewer` is true.

### Firestore Layer (`src/lib/firestore.ts`)

Only Firestore operations:
- `addX`, `updateX`, `deleteX` — CRUD.
- `subscribeToX` — Real-time `onSnapshot` subscriptions.
- No business logic, no calculations.
- Collections: accounts, expenses, expenseEntries, transactions, goals, settings, loans, loanRepayments.

### Utilities (`src/lib/utils.ts`)

Generic helpers not tied to business domain:
- `formatOMR()` — number formatting.
- `getWeekRange()` — date range calculations.
- `toWeekly()` — frequency normalization.

### Currency (`src/lib/currency.ts`)

- `convert(amount, from, to)` — currency conversion.
- `getRates()` — fetch & cache exchange rates.
- `formatCurrency()` — locale-aware formatting.

## Patterns

### Real-Time Subscriptions

```typescript
useEffect(() => {
    if (!user) return;
    const unsub = subscribeToX(user.uid, setData);
    return () => unsub();
}, [user]);
```

### Async Derived State

For values that require `await` (currency conversion), use a separate `useEffect`:

```typescript
useEffect(() => {
    let cancelled = false;
    async function calc() {
        const result = await computeWithConversion(data, accounts);
        if (!cancelled) setState(result);
    }
    calc();
    return () => { cancelled = true; };
}, [data, accounts]);
```

### Navigation

Use `window.location.href` for all navigation (not `next/router` or `next/navigation`) because the app is a static export — client-side routing doesn't work after deployment.

## Current State

> **Note:** The service layer (`src/lib/services/`) is the target architecture. Currently, some business logic still lives directly in page components. New features should use services, and existing logic should be migrated to services when pages are touched.

## Cloud Functions (`functions/`)

A separate `functions/` directory contains Firebase Cloud Functions (2nd Gen, Node.js 22).

| Function | Trigger | Purpose |
|----------|---------|---------|
| `parseSms` | HTTP POST | Receives bank SMS text from iOS Shortcuts, parses amount/merchant/date, and writes expense entries to Firestore. Authenticated via per-user API key stored in `users/{userId}/settings/smsApiKey`. |

Functions have their own `package.json` and `node_modules`, independent of the main app.
