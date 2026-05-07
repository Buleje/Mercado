# Security Sweep Report — 2026-05-07

**Endpoints auditados:** 677  
**Issues críticos:** 135  
**Mutations sin rate limit:** 289  
**PII phone exposures:** 54  

---

## A) Mutations sin Rate Limit

| Archivo | API Path | Severity | Auth presente |
|---------|----------|----------|---------------|
| `app/api/ab-tests/events/route.ts` | `/api/ab-tests/events` | HIGH | NO |
| `app/api/ab-tests/route.ts` | `/api/ab-tests` | MEDIUM | si |
| `app/api/activity-log/route.ts` | `/api/activity-log` | MEDIUM | si |
| `app/api/admin/2fa/setup/route.ts` | `/api/admin/2fa/setup` | MEDIUM | si |
| `app/api/admin/2fa/verify/route.ts` | `/api/admin/2fa/verify` | MEDIUM | si |
| `app/api/admin/alerts/stock-critical/route.ts` | `/api/admin/alerts/stock-critical` | MEDIUM | si |
| `app/api/admin/chat/route.ts` | `/api/admin/chat` | MEDIUM | si |
| `app/api/admin/chat/threads/[threadId]/messages/route.ts` | `/api/admin/chat/threads/[threadId]/messages` | MEDIUM | si |
| `app/api/admin/chat/threads/route.ts` | `/api/admin/chat/threads` | MEDIUM | si |
| `app/api/admin/clear-data/route.ts` | `/api/admin/clear-data` | MEDIUM | si |
| `app/api/admin/content-calendar/route.ts` | `/api/admin/content-calendar` | MEDIUM | si |
| `app/api/admin/cron-dead-letters/route.ts` | `/api/admin/cron-dead-letters` | MEDIUM | si |
| `app/api/admin/demo-products/route.ts` | `/api/admin/demo-products` | MEDIUM | si |
| `app/api/admin/driver-applications/route.ts` | `/api/admin/driver-applications` | MEDIUM | si |
| `app/api/admin/gift-cards/[id]/cancel/route.ts` | `/api/admin/gift-cards/[id]/cancel` | MEDIUM | si |
| `app/api/admin/gift-cards/issue-manual/route.ts` | `/api/admin/gift-cards/issue-manual` | MEDIUM | si |
| `app/api/admin/import-data/route.ts` | `/api/admin/import-data` | MEDIUM | si |
| `app/api/admin/inventory/reorder/route.ts` | `/api/admin/inventory/reorder` | MEDIUM | si |
| `app/api/admin/invitations/[id]/revoke/route.ts` | `/api/admin/invitations/[id]/revoke` | MEDIUM | si |
| `app/api/admin/invitations/route.ts` | `/api/admin/invitations` | MEDIUM | si |
| `app/api/admin/lives/[id]/end/route.ts` | `/api/admin/lives/[id]/end` | MEDIUM | si |
| `app/api/admin/lives/[id]/products/route.ts` | `/api/admin/lives/[id]/products` | MEDIUM | si |
| `app/api/admin/lives/[id]/start/route.ts` | `/api/admin/lives/[id]/start` | MEDIUM | si |
| `app/api/admin/lives/route.ts` | `/api/admin/lives` | MEDIUM | si |
| `app/api/admin/log-error/route.ts` | `/api/admin/log-error` | HIGH | NO |
| `app/api/admin/plan/checkout/confirm/route.ts` | `/api/admin/plan/checkout/confirm` | MEDIUM | si |
| `app/api/admin/plan/checkout/stripe-session/route.ts` | `/api/admin/plan/checkout/stripe-session` | MEDIUM | si |
| `app/api/admin/plan/mock-activate/route.ts` | `/api/admin/plan/mock-activate` | MEDIUM | si |
| `app/api/admin/preferences/route.ts` | `/api/admin/preferences` | MEDIUM | si |
| `app/api/admin/products/[id]/import-from-catalog/route.ts` | `/api/admin/products/[id]/import-from-catalog` | MEDIUM | si |
| `app/api/admin/products/bulk-import/route.ts` | `/api/admin/products/bulk-import` | MEDIUM | si |
| `app/api/admin/recetario/[id]/route.ts` | `/api/admin/recetario/[id]` | MEDIUM | si |
| `app/api/admin/recetario/route.ts` | `/api/admin/recetario` | MEDIUM | si |
| `app/api/admin/reviews/[reviewId]/route.ts` | `/api/admin/reviews/[reviewId]` | MEDIUM | si |
| `app/api/admin/seed-data/route.ts` | `/api/admin/seed-data` | MEDIUM | si |
| `app/api/admin/seed-peru-products/route.ts` | `/api/admin/seed-peru-products` | MEDIUM | si |
| `app/api/admin/setup-marketplace-store/route.ts` | `/api/admin/setup-marketplace-store` | MEDIUM | si |
| `app/api/admin/store-reviews/route.ts` | `/api/admin/store-reviews` | MEDIUM | si |
| `app/api/admin/warehouse-transfers/route.ts` | `/api/admin/warehouse-transfers` | MEDIUM | si |
| `app/api/admin/warehouses/route.ts` | `/api/admin/warehouses` | MEDIUM | si |
| `app/api/admin/whatsapp-config/route.ts` | `/api/admin/whatsapp-config` | MEDIUM | si |
| `app/api/admin-chat/route.ts` | `/api/admin-chat` | MEDIUM | si |
| `app/api/admin-users/[id]/route.ts` | `/api/admin-users/[id]` | MEDIUM | si |
| `app/api/agents/[taskId]/route.ts` | `/api/agents/[taskId]` | MEDIUM | si |
| `app/api/agents/execute/route.ts` | `/api/agents/execute` | MEDIUM | si |
| `app/api/agents/route.ts` | `/api/agents` | MEDIUM | si |
| `app/api/ai-assistant/conversation/route.ts` | `/api/ai-assistant/conversation` | MEDIUM | si |
| `app/api/ai-assistant/feedback/route.ts` | `/api/ai-assistant/feedback` | MEDIUM | si |
| `app/api/ai-assistant/history/route.ts` | `/api/ai-assistant/history` | MEDIUM | si |
| `app/api/analytics/track/route.ts` | `/api/analytics/track` | HIGH | NO |
| `app/api/api-keys/route.ts` | `/api/api-keys` | HIGH | NO |
| `app/api/asistente/chat/route.ts` | `/api/asistente/chat` | HIGH | NO |
| `app/api/assistant/chat/route.ts` | `/api/assistant/chat` | HIGH | NO |
| `app/api/auth/bypass/route.ts` | `/api/auth/bypass` | HIGH | NO |
| `app/api/auth/dni/route.ts` | `/api/auth/dni` | HIGH | NO |
| `app/api/auth/logout/route.ts` | `/api/auth/logout` | HIGH | NO |
| `app/api/auth/me/route.ts` | `/api/auth/me` | HIGH | NO |
| `app/api/beta-feedback/route.ts` | `/api/beta-feedback` | HIGH | NO |
| `app/api/billing/checkout/route.ts` | `/api/billing/checkout` | MEDIUM | si |
| `app/api/billing/meter/route.ts` | `/api/billing/meter` | MEDIUM | si |
| `app/api/billing/mp-cancel/route.ts` | `/api/billing/mp-cancel` | MEDIUM | si |
| `app/api/billing/mp-checkout/route.ts` | `/api/billing/mp-checkout` | MEDIUM | si |
| `app/api/billing/mp-subscribe/route.ts` | `/api/billing/mp-subscribe` | MEDIUM | si |
| `app/api/billing/mp-webhook/route.ts` | `/api/billing/mp-webhook` | HIGH | NO |
| `app/api/billing/portal/route.ts` | `/api/billing/portal` | MEDIUM | si |
| `app/api/billing/webhook/route.ts` | `/api/billing/webhook` | HIGH | NO |
| `app/api/billing/webhook-queue/route.ts` | `/api/billing/webhook-queue` | MEDIUM | si |
| `app/api/billing/wire-up/ai-hook/route.ts` | `/api/billing/wire-up/ai-hook` | HIGH | NO |
| `app/api/billing/wire-up/sales-hook/route.ts` | `/api/billing/wire-up/sales-hook` | HIGH | NO |
| `app/api/birthday-coupons/route.ts` | `/api/birthday-coupons` | HIGH | NO |
| `app/api/bundles/[id]/route.ts` | `/api/bundles/[id]` | MEDIUM | si |
| `app/api/bundles/route.ts` | `/api/bundles` | MEDIUM | si |
| `app/api/campaigns/notify/route.ts` | `/api/campaigns/notify` | MEDIUM | si |
| `app/api/campaigns/route.ts` | `/api/campaigns` | MEDIUM | si |
| `app/api/cart/[phone]/route.ts` | `/api/cart/[phone]` | HIGH | NO |
| `app/api/cash-registers/[id]/route.ts` | `/api/cash-registers/[id]` | MEDIUM | si |
| `app/api/cash-registers/close-shift/route.ts` | `/api/cash-registers/close-shift` | MEDIUM | si |
| `app/api/cash-registers/movements/route.ts` | `/api/cash-registers/movements` | MEDIUM | si |
| `app/api/chat/admin/route.ts` | `/api/chat/admin` | MEDIUM | si |
| `app/api/chat/auto-reply/route.ts` | `/api/chat/auto-reply` | HIGH | NO |
| `app/api/chat/public/route.ts` | `/api/chat/public` | HIGH | NO |
| `app/api/cms/media/route.ts` | `/api/cms/media` | MEDIUM | si |
| `app/api/cms/pages/[id]/blocks/route.ts` | `/api/cms/pages/[id]/blocks` | MEDIUM | si |
| `app/api/cms/pages/[id]/publish/route.ts` | `/api/cms/pages/[id]/publish` | MEDIUM | si |
| `app/api/cms/pages/[id]/route.ts` | `/api/cms/pages/[id]` | MEDIUM | si |
| `app/api/cms/pages/route.ts` | `/api/cms/pages` | MEDIUM | si |
| `app/api/commission-rules/route.ts` | `/api/commission-rules` | MEDIUM | si |
| `app/api/commissions/ledger/route.ts` | `/api/commissions/ledger` | MEDIUM | si |
| `app/api/compliance/access-log/route.ts` | `/api/compliance/access-log` | MEDIUM | si |
| `app/api/compliance/breach-report/route.ts` | `/api/compliance/breach-report` | MEDIUM | si |
| `app/api/compliance/consent/route.ts` | `/api/compliance/consent` | MEDIUM | si |
| `app/api/compliance/data-delete/route.ts` | `/api/compliance/data-delete` | MEDIUM | si |
| `app/api/compliance/data-export/route.ts` | `/api/compliance/data-export` | MEDIUM | si |
| `app/api/compliance/route.ts` | `/api/compliance` | MEDIUM | si |
| `app/api/compras/recepciones/route.ts` | `/api/compras/recepciones` | MEDIUM | si |
| `app/api/contact/route.ts` | `/api/contact` | HIGH | NO |
| `app/api/contratos/[id]/route.ts` | `/api/contratos/[id]` | MEDIUM | si |
| `app/api/contratos/export/route.ts` | `/api/contratos/export` | MEDIUM | si |
| `app/api/contratos/route.ts` | `/api/contratos` | MEDIUM | si |
| `app/api/cotizaciones/[id]/convertir/route.ts` | `/api/cotizaciones/[id]/convertir` | MEDIUM | si |
| `app/api/cotizaciones/[id]/route.ts` | `/api/cotizaciones/[id]` | MEDIUM | si |
| `app/api/cotizaciones/route.ts` | `/api/cotizaciones` | MEDIUM | si |
| `app/api/coupons/route.ts` | `/api/coupons` | MEDIUM | si |
| `app/api/credit/check/route.ts` | `/api/credit/check` | MEDIUM | si |
| `app/api/credit/create-plan/route.ts` | `/api/credit/create-plan` | MEDIUM | si |
| `app/api/credit/pay/route.ts` | `/api/credit/pay` | MEDIUM | si |
| `app/api/credit/profile/[customerId]/route.ts` | `/api/credit/profile/[customerId]` | MEDIUM | si |
| `app/api/cron/marketplace-anomaly-detection/route.ts` | `/api/cron/marketplace-anomaly-detection` | HIGH | NO |
| `app/api/cron/marketplace-stockout-predictions/route.ts` | `/api/cron/marketplace-stockout-predictions` | HIGH | NO |
| `app/api/custom-kpis/route.ts` | `/api/custom-kpis` | MEDIUM | si |
| `app/api/customer/data/route.ts` | `/api/customer/data` | MEDIUM | si |
| `app/api/customers/[phone]/ai-analysis/route.ts` | `/api/customers/[phone]/ai-analysis` | MEDIUM | si |
| `app/api/demand-prediction/route.ts` | `/api/demand-prediction` | MEDIUM | si |
| `app/api/discount-rules/[id]/route.ts` | `/api/discount-rules/[id]` | MEDIUM | si |
| `app/api/discount-rules/route.ts` | `/api/discount-rules` | MEDIUM | si |
| `app/api/expenses/route.ts` | `/api/expenses` | MEDIUM | si |
| `app/api/fiados/[id]/pagar/route.ts` | `/api/fiados/[id]/pagar` | MEDIUM | si |
| `app/api/fiados/[id]/route.ts` | `/api/fiados/[id]` | MEDIUM | si |
| `app/api/fiados/cobrar/route.ts` | `/api/fiados/cobrar` | MEDIUM | si |
| `app/api/fiados/cobro-masivo/route.ts` | `/api/fiados/cobro-masivo` | MEDIUM | si |
| `app/api/fiados/route.ts` | `/api/fiados` | MEDIUM | si |
| `app/api/forecasting/auto-reorder/route.ts` | `/api/forecasting/auto-reorder` | MEDIUM | si |
| `app/api/fridge-scan/route.ts` | `/api/fridge-scan` | HIGH | NO |
| `app/api/goals/[id]/route.ts` | `/api/goals/[id]` | MEDIUM | si |
| `app/api/goals/route.ts` | `/api/goals` | MEDIUM | si |
| `app/api/guias-remision/[id]/route.ts` | `/api/guias-remision/[id]` | MEDIUM | si |
| `app/api/guias-remision/route.ts` | `/api/guias-remision` | MEDIUM | si |
| `app/api/internal/audit-log/route.ts` | `/api/internal/audit-log` | HIGH | NO |
| `app/api/inventory/conteo/[id]/close/route.ts` | `/api/inventory/conteo/[id]/close` | MEDIUM | si |
| `app/api/inventory/conteo/[id]/items/route.ts` | `/api/inventory/conteo/[id]/items` | MEDIUM | si |
| `app/api/inventory/conteo/route.ts` | `/api/inventory/conteo` | MEDIUM | si |
| `app/api/inventory/expiry/route.ts` | `/api/inventory/expiry` | MEDIUM | si |
| `app/api/inventory/import-csv/route.ts` | `/api/inventory/import-csv` | MEDIUM | si |
| `app/api/inventory-movements/route.ts` | `/api/inventory-movements` | MEDIUM | si |
| `app/api/invite/route.ts` | `/api/invite` | HIGH | NO |
| `app/api/invoices/boleta/route.ts` | `/api/invoices/boleta` | MEDIUM | si |
| `app/api/invoices/sunat/route.ts` | `/api/invoices/sunat` | MEDIUM | si |
| `app/api/locations/route.ts` | `/api/locations` | MEDIUM | si |
| `app/api/loyalty/auto-earn/route.ts` | `/api/loyalty/auto-earn` | MEDIUM | si |
| `app/api/loyalty/redeem/route.ts` | `/api/loyalty/redeem` | MEDIUM | si |
| `app/api/loyalty/referral/route.ts` | `/api/loyalty/referral` | HIGH | NO |
| `app/api/me/addresses/route.ts` | `/api/me/addresses` | MEDIUM | si |
| `app/api/me/notifications/route.ts` | `/api/me/notifications` | MEDIUM | si |
| `app/api/me/reorder/[orderId]/route.ts` | `/api/me/reorder/[orderId]` | MEDIUM | si |
| `app/api/notas-credito/[id]/route.ts` | `/api/notas-credito/[id]` | MEDIUM | si |
| `app/api/notas-credito/route.ts` | `/api/notas-credito` | MEDIUM | si |
| `app/api/notification-center/[id]/read/route.ts` | `/api/notification-center/[id]/read` | MEDIUM | si |
| `app/api/notification-center/read-all/route.ts` | `/api/notification-center/read-all` | MEDIUM | si |
| `app/api/notifications/route.ts` | `/api/notifications` | MEDIUM | si |
| `app/api/ocr/invoice/route.ts` | `/api/ocr/invoice` | HIGH | NO |
| `app/api/onboarding/complete/route.ts` | `/api/onboarding/complete` | MEDIUM | si |
| `app/api/onboarding/import-catalog/route.ts` | `/api/onboarding/import-catalog` | MEDIUM | si |
| `app/api/one-click/create/route.ts` | `/api/one-click/create` | MEDIUM | si |
| `app/api/orders/[id]/route.ts` | `/api/orders/[id]` | MEDIUM | si |
| `app/api/orders/bulk-status/route.ts` | `/api/orders/bulk-status` | MEDIUM | si |
| `app/api/orders/reorder/route.ts` | `/api/orders/reorder` | MEDIUM | si |
| `app/api/payables/[id]/payments/route.ts` | `/api/payables/[id]/payments` | MEDIUM | si |
| `app/api/payables/[id]/route.ts` | `/api/payables/[id]` | MEDIUM | si |
| `app/api/payables/route.ts` | `/api/payables` | MEDIUM | si |
| `app/api/pos/voice-interpret/route.ts` | `/api/pos/voice-interpret` | MEDIUM | si |
| `app/api/prestamos/[id]/documentos/route.ts` | `/api/prestamos/[id]/documentos` | MEDIUM | si |
| `app/api/prestamos/[id]/pagar/route.ts` | `/api/prestamos/[id]/pagar` | MEDIUM | si |
| `app/api/prestamos/[id]/refinanciar/route.ts` | `/api/prestamos/[id]/refinanciar` | MEDIUM | si |
| `app/api/prestamos/[id]/route.ts` | `/api/prestamos/[id]` | MEDIUM | si |
| `app/api/prestamos/route.ts` | `/api/prestamos` | MEDIUM | si |
| `app/api/presupuesto/route.ts` | `/api/presupuesto` | HIGH | NO |
| `app/api/products/[id]/generate-image/route.ts` | `/api/products/[id]/generate-image` | MEDIUM | si |
| `app/api/products/[id]/modifiers/route.ts` | `/api/products/[id]/modifiers` | MEDIUM | si |
| `app/api/products/[id]/notify-restock/route.ts` | `/api/products/[id]/notify-restock` | HIGH | NO |
| `app/api/products/[id]/route.ts` | `/api/products/[id]` | MEDIUM | si |
| `app/api/products/bulk/route.ts` | `/api/products/bulk` | MEDIUM | si |
| `app/api/products/bulk-price/route.ts` | `/api/products/bulk-price` | MEDIUM | si |
| `app/api/products/catalog-import/route.ts` | `/api/products/catalog-import` | MEDIUM | si |
| `app/api/products/csv/route.ts` | `/api/products/csv` | MEDIUM | si |
| `app/api/products/import/route.ts` | `/api/products/import` | MEDIUM | si |
| `app/api/products/route.ts` | `/api/products` | HIGH | NO |
| `app/api/promotions/[id]/route.ts` | `/api/promotions/[id]` | MEDIUM | si |
| `app/api/promotions/ai-suggest/route.ts` | `/api/promotions/ai-suggest` | MEDIUM | si |
| `app/api/promotions/route.ts` | `/api/promotions` | MEDIUM | si |
| `app/api/purchases/[id]/route.ts` | `/api/purchases/[id]` | MEDIUM | si |
| `app/api/purchases/route.ts` | `/api/purchases` | MEDIUM | si |
| `app/api/recetas/[id]/producir/route.ts` | `/api/recetas/[id]/producir` | MEDIUM | si |
| `app/api/recetas/[id]/route.ts` | `/api/recetas/[id]` | MEDIUM | si |
| `app/api/recetas/route.ts` | `/api/recetas` | MEDIUM | si |
| `app/api/referrals/complete/route.ts` | `/api/referrals/complete` | HIGH | NO |
| `app/api/referrals/stores/route.ts` | `/api/referrals/stores` | MEDIUM | si |
| `app/api/returns/route.ts` | `/api/returns` | MEDIUM | si |
| `app/api/reviews/[id]/route.ts` | `/api/reviews/[id]` | MEDIUM | si |
| `app/api/sales/devolucion/route.ts` | `/api/sales/devolucion` | MEDIUM | si |
| `app/api/settings/route.ts` | `/api/settings` | MEDIUM | si |
| `app/api/shopping-lists/[id]/route.ts` | `/api/shopping-lists/[id]` | HIGH | NO |
| `app/api/socio-buleje/cancel/route.ts` | `/api/socio-buleje/cancel` | HIGH | NO |
| `app/api/socio-buleje/subscribe/route.ts` | `/api/socio-buleje/subscribe` | HIGH | NO |
| `app/api/stock-alerts/route.ts` | `/api/stock-alerts` | HIGH | NO |
| `app/api/store-page/combos/route.ts` | `/api/store-page/combos` | HIGH | NO |
| `app/api/store-page/customization/route.ts` | `/api/store-page/customization` | MEDIUM | si |
| `app/api/store-page/discounts/route.ts` | `/api/store-page/discounts` | MEDIUM | si |
| `app/api/store-page/overrides/[productId]/route.ts` | `/api/store-page/overrides/[productId]` | MEDIUM | si |
| `app/api/store-page/overrides/route.ts` | `/api/store-page/overrides` | MEDIUM | si |
| `app/api/store-page/promotions/[id]/route.ts` | `/api/store-page/promotions/[id]` | MEDIUM | si |
| `app/api/store-page/promotions/route.ts` | `/api/store-page/promotions` | MEDIUM | si |
| `app/api/store-page/visibility/route.ts` | `/api/store-page/visibility` | MEDIUM | si |
| `app/api/store-page/visits/route.ts` | `/api/store-page/visits` | HIGH | NO |
| `app/api/store-permissions/[id]/route.ts` | `/api/store-permissions/[id]` | MEDIUM | si |
| `app/api/store-permissions/route.ts` | `/api/store-permissions` | MEDIUM | si |
| `app/api/stripe-connect/onboard/route.ts` | `/api/stripe-connect/onboard` | MEDIUM | si |
| `app/api/subscriptions/[id]/route.ts` | `/api/subscriptions/[id]` | MEDIUM | si |
| `app/api/subscriptions/[id]/skip/route.ts` | `/api/subscriptions/[id]/skip` | MEDIUM | si |
| `app/api/subscriptions/route.ts` | `/api/subscriptions` | MEDIUM | si |
| `app/api/sunat/config/route.ts` | `/api/sunat/config` | MEDIUM | si |
| `app/api/sunat/emit/route.ts` | `/api/sunat/emit` | MEDIUM | si |
| `app/api/sunat/emit-on-sale/route.ts` | `/api/sunat/emit-on-sale` | MEDIUM | si |
| `app/api/sunat/invoices/[id]/route.ts` | `/api/sunat/invoices/[id]` | MEDIUM | si |
| `app/api/sunat/void/route.ts` | `/api/sunat/void` | MEDIUM | si |
| `app/api/superadmin/banners/copy-suggest/route.ts` | `/api/superadmin/banners/copy-suggest` | HIGH | NO |
| `app/api/superadmin/banners/route.ts` | `/api/superadmin/banners` | HIGH | NO |
| `app/api/superadmin/brand/route.ts` | `/api/superadmin/brand` | HIGH | NO |
| `app/api/superadmin/churn/[tenantSlug]/route.ts` | `/api/superadmin/churn/[tenantSlug]` | HIGH | NO |
| `app/api/superadmin/churn/playbooks/route.ts` | `/api/superadmin/churn/playbooks` | HIGH | NO |
| `app/api/superadmin/compliance/data-export/route.ts` | `/api/superadmin/compliance/data-export` | HIGH | NO |
| `app/api/superadmin/design-system/route.ts` | `/api/superadmin/design-system` | HIGH | NO |
| `app/api/superadmin/image-bank/[categoryId]/items/[itemId]/route.ts` | `/api/superadmin/image-bank/[categoryId]/items/[itemId]` | HIGH | NO |
| `app/api/superadmin/image-bank/[categoryId]/items/route.ts` | `/api/superadmin/image-bank/[categoryId]/items` | HIGH | NO |
| `app/api/superadmin/image-bank/[categoryId]/route.ts` | `/api/superadmin/image-bank/[categoryId]` | HIGH | NO |
| `app/api/superadmin/image-bank/route.ts` | `/api/superadmin/image-bank` | HIGH | NO |
| `app/api/superadmin/impersonate/route.ts` | `/api/superadmin/impersonate` | HIGH | NO |
| `app/api/superadmin/marketplace/categories/route.ts` | `/api/superadmin/marketplace/categories` | HIGH | NO |
| `app/api/superadmin/page-heroes/[id]/route.ts` | `/api/superadmin/page-heroes/[id]` | MEDIUM | si |
| `app/api/superadmin/page-heroes/route.ts` | `/api/superadmin/page-heroes` | MEDIUM | si |
| `app/api/superadmin/payment-approvals/[id]/approve/route.ts` | `/api/superadmin/payment-approvals/[id]/approve` | HIGH | NO |
| `app/api/superadmin/payment-approvals/[id]/reject/route.ts` | `/api/superadmin/payment-approvals/[id]/reject` | HIGH | NO |
| `app/api/superadmin/payment-proofs/[id]/approve/route.ts` | `/api/superadmin/payment-proofs/[id]/approve` | HIGH | NO |
| `app/api/superadmin/payment-proofs/[id]/reject/route.ts` | `/api/superadmin/payment-proofs/[id]/reject` | HIGH | NO |
| `app/api/superadmin/platform-config/route.ts` | `/api/superadmin/platform-config` | HIGH | NO |
| `app/api/superadmin/platform-config/upload/route.ts` | `/api/superadmin/platform-config/upload` | HIGH | NO |
| `app/api/superadmin/purge/route.ts` | `/api/superadmin/purge` | HIGH | NO |
| `app/api/superadmin/recetario/[id]/route.ts` | `/api/superadmin/recetario/[id]` | HIGH | NO |
| `app/api/superadmin/recetario/route.ts` | `/api/superadmin/recetario` | HIGH | NO |
| `app/api/superadmin/repartidores/impersonate/route.ts` | `/api/superadmin/repartidores/impersonate` | HIGH | NO |
| `app/api/superadmin/repartidores/route.ts` | `/api/superadmin/repartidores` | HIGH | NO |
| `app/api/superadmin/security/sessions/revoke/route.ts` | `/api/superadmin/security/sessions/revoke` | HIGH | NO |
| `app/api/superadmin/stores/[slug]/category-order/route.ts` | `/api/superadmin/stores/[slug]/category-order` | HIGH | NO |
| `app/api/superadmin/stores/health-field/route.ts` | `/api/superadmin/stores/health-field` | HIGH | NO |
| `app/api/superadmin/stores/route.ts` | `/api/superadmin/stores` | HIGH | NO |
| `app/api/superadmin/tenants/[slug]/delete/route.ts` | `/api/superadmin/tenants/[slug]/delete` | HIGH | NO |
| `app/api/superadmin/tenants/[slug]/products/route.ts` | `/api/superadmin/tenants/[slug]/products` | HIGH | NO |
| `app/api/superadmin/tenants/[slug]/purge/route.ts` | `/api/superadmin/tenants/[slug]/purge` | HIGH | NO |
| `app/api/superadmin/tenants/[slug]/route.ts` | `/api/superadmin/tenants/[slug]` | HIGH | NO |
| `app/api/superadmin/tenants/route.ts` | `/api/superadmin/tenants` | HIGH | NO |
| `app/api/superadmin/upload/route.ts` | `/api/superadmin/upload` | HIGH | NO |
| `app/api/superadmin/variant-catalog/[id]/options/route.ts` | `/api/superadmin/variant-catalog/[id]/options` | HIGH | NO |
| `app/api/superadmin/variant-catalog/[id]/route.ts` | `/api/superadmin/variant-catalog/[id]` | HIGH | NO |
| `app/api/superadmin/variant-catalog/options/[optionId]/route.ts` | `/api/superadmin/variant-catalog/options/[optionId]` | HIGH | NO |
| `app/api/superadmin/variant-catalog/route.ts` | `/api/superadmin/variant-catalog` | HIGH | NO |
| `app/api/superadmin/vendor-applications/[id]/review/route.ts` | `/api/superadmin/vendor-applications/[id]/review` | HIGH | NO |
| `app/api/supplier/catalog/route.ts` | `/api/supplier/catalog` | HIGH | NO |
| `app/api/supplier/offers/route.ts` | `/api/supplier/offers` | HIGH | NO |
| `app/api/supplier-evaluations/route.ts` | `/api/supplier-evaluations` | MEDIUM | si |
| `app/api/supplier-returns/[id]/route.ts` | `/api/supplier-returns/[id]` | MEDIUM | si |
| `app/api/supplier-returns/route.ts` | `/api/supplier-returns` | MEDIUM | si |
| `app/api/suppliers/[id]/route.ts` | `/api/suppliers/[id]` | MEDIUM | si |
| `app/api/suppliers/route.ts` | `/api/suppliers` | MEDIUM | si |
| `app/api/support/tickets/route.ts` | `/api/support/tickets` | MEDIUM | si |
| `app/api/surveys/route.ts` | `/api/surveys` | MEDIUM | si |
| `app/api/tags/route.ts` | `/api/tags` | MEDIUM | si |
| `app/api/tasks/[id]/route.ts` | `/api/tasks/[id]` | MEDIUM | si |
| `app/api/tasks/route.ts` | `/api/tasks` | MEDIUM | si |
| `app/api/tenant/custom-domain/route.ts` | `/api/tenant/custom-domain` | MEDIUM | si |
| `app/api/transfers/route.ts` | `/api/transfers` | MEDIUM | si |
| `app/api/treasury/cuentas/route.ts` | `/api/treasury/cuentas` | MEDIUM | si |
| `app/api/treasury/movimientos/route.ts` | `/api/treasury/movimientos` | MEDIUM | si |
| `app/api/treasury/transferencias/route.ts` | `/api/treasury/transferencias` | MEDIUM | si |
| `app/api/turnos/[id]/cerrar/route.ts` | `/api/turnos/[id]/cerrar` | MEDIUM | si |
| `app/api/turnos/route.ts` | `/api/turnos` | MEDIUM | si |
| `app/api/upload/route.ts` | `/api/upload` | MEDIUM | si |
| `app/api/v1/products/route.ts` | `/api/v1/products` | MEDIUM | si |
| `app/api/voice-order/route.ts` | `/api/voice-order` | HIGH | NO |
| `app/api/webhooks/config/route.ts` | `/api/webhooks/config` | MEDIUM | si |
| `app/api/webhooks/nubefact/route.ts` | `/api/webhooks/nubefact` | HIGH | NO |
| `app/api/webhooks/whatsapp/route.ts` | `/api/webhooks/whatsapp` | HIGH | NO |
| `app/api/whatsapp/concierge/route.ts` | `/api/whatsapp/concierge` | HIGH | NO |
| `app/api/whatsapp/concierge/test/route.ts` | `/api/whatsapp/concierge/test` | HIGH | NO |
| `app/api/whatsapp/voice/route.ts` | `/api/whatsapp/voice` | HIGH | NO |
| `app/api/whatsapp/webhook/route.ts` | `/api/whatsapp/webhook` | HIGH | NO |
| `app/api/whatsapp/yape-capture/route.ts` | `/api/whatsapp/yape-capture` | HIGH | NO |
| `app/api/wholesale/orders/[id]/route.ts` | `/api/wholesale/orders/[id]` | MEDIUM | si |
| `app/api/wholesale/orders/route.ts` | `/api/wholesale/orders` | MEDIUM | si |
| `app/api/wholesale/pricing/route.ts` | `/api/wholesale/pricing` | MEDIUM | si |
| `app/api/workers/[job]/route.ts` | `/api/workers/[job]` | HIGH | NO |

---

## B) Sin Auth + Sin Rate Limit (no allowlisted)

| Archivo | API Path | Severity |
|---------|----------|----------|
| `app/api/ab-tests/events/route.ts` | `/api/ab-tests/events` | CRITICAL |
| `app/api/abandoned-cart/mine/route.ts` | `/api/abandoned-cart/mine` | CRITICAL |
| `app/api/agents/health/route.ts` | `/api/agents/health` | CRITICAL |
| `app/api/ai/status/route.ts` | `/api/ai/status` | CRITICAL |
| `app/api/analytics/track/route.ts` | `/api/analytics/track` | CRITICAL |
| `app/api/api-keys/route.ts` | `/api/api-keys` | CRITICAL |
| `app/api/asistente/chat/route.ts` | `/api/asistente/chat` | CRITICAL |
| `app/api/assistant/chat/route.ts` | `/api/assistant/chat` | CRITICAL |
| `app/api/beta-feedback/route.ts` | `/api/beta-feedback` | CRITICAL |
| `app/api/billing/mp-webhook/route.ts` | `/api/billing/mp-webhook` | CRITICAL |
| `app/api/billing/webhook/route.ts` | `/api/billing/webhook` | CRITICAL |
| `app/api/billing/webhook-replay/route.ts` | `/api/billing/webhook-replay` | CRITICAL |
| `app/api/billing/wire-up/ai-hook/route.ts` | `/api/billing/wire-up/ai-hook` | CRITICAL |
| `app/api/billing/wire-up/sales-hook/route.ts` | `/api/billing/wire-up/sales-hook` | CRITICAL |
| `app/api/birthday-coupons/route.ts` | `/api/birthday-coupons` | CRITICAL |
| `app/api/chat/auto-reply/route.ts` | `/api/chat/auto-reply` | CRITICAL |
| `app/api/chat/public/route.ts` | `/api/chat/public` | CRITICAL |
| `app/api/coupons/active/route.ts` | `/api/coupons/active` | CRITICAL |
| `app/api/customer/intelligence/route.ts` | `/api/customer/intelligence` | CRITICAL |
| `app/api/daily-digest/route.ts` | `/api/daily-digest` | CRITICAL |
| `app/api/design-system/active/route.ts` | `/api/design-system/active` | CRITICAL |
| `app/api/docs/openapi.json/route.ts` | `/api/docs/openapi.json` | CRITICAL |
| `app/api/email-automation/route.ts` | `/api/email-automation` | CRITICAL |
| `app/api/fridge-scan/route.ts` | `/api/fridge-scan` | CRITICAL |
| `app/api/gift-cards/[id]/route.ts` | `/api/gift-cards/[id]` | CRITICAL |
| `app/api/internal/audit-log/route.ts` | `/api/internal/audit-log` | CRITICAL |
| `app/api/inventory/stock-prediction/route.ts` | `/api/inventory/stock-prediction` | CRITICAL |
| `app/api/invitations/[token]/route.ts` | `/api/invitations/[token]` | CRITICAL |
| `app/api/invite/route.ts` | `/api/invite` | CRITICAL |
| `app/api/lives/[id]/route.ts` | `/api/lives/[id]` | CRITICAL |
| `app/api/lives/active/route.ts` | `/api/lives/active` | CRITICAL |
| `app/api/loyalty/referral/route.ts` | `/api/loyalty/referral` | CRITICAL |
| `app/api/ocr/invoice/route.ts` | `/api/ocr/invoice` | CRITICAL |
| `app/api/platform/activity/route.ts` | `/api/platform/activity` | CRITICAL |
| `app/api/platform/stats/route.ts` | `/api/platform/stats` | CRITICAL |
| `app/api/platform-brand/route.ts` | `/api/platform-brand` | CRITICAL |
| `app/api/platform-config/public/route.ts` | `/api/platform-config/public` | CRITICAL |
| `app/api/prestamos/cron/mora/route.ts` | `/api/prestamos/cron/mora` | CRITICAL |
| `app/api/prestamos/cron/recordatorios/route.ts` | `/api/prestamos/cron/recordatorios` | CRITICAL |
| `app/api/presupuesto/route.ts` | `/api/presupuesto` | CRITICAL |
| `app/api/price-comparison/route.ts` | `/api/price-comparison` | CRITICAL |
| `app/api/product-search/route.ts` | `/api/product-search` | CRITICAL |
| `app/api/public/tracking/[token]/route.ts` | `/api/public/tracking/[token]` | CRITICAL |
| `app/api/purchases/frequent-items/route.ts` | `/api/purchases/frequent-items` | CRITICAL |
| `app/api/recetas/publicas/route.ts` | `/api/recetas/publicas` | CRITICAL |
| `app/api/recommendations/route.ts` | `/api/recommendations` | CRITICAL |
| `app/api/recommender/hybrid/route.ts` | `/api/recommender/hybrid` | CRITICAL |
| `app/api/referrals/complete/route.ts` | `/api/referrals/complete` | CRITICAL |
| `app/api/reorder-alerts/route.ts` | `/api/reorder-alerts` | CRITICAL |
| `app/api/shopping-feed/route.ts` | `/api/shopping-feed` | CRITICAL |
| `app/api/shopping-lists/[id]/route.ts` | `/api/shopping-lists/[id]` | CRITICAL |
| `app/api/socio-buleje/cancel/route.ts` | `/api/socio-buleje/cancel` | CRITICAL |
| `app/api/socio-buleje/cashback/route.ts` | `/api/socio-buleje/cashback` | CRITICAL |
| `app/api/socio-buleje/status/route.ts` | `/api/socio-buleje/status` | CRITICAL |
| `app/api/socio-buleje/subscribe/route.ts` | `/api/socio-buleje/subscribe` | CRITICAL |
| `app/api/stats/live/route.ts` | `/api/stats/live` | CRITICAL |
| `app/api/stock-alerts/route.ts` | `/api/stock-alerts` | CRITICAL |
| `app/api/store-page/combos/route.ts` | `/api/store-page/combos` | CRITICAL |
| `app/api/store-page/public/[slug]/route.ts` | `/api/store-page/public/[slug]` | CRITICAL |
| `app/api/store-page/public-catalog/route.ts` | `/api/store-page/public-catalog` | CRITICAL |
| `app/api/store-page/visits/route.ts` | `/api/store-page/visits` | CRITICAL |
| `app/api/superadmin/banners/copy-suggest/route.ts` | `/api/superadmin/banners/copy-suggest` | CRITICAL |
| `app/api/superadmin/banners/route.ts` | `/api/superadmin/banners` | CRITICAL |
| `app/api/superadmin/brand/route.ts` | `/api/superadmin/brand` | CRITICAL |
| `app/api/superadmin/churn/[tenantSlug]/route.ts` | `/api/superadmin/churn/[tenantSlug]` | CRITICAL |
| `app/api/superadmin/churn/playbooks/route.ts` | `/api/superadmin/churn/playbooks` | CRITICAL |
| `app/api/superadmin/churn/route.ts` | `/api/superadmin/churn` | CRITICAL |
| `app/api/superadmin/compliance/data-export/route.ts` | `/api/superadmin/compliance/data-export` | CRITICAL |
| `app/api/superadmin/costs/route.ts` | `/api/superadmin/costs` | CRITICAL |
| `app/api/superadmin/design-system/route.ts` | `/api/superadmin/design-system` | CRITICAL |
| `app/api/superadmin/health/route.ts` | `/api/superadmin/health` | CRITICAL |
| `app/api/superadmin/image-bank/[categoryId]/items/[itemId]/route.ts` | `/api/superadmin/image-bank/[categoryId]/items/[itemId]` | CRITICAL |
| `app/api/superadmin/image-bank/[categoryId]/items/route.ts` | `/api/superadmin/image-bank/[categoryId]/items` | CRITICAL |
| `app/api/superadmin/image-bank/[categoryId]/route.ts` | `/api/superadmin/image-bank/[categoryId]` | CRITICAL |
| `app/api/superadmin/image-bank/route.ts` | `/api/superadmin/image-bank` | CRITICAL |
| `app/api/superadmin/impersonate/route.ts` | `/api/superadmin/impersonate` | CRITICAL |
| `app/api/superadmin/marketplace/categories/route.ts` | `/api/superadmin/marketplace/categories` | CRITICAL |
| `app/api/superadmin/marketplace/coupons/route.ts` | `/api/superadmin/marketplace/coupons` | CRITICAL |
| `app/api/superadmin/marketplace/orders/route.ts` | `/api/superadmin/marketplace/orders` | CRITICAL |
| `app/api/superadmin/notifications/inbox/route.ts` | `/api/superadmin/notifications/inbox` | CRITICAL |
| `app/api/superadmin/notifications/route.ts` | `/api/superadmin/notifications` | CRITICAL |
| `app/api/superadmin/orders/route.ts` | `/api/superadmin/orders` | CRITICAL |
| `app/api/superadmin/payment-approvals/[id]/approve/route.ts` | `/api/superadmin/payment-approvals/[id]/approve` | CRITICAL |
| `app/api/superadmin/payment-approvals/[id]/reject/route.ts` | `/api/superadmin/payment-approvals/[id]/reject` | CRITICAL |
| `app/api/superadmin/payment-approvals/route.ts` | `/api/superadmin/payment-approvals` | CRITICAL |
| `app/api/superadmin/payment-proofs/[id]/approve/route.ts` | `/api/superadmin/payment-proofs/[id]/approve` | CRITICAL |
| `app/api/superadmin/payment-proofs/[id]/reject/route.ts` | `/api/superadmin/payment-proofs/[id]/reject` | CRITICAL |
| `app/api/superadmin/payment-proofs/route.ts` | `/api/superadmin/payment-proofs` | CRITICAL |
| `app/api/superadmin/platform-config/route.ts` | `/api/superadmin/platform-config` | CRITICAL |
| `app/api/superadmin/platform-config/upload/route.ts` | `/api/superadmin/platform-config/upload` | CRITICAL |
| `app/api/superadmin/purge/route.ts` | `/api/superadmin/purge` | CRITICAL |
| `app/api/superadmin/recetario/[id]/route.ts` | `/api/superadmin/recetario/[id]` | CRITICAL |
| `app/api/superadmin/recetario/route.ts` | `/api/superadmin/recetario` | CRITICAL |
| `app/api/superadmin/repartidores/impersonate/route.ts` | `/api/superadmin/repartidores/impersonate` | CRITICAL |
| `app/api/superadmin/repartidores/route.ts` | `/api/superadmin/repartidores` | CRITICAL |
| `app/api/superadmin/security/posture/route.ts` | `/api/superadmin/security/posture` | CRITICAL |
| `app/api/superadmin/security/route.ts` | `/api/superadmin/security` | CRITICAL |
| `app/api/superadmin/security/sessions/revoke/route.ts` | `/api/superadmin/security/sessions/revoke` | CRITICAL |
| `app/api/superadmin/security/sessions/route.ts` | `/api/superadmin/security/sessions` | CRITICAL |
| `app/api/superadmin/stores/[slug]/category-order/route.ts` | `/api/superadmin/stores/[slug]/category-order` | CRITICAL |
| `app/api/superadmin/stores/health/route.ts` | `/api/superadmin/stores/health` | CRITICAL |
| `app/api/superadmin/stores/health-field/route.ts` | `/api/superadmin/stores/health-field` | CRITICAL |
| `app/api/superadmin/stores/health-snapshot/route.ts` | `/api/superadmin/stores/health-snapshot` | CRITICAL |
| `app/api/superadmin/stores/operations/route.ts` | `/api/superadmin/stores/operations` | CRITICAL |
| `app/api/superadmin/stores/route.ts` | `/api/superadmin/stores` | CRITICAL |
| `app/api/superadmin/tenants/[slug]/delete/route.ts` | `/api/superadmin/tenants/[slug]/delete` | CRITICAL |
| `app/api/superadmin/tenants/[slug]/pending-orders/route.ts` | `/api/superadmin/tenants/[slug]/pending-orders` | CRITICAL |
| `app/api/superadmin/tenants/[slug]/products/route.ts` | `/api/superadmin/tenants/[slug]/products` | CRITICAL |
| `app/api/superadmin/tenants/[slug]/purge/route.ts` | `/api/superadmin/tenants/[slug]/purge` | CRITICAL |
| `app/api/superadmin/tenants/[slug]/route.ts` | `/api/superadmin/tenants/[slug]` | CRITICAL |
| `app/api/superadmin/tenants/pending-counts/route.ts` | `/api/superadmin/tenants/pending-counts` | CRITICAL |
| `app/api/superadmin/tenants/route.ts` | `/api/superadmin/tenants` | CRITICAL |
| `app/api/superadmin/upload/route.ts` | `/api/superadmin/upload` | CRITICAL |
| `app/api/superadmin/variant-catalog/[id]/options/route.ts` | `/api/superadmin/variant-catalog/[id]/options` | CRITICAL |
| `app/api/superadmin/variant-catalog/[id]/route.ts` | `/api/superadmin/variant-catalog/[id]` | CRITICAL |
| `app/api/superadmin/variant-catalog/options/[optionId]/route.ts` | `/api/superadmin/variant-catalog/options/[optionId]` | CRITICAL |
| `app/api/superadmin/variant-catalog/route.ts` | `/api/superadmin/variant-catalog` | CRITICAL |
| `app/api/superadmin/vendor-applications/[id]/review/route.ts` | `/api/superadmin/vendor-applications/[id]/review` | CRITICAL |
| `app/api/superadmin/vendor-applications/[id]/route.ts` | `/api/superadmin/vendor-applications/[id]` | CRITICAL |
| `app/api/superadmin/vendor-applications/route.ts` | `/api/superadmin/vendor-applications` | CRITICAL |
| `app/api/superadmin/vendor-applications/stats/route.ts` | `/api/superadmin/vendor-applications/stats` | CRITICAL |
| `app/api/supplier/alerts/route.ts` | `/api/supplier/alerts` | CRITICAL |
| `app/api/supplier/catalog/route.ts` | `/api/supplier/catalog` | CRITICAL |
| `app/api/supplier/dashboard/route.ts` | `/api/supplier/dashboard` | CRITICAL |
| `app/api/supplier/offers/route.ts` | `/api/supplier/offers` | CRITICAL |
| `app/api/supplier/orders/route.ts` | `/api/supplier/orders` | CRITICAL |
| `app/api/supplier/rating/route.ts` | `/api/supplier/rating` | CRITICAL |
| `app/api/tenants/resolve/route.ts` | `/api/tenants/resolve` | CRITICAL |
| `app/api/voice-order/route.ts` | `/api/voice-order` | CRITICAL |
| `app/api/whatsapp/concierge/route.ts` | `/api/whatsapp/concierge` | CRITICAL |
| `app/api/whatsapp/concierge/test/route.ts` | `/api/whatsapp/concierge/test` | CRITICAL |
| `app/api/whatsapp/voice/route.ts` | `/api/whatsapp/voice` | CRITICAL |
| `app/api/whatsapp/webhook/route.ts` | `/api/whatsapp/webhook` | CRITICAL |
| `app/api/whatsapp/yape-capture/route.ts` | `/api/whatsapp/yape-capture` | CRITICAL |
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
| `app/api/cron/marketplace-sla-watchdog/route.ts` | `/api/cron/marketplace-sla-watchdog` | MEDIUM | NO |
| `app/api/cron/price-drop-alerts/route.ts` | `/api/cron/price-drop-alerts` | MEDIUM | NO |
| `app/api/cron/recompra-coupon/route.ts` | `/api/cron/recompra-coupon` | MEDIUM | NO |
| `app/api/cron/reorder-reminders/route.ts` | `/api/cron/reorder-reminders` | MEDIUM | NO |
| `app/api/customer/data/route.ts` | `/api/customer/data` | MEDIUM | si |
| `app/api/customer/intelligence/route.ts` | `/api/customer/intelligence` | MEDIUM | NO |
| `app/api/customer-notifications/route.ts` | `/api/customer-notifications` | MEDIUM | si |
| `app/api/customers/[phone]/estado-cuenta/route.ts` | `/api/customers/[phone]/estado-cuenta` | MEDIUM | si |
| `app/api/customers/[phone]/favorite-products/route.ts` | `/api/customers/[phone]/favorite-products` | MEDIUM | si |
| `app/api/customers/[phone]/last-purchase/route.ts` | `/api/customers/[phone]/last-purchase` | MEDIUM | si |
| `app/api/customers/[phone]/route.ts` | `/api/customers/[phone]` | MEDIUM | si |
| `app/api/customers/[phone]/timeline/route.ts` | `/api/customers/[phone]/timeline` | MEDIUM | si |
| `app/api/customers/rfm/route.ts` | `/api/customers/rfm` | MEDIUM | si |
| `app/api/documentos-emitidos/route.ts` | `/api/documentos-emitidos` | MEDIUM | si |
| `app/api/email-automation/route.ts` | `/api/email-automation` | MEDIUM | NO |
| `app/api/fiados/route.ts` | `/api/fiados` | MEDIUM | si |
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
| `app/api/orders/[id]/tracking/route.ts` | `/api/orders/[id]/tracking` | MEDIUM | NO |
| `app/api/orders/csv/route.ts` | `/api/orders/csv` | MEDIUM | si |
| `app/api/orders/route.ts` | `/api/orders` | MEDIUM | si |
| `app/api/recommendations/route.ts` | `/api/recommendations` | MEDIUM | NO |
| `app/api/returns/route.ts` | `/api/returns` | MEDIUM | si |
| `app/api/sales/export/route.ts` | `/api/sales/export` | MEDIUM | si |
| `app/api/sales/route.ts` | `/api/sales` | MEDIUM | si |
| `app/api/shopping-lists/[id]/route.ts` | `/api/shopping-lists/[id]` | MEDIUM | NO |
| `app/api/shopping-lists/route.ts` | `/api/shopping-lists` | MEDIUM | NO |
| `app/api/stats/live/route.ts` | `/api/stats/live` | MEDIUM | NO |
| `app/api/superadmin/analytics/executive/route.ts` | `/api/superadmin/analytics/executive` | MEDIUM | NO |
| `app/api/superadmin/marketplace/orders/route.ts` | `/api/superadmin/marketplace/orders` | MEDIUM | NO |
| `app/api/superadmin/notifications/inbox/route.ts` | `/api/superadmin/notifications/inbox` | MEDIUM | NO |
| `app/api/superadmin/orders/route.ts` | `/api/superadmin/orders` | MEDIUM | NO |
| `app/api/superadmin/stores/operations/route.ts` | `/api/superadmin/stores/operations` | MEDIUM | NO |
| `app/api/superadmin/tenants/[slug]/pending-orders/route.ts` | `/api/superadmin/tenants/[slug]/pending-orders` | MEDIUM | NO |

---

> Generado por `scripts/audit-security-sweep.mjs`