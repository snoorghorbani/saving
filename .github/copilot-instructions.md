# Copilot Instructions — WealthWise

## Project Context

WealthWise is a personal finance tracker (Next.js 14 static export, Firebase, TypeScript, Tailwind).
Read `docs/README.md` for the full documentation index.

## Documentation Rules

- **Keep docs updated.** When you add, change, or remove a feature, update the relevant file in `docs/`:
  - `docs/big-picture.md` — Architecture, data flow, design decisions.
  - `docs/business-logic.md` — Rules for income, expenses, savings, goals, currency.
  - `docs/data-model.md` — Firestore collections, types, relationships.
  - `docs/pages-and-features.md` — Every page, section, and UI feature.
  - `docs/architecture.md` — Service layer, code organization, patterns.
- If you add a new type, collection, or field, update `docs/data-model.md`.
- If you change a formula or business rule, update `docs/business-logic.md`.
- If you add or modify a page section, update `docs/pages-and-features.md`.
- If you add a new service or change the code structure, update `docs/architecture.md`.

## Code Organization

### Service Layer (`src/lib/services/`)

Business logic MUST live in service files, NOT in page components. Pages should only handle:
- State declarations (`useState`)
- Subscribing to data (`useEffect` with Firestore subscriptions)
- Calling service functions
- Rendering JSX

Use the following service structure:

| Service | Responsibility |
|---------|---------------|
| `src/lib/services/income.ts` | Income calculations (total income, weekly income) |
| `src/lib/services/expenses.ts` | Expense calculations (weekly impact, carryover, projections, due-in-week checks) |
| `src/lib/services/savings.ts` | Savings calculations (bucket totals, currency conversion, week/month aggregation) |
| `src/lib/services/goals.ts` | Goal progress (current week/month, history generation) |

When adding new business logic:
1. Create or update the appropriate service file.
2. Export pure functions that take data in and return results.
3. Import and call from the page component.
4. Do NOT put calculation logic directly in `useEffect` or event handlers.

### Existing Structure

| Path | Purpose |
|------|---------|
| `src/lib/firestore.ts` | Firestore CRUD and real-time subscriptions only |
| `src/lib/utils.ts` | Generic formatting and date helpers |
| `src/lib/currency.ts` | Exchange rate fetching and conversion |
| `src/lib/auth-context.tsx` | Auth provider and hook |
| `src/types/index.ts` | All TypeScript types and interfaces |
| `src/components/` | Reusable UI components |
| `src/app/dashboard/` | Page components (thin — delegate to services) |

## Conventions

- Primary currency: OMR (3 decimal places).
- A week runs Saturday 00:00 to Friday 23:59:59.999.
- Tracking epoch: March 1, 2026 — history should never go before this date.
- Navigation: Use `window.location.href` (not Next.js router) due to static export.
- All Firestore data is scoped to `users/{userId}/`.
- Only the `saving` bucket counts toward weekly/monthly goals.
- Set-aside entries (`type: 'set-aside'`) are excluded from Total Expenses on the dashboard.

## Build & Deploy

```bash
npm run build          # Static export to out/
firebase deploy --only hosting
```

Or use `./deploy.sh` for the full workflow.
