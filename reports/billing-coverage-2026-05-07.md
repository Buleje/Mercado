# Audit billing-coverage — 2026-05-07T11:15:23.653Z

## Resumen

| Metrica | Valor |
|---------|-------|
| Cobertura total | **10%** (23/226) |
| Con guard | 23 |
| SIN guard (write + admin) | **203** |
| Solo-GET o publicos | 374 |
| Excluidos (auth/billing/superadmin/marketplace) | 218 |

## Endpoints sin requireActiveSubscription

### Severidad CRITICO (40)

| Endpoint | Verbos | Plan-check alternativo |
|----------|--------|----------------------|
| `ab-tests/route.ts` | POST, PATCH, DELETE | no |
| `activity-log/route.ts` | POST, DELETE | no |
| `admin/cron-dead-letters/route.ts` | DELETE | no |
| `admin/demo-products/route.ts` | POST, DELETE | no |
| `admin/recetario/[id]/route.ts` | PATCH, DELETE | no |
| `admin/warehouses/route.ts` | POST, PATCH, DELETE | no |
| `admin/whatsapp-config/route.ts` | PUT, DELETE | no |
| `admin-users/[id]/route.ts` | PATCH, DELETE | no |
| `admin-users/route.ts` | POST, PATCH, DELETE | no |
| `ai-assistant/goals/route.ts` | POST, DELETE | no |
| `batches/route.ts` | POST, PATCH, DELETE | no |
| `campaigns/route.ts` | POST, PATCH, DELETE | no |
| `cms/pages/[id]/blocks/route.ts` | POST, PUT, DELETE | no |
| `commission-rules/route.ts` | POST, PATCH, DELETE | no |
| `contratos/[id]/route.ts` | PUT, DELETE | no |
| `cotizaciones/[id]/route.ts` | PATCH, DELETE | no |
| `custom-kpis/route.ts` | POST, PUT, DELETE | no |
| `customer/data/route.ts` | DELETE | no |
| `customers/[phone]/route.ts` | PATCH, DELETE | no |
| `discount-rules/[id]/route.ts` | PATCH, DELETE | no |
| `goals/[id]/route.ts` | PATCH, DELETE | no |
| `locations/route.ts` | POST, PATCH, DELETE | no |
| `message-templates/route.ts` | POST, PATCH, DELETE | no |
| `notes/route.ts` | POST, PATCH, DELETE | no |
| `orders/[id]/route.ts` | PATCH, DELETE | no |
| `products/bulk/route.ts` | POST, DELETE | no |
| `purchases/[id]/route.ts` | PATCH, DELETE | no |
| `recetas/[id]/route.ts` | PATCH, DELETE | no |
| `reminders/route.ts` | POST, PATCH, DELETE | no |
| `reviews/[id]/route.ts` | PATCH, DELETE | no |
| `saved-filters/route.ts` | POST, PATCH, DELETE | no |
| `store-page/overrides/[productId]/route.ts` | DELETE | no |
| `store-page/promotions/[id]/route.ts` | PATCH, DELETE | no |
| `store-permissions/route.ts` | POST, DELETE | no |
| `supplier-returns/[id]/route.ts` | PATCH, DELETE | no |
| `suppliers/[id]/route.ts` | PATCH, DELETE | no |
| `tags/route.ts` | POST, DELETE | no |
| `tasks/[id]/route.ts` | PATCH, DELETE | no |
| `tenant/custom-domain/route.ts` | PUT, DELETE | no |
| `transfers/route.ts` | POST, PATCH, DELETE | no |

### Severidad ALTO (163)

| Endpoint | Verbos | Plan-check alternativo |
|----------|--------|----------------------|
| `admin/2fa/setup/route.ts` | POST | no |
| `admin/2fa/verify/route.ts` | POST | no |
| `admin/alerts/stock-critical/route.ts` | POST | no |
| `admin/chat/route.ts` | POST | no |
| `admin/chat/threads/[threadId]/messages/route.ts` | POST | no |
| `admin/chat/threads/route.ts` | PATCH | no |
| `admin/clear-data/route.ts` | POST | no |
| `admin/content-calendar/route.ts` | PUT | no |
| `admin/delivery/manual-assign/route.ts` | POST | no |
| `admin/delivery/routes/[routeId]/stops/route.ts` | POST, PATCH | no |
| `admin/delivery/routes/route.ts` | POST, PATCH | no |
| `admin/delivery/tracking/route.ts` | POST | no |
| `admin/delivery-zones/route.ts` | POST | no |
| `admin/driver-applications/route.ts` | PATCH | no |
| `admin/gift-cards/[id]/cancel/route.ts` | POST | no |
| `admin/gift-cards/issue-manual/route.ts` | POST | no |
| `admin/import-data/route.ts` | POST | no |
| `admin/inventory/reorder/route.ts` | POST | no |
| `admin/invitations/[id]/revoke/route.ts` | POST | no |
| `admin/invitations/route.ts` | POST | no |
| `admin/lives/[id]/end/route.ts` | POST | no |
| `admin/lives/[id]/products/route.ts` | POST, PATCH | no |
| `admin/lives/[id]/start/route.ts` | POST | no |
| `admin/marketplace/category-images/route.ts` | PUT | no |
| `admin/marketplace/category-order/route.ts` | PUT | no |
| `admin/marketplace/product-order/route.ts` | PUT | no |
| `admin/marketplace/store-construction/route.ts` | PUT | no |
| `admin/plan/checkout/confirm/route.ts` | POST | no |
| `admin/plan/checkout/stripe-session/route.ts` | POST | no |
| `admin/plan/mock-activate/route.ts` | POST | no |
| `admin/preferences/route.ts` | PATCH | no |
| `admin/products/[id]/import-from-catalog/route.ts` | POST | no |
| `admin/recetario/route.ts` | POST | no |
| `admin/reviews/[reviewId]/route.ts` | PATCH | no |
| `admin/seed-data/route.ts` | POST | no |
| `admin/seed-peru-products/route.ts` | POST | no |
| `admin/setup-marketplace-store/route.ts` | POST | no |
| `admin/store-reviews/route.ts` | PATCH | no |
| `admin/sunat/config/route.ts` | PUT | no |
| `admin/sunat/generate-invoice/route.ts` | POST | no |
| `admin-chat/route.ts` | POST | no |
| `agents/[taskId]/route.ts` | PATCH | no |
| `agents/execute/route.ts` | POST | no |
| `agents/route.ts` | POST | no |
| `ai-assistant/actions/route.ts` | POST | no |
| `ai-assistant/approvals/route.ts` | POST | no |
| `ai-assistant/coach/route.ts` | POST | no |
| `ai-assistant/conversation/route.ts` | POST | no |
| `ai-assistant/decision-log/route.ts` | POST, PATCH | no |
| `ai-assistant/feedback/route.ts` | POST | no |
| `ai-assistant/history/route.ts` | POST | no |
| `ai-assistant/route.ts` | POST | no |
| `backups/route.ts` | POST | no |
| `bundles/[id]/route.ts` | POST | no |
| `bundles/route.ts` | POST | no |
| `campaigns/notify/route.ts` | POST | no |
| `cash-registers/[id]/route.ts` | PATCH | no |
| `cash-registers/close-shift/route.ts` | POST | no |
| `cash-registers/movements/route.ts` | POST | no |
| `cash-registers/route.ts` | POST | no |
| `chat/admin/route.ts` | POST, PATCH | no |
| `cierre-diario/route.ts` | POST | no |
| `cms/media/route.ts` | POST | no |
| `cms/pages/[id]/publish/route.ts` | POST | no |
| `commissions/ledger/route.ts` | POST, PATCH | no |
| `compliance/access-log/route.ts` | POST | no |
| `compliance/breach-report/route.ts` | POST | no |
| `compliance/consent/route.ts` | POST | no |
| `compliance/data-delete/route.ts` | POST | no |
| `compliance/data-export/route.ts` | POST | no |
| `compliance/route.ts` | PATCH | no |
| `compras/recepciones/route.ts` | POST | no |
| `contratos/export/route.ts` | POST | no |
| `contratos/route.ts` | POST | no |
| `cotizaciones/[id]/convertir/route.ts` | POST | no |
| `cotizaciones/route.ts` | POST | no |
| `coupons/route.ts` | POST | no |
| `credit/check/route.ts` | POST | no |
| `credit/create-plan/route.ts` | POST | no |
| `credit/pay/route.ts` | POST | no |
| `credit/profile/[customerId]/route.ts` | PUT | no |
| `customer-notifications/route.ts` | POST, PATCH | no |
| `customers/[phone]/ai-analysis/route.ts` | POST | no |
| `delivery/assignments/route.ts` | POST, PATCH | no |
| `delivery/confirm/route.ts` | POST | no |
| `delivery/notify/route.ts` | POST | no |
| `delivery/partners/route.ts` | POST | no |
| `delivery/toggle-online/route.ts` | POST | no |
| `delivery-slots/route.ts` | POST | no |
| `demand-prediction/route.ts` | POST | no |
| `discount-rules/route.ts` | POST | no |
| `email/send/route.ts` | POST | no |
| `fiados/[id]/pagar/route.ts` | POST | no |
| `fiados/[id]/route.ts` | PATCH | no |
| `fiados/cobrar/route.ts` | POST | no |
| `fiados/cobro-masivo/route.ts` | POST | no |
| `fiados/route.ts` | POST | no |
| `forecasting/auto-reorder/route.ts` | POST | no |
| `goals/route.ts` | POST | no |
| `guias-remision/[id]/route.ts` | PATCH, PUT | no |
| `guias-remision/route.ts` | POST | no |
| `inventory/conteo/[id]/close/route.ts` | POST | no |
| `inventory/conteo/[id]/items/route.ts` | PATCH | no |
| `inventory/expiry/route.ts` | PATCH | no |
| `inventory-movements/route.ts` | POST | no |
| `invoices/boleta/route.ts` | POST | no |
| `invoices/emit/route.ts` | POST | no |
| `invoices/sunat/route.ts` | POST | no |
| `loyalty/[phone]/route.ts` | PATCH | no |
| `loyalty/auto-earn/route.ts` | POST | no |
| `loyalty/redeem/route.ts` | POST | no |
| `mermas/route.ts` | POST | no |
| `notas-credito/[id]/route.ts` | PATCH | no |
| `notas-credito/route.ts` | POST | no |
| `notification-center/[id]/read/route.ts` | PATCH | no |
| `notification-center/read-all/route.ts` | PATCH | no |
| `notifications/route.ts` | POST | no |
| `onboarding/complete/route.ts` | POST | no |
| `onboarding/import-catalog/route.ts` | POST | no |
| `orders/bulk-status/route.ts` | POST | no |
| `pos/voice-interpret/route.ts` | POST | no |
| `prestamos/[id]/documentos/route.ts` | POST | no |
| `prestamos/[id]/pagar/route.ts` | POST | no |
| `prestamos/[id]/refinanciar/route.ts` | POST | no |
| `prestamos/[id]/route.ts` | PATCH, PUT | no |
| `prestamos/route.ts` | POST | no |
| `products/[id]/generate-image/route.ts` | POST | no |
| `products/[id]/modifiers/route.ts` | PUT | no |
| `products/bulk-price/route.ts` | PATCH, PUT | no |
| `products/catalog-import/route.ts` | POST | no |
| `products/import/route.ts` | POST | no |
| `promotions/[id]/route.ts` | POST | no |
| `promotions/ai-suggest/route.ts` | POST | no |
| `promotions/route.ts` | POST | no |
| `recetas/[id]/produce/route.ts` | POST | no |
| `recetas/[id]/producir/route.ts` | POST | no |
| `recetas/route.ts` | POST | no |
| `referrals/stores/route.ts` | POST | no |
| `returns/route.ts` | POST | no |
| `reviews/route.ts` | POST | no |
| `sales/devolucion/route.ts` | POST | no |
| `store-page/customization/route.ts` | PUT | no |
| `store-page/overrides/route.ts` | POST | no |
| `store-page/promotions/route.ts` | POST | no |
| `store-page/visibility/route.ts` | PATCH | no |
| `store-permissions/[id]/route.ts` | PATCH | no |
| `stripe-connect/onboard/route.ts` | POST | no |
| `sunat/invoices/[id]/route.ts` | POST | no |
| `supplier-evaluations/route.ts` | POST | no |
| `supplier-returns/route.ts` | POST | no |
| `suppliers/route.ts` | POST | no |
| `support/tickets/route.ts` | POST | no |
| `surveys/route.ts` | POST | no |
| `tasks/route.ts` | POST | no |
| `treasury/cuentas/route.ts` | POST, PATCH | no |
| `treasury/movimientos/route.ts` | POST | no |
| `treasury/transferencias/route.ts` | POST | no |
| `turnos/[id]/cerrar/route.ts` | POST | no |
| `turnos/route.ts` | POST | no |
| `upload/route.ts` | POST | no |
| `wholesale/orders/[id]/route.ts` | PATCH | no |
| `wholesale/orders/route.ts` | POST | no |
| `wholesale/pricing/route.ts` | POST | no |

## Endpoints con guard (23)

| Endpoint | Verbos |
|----------|--------|
| `admin/lives/route.ts` | POST |
| `admin/products/bulk-import/route.ts` | POST |
| `admin/warehouse-transfers/route.ts` | POST, PATCH |
| `cms/pages/[id]/route.ts` | PUT, DELETE |
| `cms/pages/route.ts` | POST |
| `customers/route.ts` | POST |
| `expenses/route.ts` | POST |
| `inventory/conteo/route.ts` | POST |
| `inventory/import-csv/route.ts` | POST |
| `payables/[id]/payments/route.ts` | POST |
| `payables/[id]/route.ts` | PATCH, DELETE |
| `payables/route.ts` | POST |
| `products/[id]/route.ts` | DELETE |
| `products/csv/route.ts` | POST |
| `products/generate-description/route.ts` | POST |
| `purchases/route.ts` | POST |
| `sales/route.ts` | POST |
| `store-page/discounts/route.ts` | POST |
| `sunat/config/route.ts` | PUT |
| `sunat/emit/route.ts` | POST |
| `sunat/emit-on-sale/route.ts` | POST |
| `sunat/void/route.ts` | POST |
| `v1/products/route.ts` | POST |

---
*Generado por `scripts/audit-billing-coverage.mjs` — 2026-05-07T11:15:23.653Z*
