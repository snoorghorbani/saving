# WealthWise — Documentation

WealthWise is a personal finance tracker built for managing income, expenses, savings, and financial goals. It runs as a static web app on Firebase Hosting.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Big Picture](./big-picture.md) | High-level overview, architecture, and data flow |
| [Business Logic](./business-logic.md) | Detailed rules for expenses, savings, goals, and currency |
| [Data Model](./data-model.md) | Firestore collections, types, and relationships |
| [Pages & Features](./pages-and-features.md) | Every page, section, and user-facing feature |
| [Architecture](./architecture.md) | Service layer, code organization, and patterns |

## Quick Facts

- **Stack**: Next.js 14 (static export) · Firebase (Auth, Firestore, Hosting) · Tailwind CSS · TypeScript
- **Auth**: Google sign-in only
- **Primary currency**: OMR (Omani Rial, 3 decimal places)
- **Supported currencies**: OMR, USD, EUR, TRY, GBP, AED, SAR, INR
- **Domain**: saving.soushians.com
- **Firebase project**: `soushians-4d02a`
- **Tracking start date**: March 1, 2026
