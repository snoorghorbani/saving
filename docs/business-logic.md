# Business Logic

## Income

- Income is defined as a **weekly amount in OMR** multiplied by **weeks received so far**.
- The user manually increments `weeksReceived` each time they get paid.
- Total Income = `weeklyAmount × weeksReceived`.
- Legacy records stored in USD are auto-migrated to OMR 550/week on load.

## Expenses

Every expense has a **kind** that determines how it behaves:

### Fixed Payment
Recurring bills with a known amount and frequency.

- **Weekly**: Due every week, impact = full amount.
- **Monthly**: Due on a specific `dueDay` (1–31). Weekly impact = `amount ÷ 4.33`.
- **Yearly**: Weekly impact = `amount ÷ 52`.
- Appears in "This Week's Due" / "Next Week's Due" when the due day falls in that week.
- Can be marked as **paid** (creates an expense entry of type `purchase`).

### Budget
Variable spending categories with a weekly allowance.

- Has a `weeklyBudget` that resets each week.
- **Carryover**: If you underspend last week, the surplus adds to this week's budget. If you overspend, the deficit subtracts.
- Effective budget = `weeklyBudget + (weeklyBudget − lastWeekSpent)`.
- Individual purchases are logged as expense entries.

### One-Time
A single expected expense that needs to be paid once.

- Has a fixed `amount` and optional `dueDate`.
- Tracked as unpaid until an expense entry is logged against it.
- Once paid, it's marked with a checkmark and excluded from future expected totals.

### Future
A large upcoming expense spread across weeks until a deadline.

- Defined by `estimatedTotal` and `deadline`.
- Weekly impact = `estimatedTotal ÷ weeksUntil(deadline)` (min 1 week).
- You can **set aside** weekly portions in advance (type `set-aside`).
- Advance payments cover future weeks: if you set aside 3× the weekly portion, the next 2 future weeks are considered "paid".

### Unexpected Expenses
Any expense can be flagged `isUnexpected`. These are displayed in a separate section and excluded from the regular weekly budget breakdown.

### Set-Aside Mechanism
For fixed payments not due this week and for future expenses, you can "set aside" the weekly portion. This:
- Creates an entry with `type: 'set-aside'`.
- Set-aside entries are **excluded** from Total Expenses on the dashboard (only `purchase` entries count).
- Set-aside entries **are included** in the weekly budget spent total on the expenses page.
- Set-aside entries do NOT create withdrawal transactions (they are virtual reservations).

### Payment Source (Account Link)
Every expense payment (non-set-aside) must specify which account it comes from:
- The expenses page has a global "Pay From" account selector.
- When a payment entry is created, a matching **withdrawal transaction** is automatically created on that account's **deposit bucket**.
- If the account is in a different currency than OMR, the amount is converted using live exchange rates.
- Undoing a payment or deleting an entry also deletes the linked withdrawal transaction.
- The link is tracked via `[entry:{entryId}]` in the transaction's notes field.

## Savings

### Accounts
Each saving place (cash, bank, online wallet) has:
- A name, type, and currency.
- Two **buckets**: `deposit` and `saving`.

### Buckets
- **Deposit bucket**: Parking money — funds that are allocated but not yet committed to long-term savings.
- **Saving bucket**: Committed savings — this is what counts toward weekly/monthly savings goals.
- Every transaction belongs to exactly one bucket.

### Transactions
- Positive amount = money going in (deposit or save).
- Negative amount = withdrawal.
- Each transaction has an `accountId`, `bucket`, `date`, and optional `notes`.

### Transfers
Move money between any combination of account + bucket:
- Same account, different buckets (e.g., deposit → saving).
- Different accounts, same or different buckets.
- Cross-currency transfers auto-convert using live exchange rates.
- Creates two transactions: a debit (negative) on the source and a credit (positive) on the destination.

### Balance Calculation
- Account total = sum of all transactions for that account.
- Deposit balance = sum of transactions where `bucket = 'deposit'`.
- Saving balance = sum of transactions where `bucket = 'saving'`.
- Dashboard totals convert all accounts to OMR (or USD) using live rates.

### Loans from Savings
Users can take a loan against their savings:

- **Request a Loan**: Select a source account (saving bucket) and a destination account (deposit bucket), then enter an amount (cannot exceed the source account's saving balance).
- Creates a withdrawal transaction from the source account's saving bucket, a deposit transaction into the destination account's deposit bucket, and a Loan record with the principal and balance.
- **Repayment**: Partial or full repayments can be made at any time.
- Each repayment deposits back into the source account's saving bucket and withdraws from the destination account's deposit bucket, and creates a LoanRepayment record.
- Outstanding balance = `principal − sum(repayments)`.
- The Loan's `balance` field is also updated for convenience, but the authoritative balance is always computed from repayments.
- **Dashboard**: Outstanding loans are displayed below the top-row cards showing "From → To" with a link to repay.
- Loans with a zero remaining balance are shown as "Settled".

## Goals

### Targets
- **Weekly target** (OMR): How much to save (saving bucket only) per week.
- **Monthly target** (OMR): How much to save per month.

### Progress Calculation
- Saved this week = sum of all saving-bucket transactions (converted to OMR) from Saturday 00:00 to now.
- Saved this month = sum of all saving-bucket transactions (converted to OMR) from the 1st of the month to now.
- Progress = `(saved ÷ target) × 100`.

### History
- **Past Weeks**: Every week from current back to March 1, 2026 (the app's epoch).
- **Past Months**: Every month from current back to March 2026.
- Each period shows: saved amount, target, progress bar, and a checkmark if the target was met.
- A week runs Saturday 00:00 → Friday 23:59:59.999.

## Currency

- All goals, income, and budgets are denominated in **OMR**.
- Savings accounts can be in any of the 8 supported currencies.
- Conversion path: `source → USD → target` using rates from `open.er-api.com`.
- Rates are cached for 1 hour. If the API fails, hardcoded fallback rates are used.
- The dashboard has an OMR/USD toggle that converts all 6 top-row cards.

## Dashboard Summary Cards

| Card | Formula |
|------|---------|
| Total Income | `weeklyAmount × weeksReceived` |
| Total Expenses | Sum of all expense entries where `type ≠ 'set-aside'` |
| Total Deposit | Sum of all deposit-bucket transactions (converted to OMR) |
| Total Saved | Sum of all saving-bucket transactions (converted to OMR) |
| Net | `Income − Expenses` |
| Untracked | `Income − Expenses − Saved(income) − Deposit(income)` — only counts transactions from non-external accounts |

## Week Definition

- A week starts on **Saturday at 00:00:00.000** and ends on **Friday at 23:59:59.999**.
- `getWeekRange(0)` = this week, `getWeekRange(1)` = next week, `getWeekRange(-1)` = last week.
- The `toWeekly()` function normalizes: monthly ÷ 4.33, yearly ÷ 52.

## End-of-2026 Projection

The dashboard projects total expenses until December 31, 2026:
- Fixed payments: `weeklyImpact × weeksLeft`.
- One-time: remaining unpaid amount.
- Future: `estimatedTotal − totalPaid` for each.
