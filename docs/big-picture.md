# Big Picture

## What WealthWise Does

WealthWise is a single-user personal finance dashboard that answers three questions every week:

1. **Where did my money go?** — Track every expense (bills, budgets, one-time purchases, future goals).
2. **How much have I saved?** — Record savings across multiple accounts and currencies, split into deposit and saving buckets.
3. **Am I on track?** — Compare actual savings against weekly and monthly targets, with full history.

## Core Financial Model

```
Income (OMR/week × weeks received)
  minus  Expenses (logged payments + purchases)
  minus  Savings  (saving bucket across all accounts)
  minus  Deposits (deposit bucket across all accounts)
  equals Untracked money
```

The goal is to drive **Untracked** to zero — every rial is either spent, saved, or deposited.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Browser     │────▶│  Firebase    │────▶│  Firestore DB    │
│  (Static JS) │◀────│  Hosting     │     │  (per-user data) │
└──────────────┘     └──────────────┘     └──────────────────┘
       │                                         │
       │  Google OAuth                           │  Real-time
       ▼                                         │  snapshots
┌──────────────┐                                 │
│  Firebase    │◀────────────────────────────────┘
│  Auth        │
└──────────────┘

       │  Currency rates (1hr cache)
       ▼
┌──────────────────┐
│ open.er-api.com  │
└──────────────────┘
```

- **No server.** The app is a static Next.js export (HTML/JS/CSS) served from Firebase Hosting, with all dynamic behavior happening client-side.
- **All data is per-user.** Firestore documents live under `users/{userId}/...` and are protected by security rules.
- **Real-time updates.** Every data subscription uses Firestore `onSnapshot`, so changes appear instantly across tabs.
- **Currency conversion** happens client-side via `open.er-api.com` with a 1-hour cache and hardcoded fallback rates.

## Navigation & Page Map

```
/                        Landing page (redirects to dashboard if signed in)
/sign-in                 Google sign-in
/sign-up                 Google sign-up (same flow)
/dashboard               Main overview — income, expenses, savings summary
/dashboard/expenses      Manage expense definitions and log payments
/dashboard/savings       Manage accounts, transactions, and transfers
/dashboard/goals         Set savings targets and review history
```

## User Workflow (Weekly Cycle)

1. **Receive income** → Update "Weeks Received" on the dashboard.
2. **Pay bills** → Mark fixed payments as paid on the expenses page.
3. **Log purchases** → Add entries to budget expenses.
4. **Save money** → Add transactions to savings accounts (deposit or saving bucket).
5. **Check progress** → Dashboard shows weekly/monthly savings vs goal, untracked money.
6. **End of week** → Budget carryover rolls surplus/deficit into next week automatically.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Static export (no SSR) | Simplest hosting, zero cold starts, Firebase Hosting CDN |
| OMR as primary currency | User is based in Oman; all goals and budgets denominated in OMR |
| Two buckets per account (deposit / saving) | Separate "parking" money (deposit) from "committed" savings; only saving bucket counts toward goals |
| Weekly as the base cycle | Income arrives weekly; expenses normalized to weekly for comparison |
| No backend API | All reads/writes go directly to Firestore from the browser; security rules enforce per-user access |
| March 1, 2026 as epoch | History tracking and goals start from this date |

## Deployment

```bash
npm run build          # Static export to out/
firebase deploy --only hosting
```

Or use `./deploy.sh` which handles login, project selection, dependency install, and deploy.
