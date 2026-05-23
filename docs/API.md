# API reference (v0.2)

Base: `http://localhost:3000/api`

## Headers (authenticated routes)

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <jwt>` |
| `X-Company-Id` | Yes* | Active company |
| `X-Store-Id` | Store ops | Active store |

## Endpoints

### Auth
- `POST /auth/register` — `{ email, password, displayName }`
- `POST /auth/login`
- `GET /auth/me`

### Company & store
- `POST/GET /companies`
- `POST/GET /stores` (needs `X-Company-Id`)

### Tax & products
- `GET/POST /tax-categories`
- `PATCH /tax-categories/:id`
- `GET/POST /products`, `GET /products/:id`

### Inventory
- `GET /inventory/positions`
- `POST /inventory/inbound` — `{ lines: [{ productId, quantity, unitCost?, serialNumbers? }] }`

### Serials
- `GET /serials` — list by store
- `GET /serials/lookup/:sn` — unit + event history
- `POST /serials`
- `PATCH /serials/:id/status`
- `POST /serials/:id/replace`

### POS
- `GET /pos/orders/today`
- `POST /pos/sales` — `{ lines, paymentMethod, customerId? }` (background receipt PDF archive)
- `GET /pos/orders/:id/receipt` — 80mm HTML receipt (B2C, VAT hidden on print)
- `POST /pos/orders/:id/pdf` — generate & store receipt PDF (`receipts/{companyId}/{orderId}.pdf`)
- `GET /pos/orders/:id/pdf` — download receipt PDF
- `GET /pos/orders/:id/pdf-url` — signed URL when `GCS_BUCKET` is set
- `POST /pos/orders/:id/email` — `{ to }` send receipt PDF (SendGrid or mock log)
- `POST /invoices/:id/email` — `{ to }` send invoice PDF

### CRM
- `GET/POST /customers`, `GET /customers/:id`

### Service (repairs)
- `GET/POST /price-list`, `PATCH /price-list/:id`
- `GET/POST /work-orders`, `GET /work-orders/:id`
- `PATCH /work-orders/:id` — edit quote/lines (draft / in progress)
- `POST /work-orders/:id/transition` — `{ status, paymentOrderId? }`

**Flows:** `in_store` (draft→in_progress→awaiting_payment→completed) · `send_out` (draft→sent_out→in_repair→returned→awaiting_payment→completed)

SMS (Twilio): on `awaiting_payment` (price confirm) and `completed` (ready pickup). Logs to console if Twilio not configured.

### B2B
- `GET /b2b/orders?role=seller|buyer`
- `POST /b2b/orders` — `{ buyerStoreId, lines }`
- `POST /b2b/orders/:id/transition` — `confirmed|shipped|received|invoiced`
- `PATCH /b2b/orders/:id/payment` — offline payment status

### Invoices
- `GET /invoices`, `GET /invoices/:id` — seller view shows VAT; buyer view excludes VAT (margin goods)
- `GET /invoices/:id/print` — HTML print template (JWT + `X-Company-Id`)
- `POST /invoices/:id/pdf` — generate & store PDF (local `data/` or GCS)
- `GET /invoices/:id/pdf` — download PDF bytes
- `GET /invoices/:id/pdf-url` — signed GCS URL (when `GCS_BUCKET` set)

### Transfers (same company, no VAT)
- `GET/POST /transfers`, `POST /transfers/:id/transition`

### Warehouse
- `GET/PUT /warehouse/scope` — allowed buyer stores
- `GET /warehouse/catalog/:warehouseStoreId` — SKU + qty + price (cost vs wholesale)

### Chain
- `GET/POST /chains`, `GET /chains/picker/stores` (cross-company member picker)
- `GET /chains/:id` — detail with member names & share rules
- `PATCH /chains/:id` — `{ name?: string }` rename chain
- `PATCH /chains/:id/members` — `{ storeIds: string[] }` (min 2 stores)
- `POST /chains/:id/share-rules`, `GET /chains/:id/shared-stock`

### Reports
- `GET /reports/daily`, `POST /reports/daily/regenerate`
- `GET /reports/daily/export.csv` — daily summary + receipt line CSV
- `GET /reports/company` — rollup across all stores for the company
- `GET /reports/company/export.csv` — company rollup CSV
- `GET /reports/range/export.csv?from=&to=` — receipt lines across date range (current store)

### Company members & roles
- `POST /companies/:id/members` — `{ email, role, storeId? }` (admin only; `storeId` required for cashier / warehouse_staff)
- `POST /companies/:id/invites` — email invite link (7-day token); returns `inviteUrl`
- `GET /companies/:id/invites` — pending invites (admin; no token in response)
- `DELETE /companies/:id/invites/:inviteId` — revoke pending invite
- `GET /invites/:token` — public preview (no auth)
- `POST /auth/accept-invite` — `{ token }` (JWT; email must match invite)
- Cashier role: store-ops API (POS, catalog, inventory, transfers, work-orders, price-list, repairs intake, etc.); company admin routes denied

### Audit
- `GET /audit?from=&to=&limit=&before=&action=` — `{ events, nextCursor }` with user email/name; cursor via `before` (ISO timestamp)
- `GET /audit/actions?from=&to=` — distinct action types in date range
- `GET /audit/export.csv?from=&to=&action=` — audit events CSV (max 5000 rows)
- `POST /companies/:id/audit/purge` — delete audit older than `auditRetentionDays` (admin); returns `notify` when `AUDIT_PURGE_NOTIFY=1`
- `PATCH /companies/:id/settings` — `{ webhookUrl?, auditRetentionDays?, inviteEmailNote?, inviteEmailNoteZh? }` (notes max 500 chars; locale picks note)
- `POST /companies/:id/invites/preview` — HTML/text preview (no email sent)
- `GET /transfers/:id/pick-list` — printable pick list HTML
- `GET /transfers/:id/pick-list.pdf` — pick list PDF (requires Chromium)
- `GET /companies/:id/webhook/deliveries?event=&status=` — webhook delivery log (admin; filter by event/status)
- `GET /companies/:id/webhook/deliveries/:deliveryId` — single delivery detail (admin)
- `POST /companies/:id/webhook/deliveries/:deliveryId/retry` — redispatch failed delivery (admin)
- `GET /companies/:id/maintenance/status` — audit retention & last company purge (admin)
- Actions include: `pos.sale`, `inventory.inbound`, `b2b.create`, `b2b.transition`, `transfer.create`, `transfer.transition`, `company.invite`, `company.invite_accept`, `company.member_add`, `chain.create`, `chain.rename`, `chain.members`

### Super Admin
- `GET /admin/audit?from=&to=&limit=&before=&action=&companyId=` — cross-tenant audit (requires super admin)
- `GET /admin/companies` — list all companies (super admin)
- `POST /admin/audit/purge?olderThanDays=&companyId=` — purge audit (super admin)
- `POST /admin/maintenance/audit-purge-all` — purge per-company `auditRetentionDays` (super admin)
- `GET /admin/maintenance/status` — auto-purge config & last global purge run (super admin)
- `GET /admin/webhook/deliveries?companyId=&event=&status=` — cross-tenant webhook log (super admin)

### Subscription
- `GET /subscription/plans` — public plan list (auto-seeds defaults)
- `GET /subscription/billing` — current company plan & modules
- `POST /subscription/checkout` — `{ planId, successUrl, cancelUrl }` → Stripe URL (dev: instant activate)
- `POST /subscription/activate-free` — `{ planId }` for free tier
- `POST /subscription/dev/apply-plan` — `{ planId, subscriptionStatus? }` when Stripe is **not** configured (local smoke/dev)
- `POST /subscription/webhook` — Stripe events (raw body)

Feature routes use `SubscriptionGuard` + `@RequireModule(...)` (e.g. `b2b`, `pos`, `warehouse`). Missing module → `403`. Expired subscription (`read_only`) blocks writes but allows GET/export.

### Locale (i18n)
- `PATCH /auth/locale` — `{ locale: "en"|"zh" }` user preference
- `PATCH /companies/:id/locale` — `{ defaultLocale?, enabledLocales?, localeOverrides? }` (admin only)

### Super Admin
- `GET/POST/PATCH /admin/plans` — plan CRUD (`SuperAdminGuard`)
- `POST /admin/plans/seed` — default Free / Pro / Enterprise
- `PATCH /admin/companies/:id/subscription` — override plan & status

### Pre-orders
- `GET/POST /preorders`
- `POST /preorders/:id/deposit` — `{ amount?, paymentMethod? }`
- `POST /preorders/:id/ready`
- `POST /preorders/:id/convert` — balance charged via POS
- `POST /preorders/:id/cancel` — credit note if deposit was paid; sets `cancelled` + webhook `preorder.cancel` / `credit_note.issue`
- `POST /preorders/:id/convert` — balance via POS; status `converted_to_sale` when linked sale exists

### Credit notes
- `GET /credit-notes` — list deposit-refund credit notes (store scope via `X-Store-Id`)
- `GET /credit-notes/:id`
- `GET /credit-notes/:id/print` — 80mm HTML print template

### Webhook extras (company admin)
- `GET /companies/:id/webhook/deliveries/export.csv?event=&status=`
- `POST /companies/:id/webhook/deliveries/retry-failed?event=`
- `POST /companies/:id/invites/preview` — optional `{ locale: "en"|"zh" }` for note language

## Deploy

See [DEPLOY-GCP.md](./DEPLOY-GCP.md) — Docker images, Cloud Run, local `docker compose`.

## Smoke test

```bash
npm run dev:api
npm run test:smoke
npm run test:smoke:phase8
npm run test:smoke:phase9
npm run test:smoke:phase10
npm run test:smoke:phase13
```
