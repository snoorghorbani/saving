# Pages & Features

## Landing Page (`/`)

- Hero section with app description and "Get Started" button.
- Redirects to `/dashboard` if user is already signed in.
- Navigation handled via `window.location.href` (not Next.js router, due to static export).

## Sign In / Sign Up (`/sign-in`, `/sign-up`)

- Google OAuth popup via Firebase Auth.
- Single sign-in method (Google only).
- Redirects to `/dashboard` on success.

## Dashboard (`/dashboard`)

The main overview page with everything at a glance.

### Top-Row Cards (6 cards, OMR/USD toggle)

| Card | Color | Value |
|------|-------|-------|
| Total Income | Green | weeklyAmount × weeksReceived |
| Total Expenses | Red | Sum of all purchase entries (excludes set-asides) |
| Total Deposit | Blue | All deposit-bucket transactions converted to OMR |
| Total Saved | Teal | All saving-bucket transactions converted to OMR |
| Net | Purple | Income − Expenses |
| Untracked | Amber/Red | Income − Expenses − Saved − Deposit. "Mark as Expense" button (owner only, when positive) creates a one-time unexpected expense and entry for the untracked amount. |

A toggle button switches all 6 cards between OMR and USD display.

### Outstanding Loans Banner

- Appears below the top-row cards when there are active (unpaid) loans.
- Lists each outstanding loan: account name, notes, remaining balance.
- "View & Repay" link navigates to the savings page.

### Income Management

- Inline edit form for weekly income (OMR) and weeks received.
- Auto-initializes to 550 OMR/week × 5 weeks for new users.
- Hidden in viewer (read-only) mode.

### Sharing Management (owner only)

- "Sharing" button in dashboard header opens the sharing panel.
- Lists current viewers with their emails.
- Add viewer by email address — creates a `viewerAccess/{email}` document.
- Remove viewer revokes access immediately.
- Hidden when viewing in read-only mode.

### SMS Auto-Tracking Setup (owner only)

- "SMS Setup" button (amber) in dashboard header opens the SMS setup panel.
- Generates and displays an API key for authenticating iOS Shortcut requests.
- Shows the Cloud Function endpoint URL (`https://parsesms-ig3bn6r6ta-uc.a.run.app`).
- Shows the user's Firebase UID for inclusion in requests.
- Provides step-by-step iOS Shortcut setup instructions.
- The Cloud Function (`functions/index.js`) parses bank SMS messages, extracts amount/merchant/date, and creates expense entries in Firestore.
- Matches merchant names to existing expenses (case-insensitive) or falls back to an "SMS Expenses" catch-all expense.
- API key stored in `users/{userId}/settings/smsApiKey`.

### Summary Cards (4 cards)

- **Weekly Expenses**: Spent vs budgeted this week.
- **Saved This Week**: Total savings (all buckets) this week.
- **Saved This Month**: Total savings this month.
- **Expenses Till End of 2026**: Projected total (fixed + one-time + future).

### Savings Goals Progress (2 cards)

- **Weekly Savings Plan**: Progress bar, saved vs target, week date range shown.
- **Monthly Savings Plan**: Progress bar, saved vs target, month name shown.
- Only counts saving-bucket transactions (not deposits).

### Weekly Budget Breakdown

Detailed breakdown of all regular expenses:

- **Fixed Payments**: Each with weekly impact, set-aside controls.
- **Budget Categories**: Effective budget (with carryover), purchase log.
- **One-Time Expenses**: Paid/unpaid status.
- **Future Expenses**: Weekly impact, deadline, set-aside tracking.

### This Week's Due / Next Week's Due

- Lists fixed payments falling due this week and next.
- Mark as paid / undo buttons.
- Shows paid (green check) vs unpaid (yellow warning) status.

## Expenses Page (`/dashboard/expenses`)

Full expense management with CRUD operations.

### Week Navigation

- Navigation bar at the top with Previous / Next buttons and a "Today" reset.
- Displays the selected week label ("This Week", "Last Week", "Next Week", or date range).
- All sections below reflect the selected week.
- Pay From account selector and action buttons (Mark as Paid, Undo) are only available for the current week.

### All Entries This Week

- Lists all expense entries (excluding set-asides) recorded during the selected week.
- Shows expense name, category, date, notes, and amount.
- Displays the total spent for the week.

### Add/Edit Form

Dynamic form adapts to expense kind:

- **Fixed Payment**: name, amount, frequency, dueDay (if monthly), category.
- **Budget**: name, weeklyBudget, category.
- **One-Time**: name, amount, dueDate, category.
- **Future**: name, estimatedTotal, deadline, category.

All kinds support: notes, unexpected flag.

### Pay From Account Selector

- Global dropdown at the top of the expenses page.
- Lists all savings accounts with their currency.
- All payments (mark as paid, manual entries) withdraw from the selected account's deposit bucket.
- Automatically creates a paired withdrawal transaction when a payment is logged.
- Currency conversion applied when account currency differs from OMR.

### Weekly Summary (5 cards)

| Card | Value |
|------|-------|
| Fixed/Week | Sum of all fixed payments normalized to weekly |
| Budgets/Week | Sum of all weekly budgets |
| Budget Spent | Actual spending on budgets this week |
| Future/Week | Sum of weekly portions for future expenses |
| Total/Week | Sum of all above |

### Fixed Payments Section

- **This Week's Due**: Payments with due dates in the current week. Mark paid / undo.
- **Next Week's Due**: Preview of next week.
- **All Fixed Payments**: Full list with edit/delete.

### Weekly Budgets Section

Expandable cards for each budget category:
- Progress bar: spent vs effective budget.
- Carryover indicator (surplus in green, deficit in red).
- Purchase log with add/edit/delete.
- Individual purchase entries.

### One-Time Payments Section

- List of planned one-time expenses.
- Status: unpaid or paid (with checkmark).
- Mark as paid, edit, delete.

### Future Expenses Section

- Shows estimated total, weekly portion, payments made.
- Progress bar toward estimated total.
- Set-aside button for weekly advance payments.
- Edit/delete.

### Unexpected Expenses Section

- Separate section for expenses flagged as unexpected.
- Same functionality as their kind, but displayed separately.

## Savings Page (`/dashboard/savings`)

Account and transaction management.

### Total Savings Display

- Shows total across all accounts converted to a selected currency (dropdown of all 8 currencies).

### Add Account

- Form: name, type (Cash/Bank/Online), currency.
- Delete account button on each card.

### Account Cards

Each account shows:
- Name, type badge, currency.
- Total balance.
- Deposit balance (blue).
- Saving balance (green).
- Transaction count.

### Add Transaction Form

- Select account from dropdown.
- Select bucket (deposit/saving).
- Amount (negative for withdrawals).
- Date picker.
- Notes field.

### Transfer Between Accounts

- Source: account + bucket selector.
- Destination: account + bucket selector.
- Amount in source currency.
- Real-time preview of converted amount if currencies differ.
- Creates paired transactions (debit + credit).

### Loan from Savings

- "Loan" button opens the loan request form.
- Select source account (shows saving balance for each).
- Enter loan amount (must not exceed saving balance).
- Creates a withdrawal transaction from the saving bucket and a loan record.

### Outstanding Loans

- Lists all loans with remaining balance > 0.
- Each loan card shows: account name, date, notes, principal, remaining balance, repayment progress bar.
- Repayment history displayed per loan.
- "Make Repayment" button opens inline form: amount, date, notes.
- Repayment deposits back into the saving bucket and records a LoanRepayment.
- Loan balance updated on repayment.

### Settled Loans

- Lists fully repaid loans with a "Settled" badge.

### Transaction History

- Filterable by account (dropdown) or show all.
- Each row: account name, bucket badge (blue for deposit, green for saving), date, notes, amount.
- Edit and delete buttons per transaction.

## Goals Page (`/dashboard/goals`)

Savings target tracking with history.

### Goal Setting

- Edit form with weekly target (OMR) and monthly target (OMR).
- "Set Goals" / "Edit Goals" toggle button.

### Current Goals (2 cards)

- **Weekly Savings Goal**: Target, saved this week, progress bar, ahead/remaining.
  - Shows current week date range (e.g., "Apr 5 – Apr 11").
- **Monthly Savings Goal**: Target, saved this month, progress bar, ahead/remaining.
  - Shows current month name (e.g., "April 2026").

### Progress Bar Colors

| Progress | Color |
|----------|-------|
| < 50% | Red |
| 50–99% | Amber |
| ≥ 100% | Emerald (green) |

### Past Weeks History

- Lists every week from current back to March 1, 2026.
- Each row: week date range, saved amount / target, progress bar, checkmark if met.

### Past Months History

- Lists every month from current back to March 2026.
- Each row: month name, saved amount / target, progress bar, checkmark if met.

## Navbar

- Fixed top navigation bar.
- Links: Dashboard, Expenses, Savings, Goals.
- Active link highlighted.
- Sign out button.
- User display name / email.

## Shared Components

### ProgressBar

- Reusable progress bar with configurable color (`emerald`, `amber`, `red`, `blue`).
- Animated width transition.
- Percentage label.
