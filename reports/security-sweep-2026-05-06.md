# Security Sweep Report — 2026-05-07

**Endpoints auditados:** 587  
**Issues críticos:** 55  
**Mutations sin rate limit:** 42  
**PII phone exposures:** 47  

---

## A) Mutations sin Rate Limit

| Archivo | API Path | Severity | Auth presente |
|---------|----------|----------|---------------|
| `app/api/admin/log-error/route.ts` | `/api/admin/log-error` | HIGH | NO |
| `app/api/ai/chat/route.ts` | `/api/ai/chat` | HIGH | NO |
| `app/api/assistant/chat/route.ts` | `/api/assistant/chat` | HIGH | NO |
| `app/api/auth/bypass/route.ts` | `/api/auth/bypass` | HIGH | NO |
| `app/api/auth/dni/route.ts` | `/api/auth/dni` | HIGH | NO |
| `app/api/auth/logout/route.ts` | `/api/auth/logout` | HIGH | NO |
| `app/api/auth/me/route.ts` | `/api/auth/me` | HIGH | NO |
| `app/api/auth/otp/verify/route.ts` | `/api/auth/otp/verify` | HIGH | NO |
| `app/api/billing/mp-webhook/route.ts` | `/api/billing/mp-webhook` | HIGH | NO |
| `app/api/billing/webhook/route.ts` | `/api/billing/webhook` | HIGH | NO |
| `app/api/billing/wire-up/ai-hook/route.ts` | `/api/billing/wire-up/ai-hook` | HIGH | NO |
| `app/api/billing/wire-up/sales-hook/route.ts` | `/api/billing/wire-up/sales-hook` | HIGH | NO |
| `app/api/cart/[phone]/route.ts` | `/api/cart/[phone]` | HIGH | NO |
| `app/api/chat/admin/route.ts` | `/api/chat/admin` | MEDIUM | si |
| `app/api/chat/auto-reply/route.ts` | `/api/chat/auto-reply` | HIGH | NO |
| `app/api/chat/public/route.ts` | `/api/chat/public` | HIGH | NO |
| `app/api/contact/route.ts` | `/api/contact` | HIGH | NO |
| `app/api/cron/marketplace-anomaly-detection/route.ts` | `/api/cron/marketplace-anomaly-detection` | HIGH | NO |
| `app/api/cron/marketplace-stockout-predictions/route.ts` | `/api/cron/marketplace-stockout-predictions` | HIGH | NO |
| `app/api/customers/[phone]/ai-analysis/route.ts` | `/api/customers/[phone]/ai-analysis` | MEDIUM | si |
| `app/api/internal/audit-log/route.ts` | `/api/internal/audit-log` | HIGH | NO |
| `app/api/locations/route.ts` | `/api/locations` | MEDIUM | si |
| `app/api/ocr/invoice/route.ts` | `/api/ocr/invoice` | HIGH | NO |
| `app/api/prestamos/cron/mora/route.ts` | `/api/prestamos/cron/mora` | HIGH | NO |
| `app/api/prestamos/cron/recordatorios/route.ts` | `/api/prestamos/cron/recordatorios` | HIGH | NO |
| `app/api/presupuesto/route.ts` | `/api/presupuesto` | HIGH | NO |
| `app/api/products/[id]/notify-restock/route.ts` | `/api/products/[id]/notify-restock` | HIGH | NO |
| `app/api/products/route.ts` | `/api/products` | HIGH | NO |
| `app/api/referrals/stores/route.ts` | `/api/referrals/stores` | MEDIUM | si |
| `app/api/reviews/[id]/route.ts` | `/api/reviews/[id]` | MEDIUM | si |
| `app/api/shopping-lists/[id]/route.ts` | `/api/shopping-lists/[id]` | HIGH | NO |
| `app/api/superadmin/page-heroes/[id]/route.ts` | `/api/superadmin/page-heroes/[id]` | MEDIUM | si |
| `app/api/superadmin/page-heroes/route.ts` | `/api/superadmin/page-heroes` | MEDIUM | si |
| `app/api/supplier/auth/route.ts` | `/api/supplier/auth` | HIGH | NO |
| `app/api/supplier/catalog/route.ts` | `/api/supplier/catalog` | HIGH | NO |
| `app/api/supplier/offers/route.ts` | `/api/supplier/offers` | HIGH | NO |
| `app/api/webhooks/nubefact/route.ts` | `/api/webhooks/nubefact` | HIGH | NO |
| `app/api/webhooks/whatsapp/route.ts` | `/api/webhooks/whatsapp` | HIGH | NO |
| `app/api/whatsapp/concierge/route.ts` | `/api/whatsapp/concierge` | HIGH | NO |
| `app/api/whatsapp/voice/route.ts` | `/api/whatsapp/voice` | HIGH | NO |
| `app/api/whatsapp/webhook/route.ts` | `/api/whatsapp/webhook` | HIGH | NO |
| `app/api/workers/[job]/route.ts` | `/api/workers/[job]` | HIGH | NO |

---

## B) Sin Auth + Sin Rate Limit (no allowlisted)

| Archivo | API Path | Severity |
|---------|----------|----------|
| `app/api/abandoned-cart/mine/route.ts` | `/api/abandoned-cart/mine` | CRITICAL |
| `app/api/agents/health/route.ts` | `/api/agents/health` | CRITICAL |
| `app/api/ai/chat/route.ts` | `/api/ai/chat` | CRITICAL |
| `app/api/ai/status/route.ts` | `/api/ai/status` | CRITICAL |
| `app/api/assistant/chat/route.ts` | `/api/assistant/chat` | CRITICAL |
| `app/api/billing/mp-webhook/route.ts` | `/api/billing/mp-webhook` | CRITICAL |
| `app/api/billing/webhook/route.ts` | `/api/billing/webhook` | CRITICAL |
| `app/api/billing/webhook-replay/route.ts` | `/api/billing/webhook-replay` | CRITICAL |
| `app/api/billing/wire-up/ai-hook/route.ts` | `/api/billing/wire-up/ai-hook` | CRITICAL |
| `app/api/billing/wire-up/sales-hook/route.ts` | `/api/billing/wire-up/sales-hook` | CRITICAL |
| `app/api/chat/auto-reply/route.ts` | `/api/chat/auto-reply` | CRITICAL |
| `app/api/chat/public/route.ts` | `/api/chat/public` | CRITICAL |
| `app/api/customer/intelligence/route.ts` | `/api/customer/intelligence` | CRITICAL |
| `app/api/customers/geo/route.ts` | `/api/customers/geo` | CRITICAL |
| `app/api/daily-digest/route.ts` | `/api/daily-digest` | CRITICAL |
| `app/api/docs/openapi.json/route.ts` | `/api/docs/openapi.json` | CRITICAL |
| `app/api/gift-cards/[id]/route.ts` | `/api/gift-cards/[id]` | CRITICAL |
| `app/api/internal/audit-log/route.ts` | `/api/internal/audit-log` | CRITICAL |
| `app/api/inventory/stock-prediction/route.ts` | `/api/inventory/stock-prediction` | CRITICAL |
| `app/api/lives/[id]/route.ts` | `/api/lives/[id]` | CRITICAL |
| `app/api/ocr/invoice/route.ts` | `/api/ocr/invoice` | CRITICAL |
| `app/api/platform/activity/route.ts` | `/api/platform/activity` | CRITICAL |
| `app/api/platform/stats/route.ts` | `/api/platform/stats` | CRITICAL |
| `app/api/prestamos/cron/mora/route.ts` | `/api/prestamos/cron/mora` | CRITICAL |
| `app/api/prestamos/cron/recordatorios/route.ts` | `/api/prestamos/cron/recordatorios` | CRITICAL |
| `app/api/presupuesto/route.ts` | `/api/presupuesto` | CRITICAL |
| `app/api/public/tracking/[token]/route.ts` | `/api/public/tracking/[token]` | CRITICAL |
| `app/api/purchases/frequent-items/route.ts` | `/api/purchases/frequent-items` | CRITICAL |
| `app/api/recommender/hybrid/route.ts` | `/api/recommender/hybrid` | CRITICAL |
| `app/api/shopping-lists/[id]/route.ts` | `/api/shopping-lists/[id]` | CRITICAL |
| `app/api/socio-buleje/cashback/route.ts` | `/api/socio-buleje/cashback` | CRITICAL |
| `app/api/socio-buleje/status/route.ts` | `/api/socio-buleje/status` | CRITICAL |
| `app/api/stats/live/route.ts` | `/api/stats/live` | CRITICAL |
| `app/api/store-page/public/[slug]/route.ts` | `/api/store-page/public/[slug]` | CRITICAL |
| `app/api/store-page/public-catalog/route.ts` | `/api/store-page/public-catalog` | CRITICAL |
| `app/api/superadmin/costs/route.ts` | `/api/superadmin/costs` | CRITICAL |
| `app/api/superadmin/health/route.ts` | `/api/superadmin/health` | CRITICAL |
| `app/api/superadmin/marketplace/coupons/route.ts` | `/api/superadmin/marketplace/coupons` | CRITICAL |
| `app/api/superadmin/marketplace/orders/route.ts` | `/api/superadmin/marketplace/orders` | CRITICAL |
| `app/api/superadmin/notifications/route.ts` | `/api/superadmin/notifications` | CRITICAL |
| `app/api/superadmin/security/route.ts` | `/api/superadmin/security` | CRITICAL |
| `app/api/superadmin/tenants/[slug]/products/route.ts` | `/api/superadmin/tenants/[slug]/products` | CRITICAL |
| `app/api/superadmin/vendor-applications/stats/route.ts` | `/api/superadmin/vendor-applications/stats` | CRITICAL |
| `app/api/supplier/alerts/route.ts` | `/api/supplier/alerts` | CRITICAL |
| `app/api/supplier/auth/route.ts` | `/api/supplier/auth` | CRITICAL |
| `app/api/supplier/catalog/route.ts` | `/api/supplier/catalog` | CRITICAL |
| `app/api/supplier/dashboard/route.ts` | `/api/supplier/dashboard` | CRITICAL |
| `app/api/supplier/offers/route.ts` | `/api/supplier/offers` | CRITICAL |
| `app/api/supplier/orders/route.ts` | `/api/supplier/orders` | CRITICAL |
| `app/api/supplier/rating/route.ts` | `/api/supplier/rating` | CRITICAL |
| `app/api/track/[orderId]/route.ts` | `/api/track/[orderId]` | CRITICAL |
| `app/api/whatsapp/concierge/route.ts` | `/api/whatsapp/concierge` | CRITICAL |
| `app/api/whatsapp/voice/route.ts` | `/api/whatsapp/voice` | CRITICAL |
| `app/api/whatsapp/webhook/route.ts` | `/api/whatsapp/webhook` | CRITICAL |
| `app/api/workers/[job]/route.ts` | `/api/workers/[job]` | CRITICAL |

---

## C) GET con posible PII phone sin mascarar

| Archivo | API Path | Severity | Auth presente |
|---------|----------|----------|---------------|
| `app/api/admin/dashboard/route.ts` | `/api/admin/dashboard` | MEDIUM | si |
| `app/api/admin/overview/route.ts` | `/api/admin/overview` | MEDIUM | si |
| `app/api/analytics/clv/route.ts` | `/api/analytics/clv` | MEDIUM | si |
| `app/api/analytics/kpis-v2/route.ts` | `/api/analytics/kpis-v2` | MEDIUM | si |
| `app/api/analytics/rfm/route.ts` | `/api/analytics/rfm` | MEDIUM | si |
| `app/api/cart/[phone]/route.ts` | `/api/cart/[phone]` | MEDIUM | NO |
| `app/api/chat/marketplace/route.ts` | `/api/chat/marketplace` | MEDIUM | si |
| `app/api/chat/public/route.ts` | `/api/chat/public` | MEDIUM | NO |
| `app/api/cron/abandoned-cart/route.ts` | `/api/cron/abandoned-cart` | MEDIUM | NO |
| `app/api/cron/first-purchase-coupon/route.ts` | `/api/cron/first-purchase-coupon` | MEDIUM | NO |
| `app/api/cron/inactive-customers/route.ts` | `/api/cron/inactive-customers` | MEDIUM | NO |
| `app/api/cron/marketplace-abandoned-carts/route.ts` | `/api/cron/marketplace-abandoned-carts` | MEDIUM | NO |
| `app/api/cron/price-drop-alerts/route.ts` | `/api/cron/price-drop-alerts` | MEDIUM | NO |
| `app/api/cron/recompra-coupon/route.ts` | `/api/cron/recompra-coupon` | MEDIUM | NO |
| `app/api/cron/reorder-reminders/route.ts` | `/api/cron/reorder-reminders` | MEDIUM | NO |
| `app/api/customer/data/route.ts` | `/api/customer/data` | MEDIUM | si |
| `app/api/customer/intelligence/route.ts` | `/api/customer/intelligence` | MEDIUM | NO |
| `app/api/customer-notifications/route.ts` | `/api/customer-notifications` | MEDIUM | si |
| `app/api/customers/[phone]/estado-cuenta/route.ts` | `/api/customers/[phone]/estado-cuenta` | MEDIUM | si |
| `app/api/customers/[phone]/favorite-products/route.ts` | `/api/customers/[phone]/favorite-products` | MEDIUM | NO |
| `app/api/customers/[phone]/last-purchase/route.ts` | `/api/customers/[phone]/last-purchase` | MEDIUM | si |
| `app/api/customers/[phone]/route.ts` | `/api/customers/[phone]` | MEDIUM | si |
| `app/api/customers/[phone]/timeline/route.ts` | `/api/customers/[phone]/timeline` | MEDIUM | si |
| `app/api/customers/rfm/route.ts` | `/api/customers/rfm` | MEDIUM | si |
| `app/api/documentos-emitidos/route.ts` | `/api/documentos-emitidos` | MEDIUM | si |
| `app/api/email-automation/route.ts` | `/api/email-automation` | MEDIUM | NO |
| `app/api/loyalty/[phone]/route.ts` | `/api/loyalty/[phone]` | MEDIUM | si |
| `app/api/loyalty/redeem/route.ts` | `/api/loyalty/redeem` | MEDIUM | si |
| `app/api/me/addresses/route.ts` | `/api/me/addresses` | MEDIUM | si |
| `app/api/me/dashboard/route.ts` | `/api/me/dashboard` | MEDIUM | si |
| `app/api/me/notifications/route.ts` | `/api/me/notifications` | MEDIUM | si |
| `app/api/me/order-history/route.ts` | `/api/me/order-history` | MEDIUM | si |
| `app/api/me/referral-status/route.ts` | `/api/me/referral-status` | MEDIUM | si |
| `app/api/me/spending-summary/route.ts` | `/api/me/spending-summary` | MEDIUM | si |
| `app/api/orders/[id]/public/route.ts` | `/api/orders/[id]/public` | MEDIUM | NO |
| `app/api/orders/[id]/route.ts` | `/api/orders/[id]` | MEDIUM | si |
| `app/api/orders/csv/route.ts` | `/api/orders/csv` | MEDIUM | si |
| `app/api/orders/route.ts` | `/api/orders` | MEDIUM | si |
| `app/api/recommendations/route.ts` | `/api/recommendations` | MEDIUM | NO |
| `app/api/returns/route.ts` | `/api/returns` | MEDIUM | si |
| `app/api/sales/[id]/route.ts` | `/api/sales/[id]` | MEDIUM | si |
| `app/api/sales/export/route.ts` | `/api/sales/export` | MEDIUM | si |
| `app/api/sales/route.ts` | `/api/sales` | MEDIUM | si |
| `app/api/shopping-lists/[id]/route.ts` | `/api/shopping-lists/[id]` | MEDIUM | NO |
| `app/api/shopping-lists/route.ts` | `/api/shopping-lists` | MEDIUM | NO |
| `app/api/stats/live/route.ts` | `/api/stats/live` | MEDIUM | NO |
| `app/api/superadmin/marketplace/orders/route.ts` | `/api/superadmin/marketplace/orders` | MEDIUM | NO |

---

> Generado por `scripts/audit-security-sweep.mjs`