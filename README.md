# LZ3C — 3C Retail & Service SaaS

Architecture and domain design for a multi-tenant platform (Ireland-first, global-ready).

## Docs

- [Architecture & domain design](./docs/ARCHITECTURE.md) — tech stack, modules, ER, state machines, MongoDB, API map
- [API reference](./docs/API.md)
- [Domain glossary](./docs/DOMAIN-GLOSSARY.md)

## Status

Phase 1–30 core: retail, repairs, pre-orders, **B2B + dual invoices**, **transfers**, **warehouse UI**, **chain UI**, **daily + company reports**, **Stripe/dev subscription**, **Super Admin plans**, **invoice HTML + PDF** (local/GCS), **POS 80mm receipt HTML + PDF**, **chain cross-company store picker** + **member edit**, **i18n (en/zh)**, **Docker + GCP Cloud Run deploy**, **subscription module guards**, **Layout context dropdowns**, **Dashboard billing summary**, **auto receipt PDF on sale**, **B2B order-linked invoice PDF**, **chain rename & member remove**, **report CSV export**, **store roles (cashier POS-only)**, **email PDF (SendGrid/mock)**, **member email invites**, **date-range CSV**, **audit log**, **pending invites**, **audit filter & super-admin audit**, **HTML invite email**, **transfer UI**, **pick-list print/PDF**, **invite preview & confirm**, **webhooks + delivery log & retry**, **invite note en/zh**, **webhook filter/detail/CSV/retry-all**, **credit notes**, **preorder convert webhooks**, **audit purge HTML notify**, **super-admin maintenance**.

**Verified:**
- `npm run test:smoke` — retail flow
- `npm run test:smoke:phase4` — work order `WO-*`, preorder `PRE-*`
- `npm run test:smoke:phase6` — B2B `B2B-*`, invoice VAT, transfer `TR-*`
- `npm run test:smoke:phase8` — plans, free activate, billing, invoice print, company report
- `npm run test:smoke:phase9` — warehouse catalog, chain shared stock
- `npm run test:smoke:phase10` — user/company locale API
- `npm run test:smoke:phase12` — invoice PDF (skips if no Chromium)
- `npm run test:smoke:phase13` — receipt HTML + chain member stores
- `npm run test:smoke:phase14` — module guard (free vs enterprise B2B) + read-only writes
- `npm run test:smoke:phase15` — receipt PDF + chain member PATCH (PDF skips if no Chromium)
- `npm run test:smoke:phase16` — auto receipt PDF on sale, B2B invoice PDF, chain rename
- `npm run test:smoke:phase17` — CSV export, cashier RBAC, email mock
- `npm run test:smoke:phase18` — invites, range CSV, audit log
- `npm run test:smoke:phase19` — invite list/revoke, audit enrichment & pagination
- `npm run test:smoke:phase20` — HTML invite, audit filter, transfer flow, admin audit
- `npm run test:smoke:phase21` — audit CSV, transfer cancel/multi-line, invite locale
- `npm run test:smoke:phase22` — pick list, invite preview, webhook, audit purge
- `npm run test:smoke:phase23` — webhook deliveries, pick-list PDF, maintenance purge
- `npm run test:smoke:phase24` — webhook retry, invite note, maintenance status, admin webhooks
- `npm run test:smoke:phase25` — webhook filter/detail, invite note zh, purge notify
- `npm run test:smoke:phase26` — webhook CSV, retry-all, invite preview locale
- `npm run test:smoke:phase27` — credit notes list & print
- `npm run test:smoke:phase28` — preorder converted_to_sale + webhooks
- `npm run test:smoke:phase29` — audit purge HTML notify
- `npm run test:smoke:phase30` — integration (26–29)

See [docs/ROADMAP.md](./docs/ROADMAP.md) for future work (worker/queue, accounting export).

## Setup

```bash
cp .env.example .env.local   # edit MONGODB_URI
npm install
npm run test:mongo
npm run dev:api    # http://localhost:3000/api/health
npm run dev:web    # http://localhost:5173
```

## Docker (local production-like)

```bash
npm run docker:up    # API :3000, Web :8080
npm run docker:down
```

See [Deploy to GCP](./docs/DEPLOY-GCP.md) for Cloud Run + Artifact Registry.

## Quick stack

- **Monorepo:** npm workspaces
- **API:** NestJS + TypeScript + Mongoose + MongoDB Atlas
- **Web:** React + Vite + TanStack Query
- **Billing:** Stripe (dev mode: activate free / instant checkout without keys)
- **SMS:** Twilio (planned)
- **Deploy:** `infra/Dockerfile` (API) + `infra/Dockerfile.web` (nginx SPA) → GCP Cloud Run — see [docs/DEPLOY-GCP.md](./docs/DEPLOY-GCP.md)
