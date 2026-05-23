# LZ3C development roadmap

Phases 1–25 delivered core retail, B2B, subscriptions, audit, webhooks, and admin tooling.

## Completed (26–30)

| Phase | Scope |
|-------|--------|
| **26** | Webhook delivery CSV export, retry-all failed, invite preview `locale` (en/zh) |
| **27** | Credit notes: `GET /credit-notes`, print HTML, web Credit Notes page |
| **28** | Preorder `converted_to_sale` status, preorder/credit-note webhooks & audit |
| **29** | Audit purge HTML email template (`AUDIT_PURGE_NOTIFY=1`) |
| **30** | Integration smoke (`npm run test:smoke:phase30`) |

## Future (not in repo v0.1)

- `apps/worker` + Redis/BullMQ for PDF/SMS/Stripe webhooks
- Full `credit_note` PDF archive like receipts
- Xero/accounting export
- Buyer-view B2B margin invoices as separate doc type
