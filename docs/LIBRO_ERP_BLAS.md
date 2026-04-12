# 📖 LIBRO VIVO — ERP BLAS
> Generado automáticamente por Claude Code
> Fecha: 2026-04-10
> Tipo: ALMACÉN ESTÁTICO (no es memoria, es inventario)
> Ruta del repo: `bodega-san-martin/`

---

## 1. 🗺️ VISIÓN GENERAL

- **Nombre del proyecto:** `buleje` (en `package.json`) — marca comercial: **Buleje** / **Buleje**
- **Descripción (README.md):** "Plataforma completa de e-commerce para abarrotes con delivery, construida con Next.js 16, React 19, Tailwind CSS 4, y Prisma + Supabase."
- **Tipo de producto:** ERP + e-commerce multi-tenant para bodegas familiares en Pucallpa, Perú.
- **Stack detectado:**
  - Framework: **Next.js 16.2.3** (App Router + `cacheComponents: true`)
  - Runtime: **React 19.2.3** / **Node 24 LTS** (Vercel Fluid Compute)
  - Lenguaje: **TypeScript 5** estricto (`ignoreBuildErrors: false`)
  - Estilos: **Tailwind CSS 4** + `@tailwindcss/postcss`
  - ORM: **Prisma 7.4.2** + `@prisma/adapter-pg`
  - DB: **PostgreSQL** vía **Supabase** (pooler + direct URL)
  - Auth: JWT cookie custom + bcryptjs + TOTP (2FA pendiente migración)
  - Validación: **Zod 4.3.6** (regla CLAUDE.md #2: siempre `safeParse`)
  - UI kit: componentes propios + `lucide-react` + `framer-motion` + `gsap`
  - Estado cliente: React Context (no Redux/Zustand)
  - Mobile: **Capacitor** (iOS/Android) — `capacitor.config.ts`
  - Testing: **Vitest 4** + **Playwright 1.59** + **k6** (load)
  - CI/Hooks: **Husky 9** + **lint-staged 16** + **commitlint 20**
- **Versión actual:** `0.1.1` (package.json)
- **Gestor de paquetes:** **npm** (existe `package-lock.json`, no pnpm/yarn)
- **Framework principal:** **Next.js 16 App Router** con Cache Components (PPR + `"use cache"` + `cacheLife` + `cacheTag`)

---

## 2. 📁 ESTRUCTURA DE CARPETAS (top 3 niveles relevantes)

```
bodega-san-martin/
├── app/                         # Next.js App Router (rutas + API)
│   ├── (marketing)/             # landing agrupada
│   ├── (onboarding)/            # flujo de alta tenant
│   ├── (store)/                 # tienda pública
│   ├── admin/                   # panel admin de cada tenant
│   │   ├── _components/         # AdminNavigation, TabRouter, etc.
│   │   ├── _hooks/
│   │   ├── _lib/
│   │   ├── admin-types.ts       # tabs canónicos (27 módulos)
│   │   ├── cms/
│   │   ├── kiosk/
│   │   ├── login/
│   │   ├── pos-mobile/
│   │   └── webhook-queue/
│   ├── api/                     # 546 route.ts — backend REST
│   ├── api-docs/                # OpenAPI swagger UI
│   ├── cms/
│   ├── delivery/ delivery-app/
│   ├── invite/
│   ├── marketplace/
│   ├── onboarding/
│   ├── panel/ pedido/ pricing/ saas/
│   ├── superadmin/              # SuperAdmin global (platform)
│   │   ├── activity/ analytics/ control-center/ dashboard/
│   │   ├── health/ integraciones/ login/ marketplace/
│   │   ├── project-intel/ roadmap/ settings/ setup/
│   │   ├── stores/ tenants/
│   │   └── layout.tsx           # SuperAdminAuthGate
│   ├── supplier/ t/ tracking/ venta/
│   ├── layout.tsx error.tsx global-error.tsx not-found.tsx
│   ├── manifest.ts icon.tsx robots.ts sitemap.ts
│   └── favicon.ico
├── components/                  # 138 .tsx compartidos
│   ├── admin/                   # componentes del panel admin
│   ├── checkout/                # CheckoutModal + steps (zona peligrosa)
│   ├── superadmin/              # shell + widgets platform
│   ├── ui/                      # primitivos UI
│   └── [muchos *.tsx a nivel raíz]
├── contexts/                    # 11 React Contexts
├── data/                        # catálogos estáticos (catalog-peru.ts…)
├── docs/                        # documentación del proyecto
│   ├── adr/                     # Architecture Decision Records
│   ├── compliance/
│   ├── ARCHITECTURE.md CLAUDE-EXTENDED.md ROADMAP-24-WEEKS.md
│   ├── STATUS_LEVEL5_REAL.md TECH-DEBT.md VISION_2027.md
│   └── LIBRO_ERP_BLAS.md        # ← este archivo
├── e2e/                         # Playwright tests
├── evals/                       # automated evals (checkout, fiado, SUNAT)
├── hooks/                       # hooks globales (useXxx)
├── lib/                         # todo el dominio + utilidades
│   ├── agents/ ai/ analytics/ audit/ auth/ billing/
│   ├── cache/ catalog/ churn/ cms/ cms-db/ compliance/
│   ├── coupons/ credit/ db/ queue/ …
│   └── [~70 subdirectorios + utilidades sueltas]
├── prisma/                      # schema + migrations + seeds
│   ├── schema.prisma            # 137 models
│   ├── migrations/              # 28 migraciones + MANUAL + proposed
│   ├── seed.ts seed-demo.ts seed-fruteria.ts
│   └── manual_scripts/
├── public/                      # assets estáticos
├── runbooks/                    # 8 runbooks operacionales
├── scripts/                     # tsx scripts (cleanup, codegen, alerts)
├── slo/                         # SLOs + error budgets
├── stories/                     # Storybook
├── __tests__/ __mocks__/        # Vitest
├── android/ ios(no)             # Capacitor mobile
├── chaos/                       # chaos engineering configs
├── k6/                          # load tests
├── logs/ reports/ test-results/ playwright-report/
├── capacitor.config.ts next.config.ts prisma.config.ts
├── proxy.ts                     # middleware v16 (reemplaza middleware.ts)
├── vitest.config.ts vitest.setup.ts playwright.config.ts
├── sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts
├── vercel.json eslint.config.mjs postcss.config.mjs
├── commitlint.config.mjs release-please-config.json
├── tsconfig.json package.json package-lock.json
└── README.md CHANGELOG.md CODEX-GUIDE.md MEMORIA-PROYECTO.md
```

---

## 3. 🧱 MÓDULOS DETECTADOS

> El proyecto **no usa** la convención `src/modules/`. Los módulos de negocio se organizan en tres capas:
> 1. **Ruta / UI:** `app/admin/*` (27 tabs declarados en `admin-types.ts`)
> 2. **Dominio / DB:** `lib/db/*.db.ts` (regla CLAUDE.md #1 — nunca Prisma directo)
> 3. **API:** `app/api/*/route.ts` (546 handlers)
>
> Abajo se listan los 27 módulos del admin + los submódulos principales detectados en `lib/db/`.

### 3.1 IA & Analítica (`asistente-ia`)
- **Ruta UI:** `app/admin/` tab `asistente-ia`
- **DB classes:** `analytics.db.ts`, `product-analytics.db.ts`, `sales-anomalies.db.ts`, `forecasting.db.ts`, `stockout-predictions.db.ts`, `recommendations-personalized.db.ts`, `search-suggestions.db.ts`
- **API:** `app/api/ai/*`, `app/api/analytics/*`, `app/api/recommendations/*`, `app/api/recommender/*`, `app/api/demand-prediction/*`
- **Lib:** `lib/ai/*`, `lib/ai-*.ts` (quality-evaluator, safety, temperatures, usage-tracker, conversation-memory, ab-testing, failure-monitor, json-parser)
- **Componentes:** `components/admin/AIAssistant.tsx`, `AIFloatingButton.tsx`, `AIHealthPanel.tsx`, `AIProductDescriptionGenerator.tsx`, `AIReviewResponder.tsx`
- **Modelos IA:** Groq (`GROQ_API_KEY`), Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`), Vercel AI SDK v6
- **Estado:** 🟢 Implementado

### 3.2 Ventas & Caja (`ventas-caja`)
- **Sub-tabs:** dashboard, vender, turnos, caja, pedidos, fiados, cuadrar
- **DB classes:** `sales.db.ts`, `orders.db.ts` (zona peligrosa — idempotency + state machine), `turnos.db.ts`, `fiados.db.ts`
- **API:** `app/api/sales/*`, `app/api/orders/*`, `app/api/pos/*`, `app/api/turnos/*`, `app/api/cash-registers/*`
- **Componentes clave:** `CheckoutModal.tsx` (~119 KB, zona peligrosa), `CashChangeCalculator.tsx`, `YapePaymentPanel.tsx`, `PlinPaymentPanel.tsx`, `CartSidebar.tsx`
- **Estado:** 🟢 Implementado

### 3.3 Inventario (`inventario`)
- **Sub-tabs:** stock, alertas, movimientos, conteo, valorizado
- **DB classes:** `inventory.db.ts`, `batches.db.ts`, `mermas.db.ts`
- **API:** `app/api/inventory/*`, `app/api/inventory-movements/*`, `app/api/stock-alerts/*`, `app/api/reorder-alerts/*`, `app/api/mermas/*`, `app/api/batches/*`
- **Lib:** `lib/db/inventory.db.ts` + triggers en schema Prisma
- **Estado:** 🟢 Implementado

### 3.4 Productos & Precios (`productos`)
- **DB classes:** `products.db.ts`, `product-variants.db.ts`, `product-images.db.ts`, `product-analytics.db.ts`
- **API:** `app/api/products/*`, `app/api/product-search/*`, `app/api/price-history/*`, `app/api/price-comparison/*`, `app/api/discount-rules/*`
- **Seeds:** `prisma/seed.ts`, `prisma/seed-fruteria.ts`
- **Estado:** 🟢 Implementado

### 3.5 Compras (`compras-mod`)
- **DB classes:** `purchases.db.ts`, `supplier-portal.db.ts`, `supplier-signup.db.ts`
- **API:** `app/api/purchases/*`, `app/api/suppliers/*`, `app/api/supplier/*`, `app/api/supplier-evaluations/*`, `app/api/supplier-returns/*`, `app/api/proveedores/*`, `app/api/payables/*`
- **Estado:** 🟢 Implementado

### 3.6 Mi Plata / Finanzas (`plata`)
- **DB classes:** `finance.db.ts`, `treasury.db.ts`
- **API:** `app/api/treasury/*`, `app/api/presupuesto/*`, `app/api/invoices/*`
- **Estado:** 🟢 Implementado

### 3.7 Mis Clientes (`clientes`)
- **DB classes:** `customers.db.ts`, `loyalty.db.ts`
- **API:** `app/api/customers/*`, `app/api/customer/*`, `app/api/customer-preferences/*`, `app/api/customer-notifications/*`, `app/api/loyalty/*`, `app/api/birthday-coupons/*`
- **Estado:** 🟢 Implementado

### 3.8 Fiados (`fiados`)
- **DB classes:** `fiados.db.ts` + modelo Prisma `Fiado` + `FiadoCuota`
- **API:** (queries vía fiados.db.ts)
- **Estado:** 🟢 Implementado

### 3.9 Turnos (`turnos`)
- **DB classes:** `turnos.db.ts` + modelo Prisma `Turno`
- **API:** `app/api/turnos/*`
- **Estado:** 🟢 Implementado

### 3.10 Recetas (`recetas`)
- **DB classes:** `recetas.db.ts` + `Receta` + `RecetaIngrediente` + `ProduccionLote`
- **API:** `app/api/recetas/*`, `app/api/recipes/*`
- **Estado:** 🟢 Implementado

### 3.11 Préstamos (`prestamos`)
- **DB classes:** `prestamos.db.ts` + `Prestamo` + `PrestamoCuota` + `PrestamoDocumento`
- **API:** `app/api/prestamos/*`
- **Estado:** 🟢 Implementado

### 3.12 Auditoría (`auditoria`)
- **Lib:** `lib/audit/`, `lib/audit-logger.ts` + modelo Prisma `ActivityLog`
- **API:** `app/api/activity-log/*`, `app/api/audit-trail/*`, `app/api/security-logs/*`
- **Hash chain SHA-256** (ADR-036 Ley 29733)
- **Estado:** 🟢 Implementado

### 3.13 Devoluciones (`devoluciones-proveedor`)
- **DB:** modelos `SupplierReturn`, `SupplierReturnItem`, `Return`, `ReturnItem`
- **API:** `app/api/returns/*`, `app/api/supplier-returns/*`
- **Estado:** 🟢 Implementado

### 3.14 Tesorería (`tesoreria`)
- **DB classes:** `treasury.db.ts` (Cuenta, Movimiento, Transferencia)
- **API:** `app/api/treasury/*`
- **Estado:** 🟢 Implementado

### 3.15 Promociones (`promociones`)
- **DB classes:** `promotions.db.ts`, `coupons.db.ts`, `sponsored-boosts.db.ts`
- **Lib:** `lib/coupons/`
- **API:** `app/api/promotions/*`, `app/api/coupons/*`
- **Estado:** 🟢 Implementado

### 3.16 Scoring de Crédito (`scoring`)
- **DB classes:** `credit.db.ts`
- **Lib:** `lib/credit/`
- **Modelos Prisma:** `CreditProfile`, `CreditInstallment`, `CreditScoreHistory`, `CreditReminder`
- **API:** `app/api/credit/*`
- **Estado:** 🟢 Implementado

### 3.17 Documentos (`documentos`)
- **DB classes:** `cotizaciones.db.ts`, `guias-remision.db.ts`, `notas-credito.db.ts`
- **API:** `app/api/cotizaciones/*`, `app/api/notas-credito/*`
- **Estado:** 🟢 Implementado

### 3.18 Marketplace (`marketplace-ops`)
- **DB classes:** `marketplace.db.ts`
- **API:** `app/api/marketplace/*`, `app/superadmin/marketplace/`
- **Modelos:** `Store`, `StoreBanner`, `StoreProduct`, `WholesaleOrder`, `CommissionLedger`, `StorePermission`
- **Estado:** 🟢 Implementado

### 3.19 Mi Tienda (`mi-tienda`)
- **Lib:** `lib/db/store-banners.db.ts`
- **Estado:** 🟢 Implementado

### 3.20 Configuración (`config`)
- **DB classes:** `settings.db.ts`, `platform-settings.db.ts`
- **API:** `app/api/settings/*`, `app/api/superadmin/settings/*`
- **Estado:** 🟢 Implementado

### 3.21 SUNAT (facturación electrónica Perú)
- **DB classes:** `sunat.db.ts` + modelos `TenantSunatConfig`, `SunatInvoice`
- **API:** `app/api/sunat/config`, `app/api/sunat/emit`, `app/api/sunat/emit-on-sale`, `app/api/sunat/invoices`, `app/api/sunat/status`, `app/api/sunat/void`
- **Provider:** Nubefact (`SUNAT_API_URL`, `SUNAT_API_TOKEN`)
- **Estado:** 🟢 Implementado

### 3.22 WhatsApp Commerce
- **DB:** modelos `TenantWhatsAppConfig`, `WhatsAppConversation`
- **API:** `app/api/whatsapp/concierge`, `app/api/whatsapp/webhook`, `app/api/webhooks/whatsapp/*`
- **Provider:** WhatsApp Business Cloud API (Meta) + Groq para IA concierge
- **Estado:** 🟢 Implementado

### 3.23 CMS (page builder)
- **Lib:** `lib/cms/`, `lib/cms-db/`
- **API:** `app/api/cms/*` + `app/cms/` + `app/admin/cms/`
- **Modelos:** `Page`, `PageBlock`, `BlockTemplate`, `Media`, `PageVersion`, `ThemeSettings`, `Navigation`
- **UI:** TipTap (`@tiptap/*`) + dnd-kit + craftjs
- **Estado:** 🟢 Implementado

### 3.24 Delivery
- **DB classes:** `delivery.db.ts`
- **API:** `app/api/delivery-slots/*`
- **Modelos:** `DeliveryPartner`, `DeliveryAssignment`, `DeliveryTracking`, `DeliveryRoute`, `DeliveryRouteStop`, `DeliverySlot`
- **UI:** `app/delivery/`, `app/delivery-app/`
- **Tracking:** Leaflet + leaflet.heat
- **Estado:** 🟢 Implementado

### 3.25 Notificaciones / Notification Center
- **DB classes:** `notifications.db.ts`
- **Lib:** `lib/create-notification.ts`
- **API:** `app/api/notifications/*`, `app/api/notification-center/*`, `app/api/customer-notifications/*`
- **Modelos:** `NotificationLog`, `CustomerNotification`, `PushSubscription`, `MessageTemplate`, `Notification`
- **Push:** `web-push` (VAPID)
- **Estado:** 🟢 Implementado

### 3.26 SuperAdmin (platform)
- **Rutas:** `app/superadmin/*` (13 sub-rutas + `integraciones` nueva)
- **API:** `app/api/superadmin/*` (activity, analytics, audit, auth, churn, commissions, costs, health, impersonate, marketplace, notifications, project-intel, purge, roadmap, settings, stores, tenants, **integrations** nueva)
- **Lib:** `lib/superadmin-session.ts`, `lib/db/platform-settings.db.ts`, `lib/db/roadmap-status.db.ts`
- **Shell:** `components/superadmin/SuperAdminShell.tsx`
- **Estado:** 🟢 Implementado

### 3.27 Integraciones y funciones (`integraciones`) — NUEVO 2026-04-10
- **Ruta UI:** `app/superadmin/integraciones/page.tsx`
- **API:** `app/api/superadmin/integrations/route.ts`
- **Storage:** `PlatformSettingsDB` con keys `integrations-overview` + `integrations-new`
- **Descripción:** panorama plano del sistema + bitácora de nuevas integraciones
- **Estado:** 🟢 Implementado (creado esta sesión)

---

## 4. 🗄️ BASE DE DATOS (Prisma + Supabase Postgres)

> Esquema en `prisma/schema.prisma` — **137 models**. La app **no usa `supabase/functions`** ni Edge Functions de Supabase: toda la lógica corre en Next.js Route Handlers (Fluid Compute).

### 4.1 Tablas principales detectadas (extracto, 137 en total)

| Tabla | Propósito | Multi-tenant | Notas |
|---|---|---|---|
| `Tenant` | Bodegas registradas (tenant raíz) | — | Slug, branding, plan SaaS, mercadopago, email verification |
| `AdminUser` | Usuarios admin por tenant | ✅ tenantId | 6 roles |
| `Product` | Catálogo de productos | ✅ | Relación con `ProductImage`, `ProductVariant` |
| `ProductImage` / `ProductVariant` | Multimedia + variantes | ✅ | |
| `Customer` | Clientes finales de la bodega | ✅ | + `LoyaltyTransaction`, `SavedCart`, `SavedLocation` |
| `Order` | Pedidos (zona peligrosa — idempotency) | ✅ | State machine + `OrderItem` + `OrderStatusHistory` |
| `Sale` / `SaleItem` | Ventas POS | ✅ | |
| `Review` / `ReviewVote` | Reseñas de productos | ✅ | |
| `Settings` | Config por tenant | ✅ | JSON |
| `Supplier` | Proveedores | ✅ | + `PurchaseOrder`, `PurchaseItem`, `SupplierEvaluation`, `SupplierReturn` |
| `Payable` / `Payment` / `Expense` | Cuentas por pagar | ✅ | |
| `CashRegister` / `CashMovement` | Caja / cuadre diario | ✅ | |
| `InventoryMovement` | Kardex | ✅ | |
| `Coupon` | Cupones | ✅ | |
| `Return` / `ReturnItem` | Devoluciones de cliente | ✅ | |
| `ShoppingList` / `ShoppingListItem` | Listas de compra guardadas | ✅ | |
| `PriceHistory` | Histórico de precios | ✅ | |
| `DeliverySlot` | Ventanas de entrega | ✅ | |
| `AdminMessage` | Mensajes interno-admin | ✅ | |
| `ActivityLog` | Audit log (hash chain) | ✅ | Ley 29733 |
| `PushSubscription` | Web Push VAPID | ✅ | |
| `NotificationLog` / `CustomerNotification` / `Notification` / `MessageTemplate` | Sistema notificaciones | ✅ | |
| `Page` / `PageBlock` / `BlockTemplate` / `Media` / `PageVersion` / `ThemeSettings` / `Navigation` | CMS page builder | ✅ | |
| `TenantWhatsAppConfig` / `WhatsAppConversation` | WhatsApp Commerce | ✅ | |
| `StripeWebhookQueue` | Queue webhooks Stripe | — | |
| `MpPendingPlan` | MercadoPago pending plans | ✅ | |
| `Note` / `Reminder` | Notas y recordatorios | ✅ | |
| `Batch` | Lotes / caducidades | ✅ | |
| `SavedFilter` | Filtros guardados | ✅ | |
| `ChatMessage` | Chat interno | ✅ | |
| `ABTest` / `ABTestEvent` | A/B testing | ✅ | |
| `SurveyResponse` | Encuestas | ✅ | |
| `TenantInvitation` | Invitaciones | ✅ | |
| `NewsletterSubscriber` | Newsletter | ✅ | |
| `CronDeadLetter` | Cron retries | — | |
| `Warehouse` / `Transfer` / `Location` | Multi-almacén | ✅ | |
| `ApiKey` | API keys por tenant | ✅ | |
| `VisitorWelcome` / `Campaign` | Marketing | ✅ | |
| `CommissionRule` / `CommissionLedger` | Comisiones marketplace | ✅ | |
| `DailySummary` | Cierre diario | ✅ | |
| `Fiado` / `FiadoCuota` | Deudas a clientes (fiado) | ✅ | |
| `Turno` | Turnos de caja | ✅ | |
| `Receta` / `RecetaIngrediente` / `ProduccionLote` | Recetas producción | ✅ | |
| `Prestamo` / `PrestamoCuota` / `PrestamoDocumento` | Préstamos | ✅ | |
| `TreasuryCuenta` / `TreasuryMovimiento` / `TreasuryTransferencia` | Tesorería | ✅ | |
| `Cotizacion` / `CotizacionItem` | Cotizaciones | ✅ | |
| `GuiaRemision` / `GuiaRemisionItem` | Guías de remisión | ✅ | |
| `NotaCredito` | Notas de crédito | ✅ | |
| `ConteoFisico` / `ConteoFisicoItem` | Conteo físico inventario | ✅ | |
| `DiscountRule` | Reglas de descuento | ✅ | |
| `ComplianceItem` | Compliance Ley 29733 | ✅ | |
| `CustomKpi` | KPIs personalizados | ✅ | |
| `Store` / `StoreBanner` / `StoreProduct` | Marketplace | ✅ | |
| `DeliveryPartner` / `DeliveryAssignment` / `DeliveryTracking` / `DeliveryRoute` / `DeliveryRouteStop` | Delivery | ✅ | |
| `ConversationThread` / `ConversationMessage` | Chat cliente↔admin | ✅ | |
| `WholesaleOrder` / `WholesaleOrderItem` | Mayoreo | ✅ | |
| `StorePermission` | Permisos marketplace | ✅ | |
| `SupplierPortal` | Portal de proveedor | ✅ | |
| `SupportTicket` | Soporte | ✅ | |
| `TenantSunatConfig` / `SunatInvoice` | SUNAT facturación | ✅ | |
| `TenantHealthScore` / `ChurnSignal` / `ChurnPlaybook` | Anti-churn SaaS | ✅ | |
| `CreditProfile` / `CreditInstallment` / `CreditScoreHistory` / `CreditReminder` | Scoring crédito | ✅ | |
| `ForecastLog` | Forecasting IA | ✅ | |
| `SupplierPriceVersion` / `SupplierRating` / `SupplierOffer` | Proveedores avanzado | ✅ | |
| `AIConversation` / `AIMessage` | Historial IA | ✅ | |
| `ProductAnalytics` / `StockoutPrediction` / `SalesAnomaly` / `SponsoredBoost` / `SearchSuggestion` | Analítica IA | ✅ | |
| `RoadmapItemStatus` | Roadmap platform | — | |
| `PlatformSetting` | K/V global de platform | — | Usado por `integraciones` |
| `TenantFeatureFlag` | Feature flags por tenant | ✅ | |

> **RLS (Row Level Security):** el proyecto **no usa RLS de Postgres**. El aislamiento multi-tenant se enforce en la capa de aplicación vía `tenantId` obligatorio en toda query (regla CLAUDE.md #3) + `requireAdmin()` con roles (regla #9).

### 4.2 Migraciones encontradas

**28 migraciones reales** en `prisma/migrations/` + scripts manuales + propuestas:

| # | Migración |
|---|---|
| 1 | `20260307161913_init` |
| 2 | `20260309160725_add_new_fields` |
| 3 | `20260310195849_add_cms_tables` |
| 4 | `20260311212619_add_order_discount_fields` |
| 5 | `20260316120000_add_idempotency_soft_delete` |
| 6 | `20260317000000_add_partial_and_composite_indexes` |
| 7 | `20260317010000_add_feature_flags` |
| 8 | `20260317020000_add_stripe_webhook_queue` |
| 9 | `20260318000000_add_product_description_review_productid` |
| 10 | `20260318010000_add_review_admin_reply` |
| 11 | `20260318020000_add_transfer_location_models` |
| 12 | `20260318030000_add_warehouse_product_links` |
| 13 | `20260318040000_add_createdby_inventory_movement` |
| 14 | `20260328000000_add_prestamos_guia_new_fields` |
| 15 | `20260404161123_remove_default_main` |
| 16 | `20260404190000_add_tenant_branding` |
| 17 | `20260404191000_add_mercadopago_fields` |
| 18 | `20260404192000_add_email_verification` |
| 19 | `20260404193000_add_mp_pending_plan` |
| 20 | `20260404194000_add_anti_churn` |
| 21 | `20260404200000_add_sunat_models` |
| 22 | `20260404210000_add_whatsapp_commerce` |
| 23 | `20260404220000_add_forecast_log` |
| 24 | `20260404230000_add_credit_engine` |
| 25 | `20260404240000_add_supplier_portal_models` |
| 26 | `20260406181344_add_fk_indexes_for_supabase_audit` |
| 27 | `20260406210602_add_ai_conversation_and_message` |
| 28 | `20260409230000_add_loyalty_transaction` |

**Scripts manuales / propuestas:**
- `MANUAL-marketplace-bloque-a/b/c/d2/d3.sql` — bloques de marketplace aplicados a mano
- `proposed-admin-totp.sql` — migración 2FA admin (pendiente)
- `proposed-superadmin-totp.sql` — migración 2FA superadmin (pendiente)
- `proposed-db-indexes-wave-1.sql` — optimización índices (pendiente)
- `proposed-pgvector.sql` — habilitar pgvector (pendiente — parte del sprint)
- `PENDING_AI_MODELS_MIGRATION.md` — doc de la migración IA pendiente

### 4.3 Edge Functions de Supabase
⚠️ **No detectado en el código.** El proyecto no usa `supabase/functions/`. Toda la lógica backend corre en **Next.js Route Handlers** sobre Vercel Fluid Compute (546 archivos `route.ts` en `app/api/`). Supabase se usa únicamente como Postgres gestionado + `@supabase/supabase-js` (client) para ciertos queries read-only y storage.

---

## 5. 🔌 INTEGRACIONES EXTERNAS

| Servicio | Dónde se usa | Variables .env requeridas |
|---|---|---|
| **Supabase Postgres** | ORM Prisma + queries directas | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **SUNAT (Nubefact)** | Facturación electrónica Perú (`lib/db/sunat.db.ts`, `app/api/sunat/*`) | `SUNAT_API_URL`, `SUNAT_API_TOKEN`, `SUNAT_RUC`, `SUNAT_RAZON_SOCIAL`, `SUNAT_DIRECCION` |
| **RENIEC** | Validación DNI (`app/api/reniec/*`) | `RENIEC_API_URL`, `RENIEC_API_TOKEN` |
| **WhatsApp Business API** | Notificaciones + concierge IA (`app/api/whatsapp/*`, `app/api/webhooks/whatsapp/*`) | `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_URL` |
| **Stripe** | Suscripciones SaaS + Stripe Connect | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_CLIENT_ID` |
| **MercadoPago** | Pasarela pagos local | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` |
| **Resend** | Email transaccional | `NOTIFY_EMAIL` + API key en código |
| **Nodemailer SMTP** | Email fallback | `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL` |
| **Groq** | LLM rápido (IA concierge WhatsApp) | `GROQ_API_KEY` |
| **Anthropic Claude** | LLM calidad (`@ai-sdk/anthropic`) | ⚠️ Variable no en .env.example — revisar |
| **OpenAI** | LLM (`@ai-sdk/openai`) | ⚠️ Variable no en .env.example — revisar |
| **Sentry** | Error monitoring | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` |
| **PostHog** | Feature flags + analytics runtime | ⚠️ No detectado en .env.example — revisar `lib/posthog*` |
| **Vercel** | Deploy + Analytics + Speed Insights + OTel | Platform env (no .env) |
| **Upstash Redis** | Rate limit + cache | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_URL` |
| **BullMQ** | Job queue (`lib/queue/workers.ts`) | usa `REDIS_URL` |
| **Web Push (VAPID)** | Push notifications web | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VAPID_EMAIL` |
| **Google Maps** | Mapas / geolocalización | `GOOGLE_MAPS_API_KEY` |
| **Google Analytics / GTM / Clarity** | Web analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_CLARITY_PROJECT_ID` |
| **Capacitor (iOS/Android)** | App móvil nativa | `capacitor.config.ts` — pe.buleje.app |
| **Leaflet + leaflet.heat** | Mapas delivery | (client-side only) |
| **OpenTelemetry** | Observabilidad | `@vercel/otel` + `@opentelemetry/api` |

---

## 6. 🛣️ RUTAS / ENDPOINTS

### 6.1 Frontend (Next.js App Router)

**Grupos de ruta detectados en `app/`:**

| Grupo | Ruta | Propósito |
|---|---|---|
| `(marketing)` | `/` (landing) | Home, pricing, about |
| `(onboarding)` | `/onboarding`, `/invite` | Alta nueva bodega |
| `(store)` | `/t/[slug]/...` | Tienda pública por subdominio/slug |
| `admin` | `/admin` + `/admin/login`, `/admin/cms`, `/admin/kiosk`, `/admin/pos-mobile`, `/admin/webhook-queue` | Panel del tenant (27 tabs en `page.tsx`) |
| `superadmin` | `/superadmin/{dashboard,control-center,roadmap,project-intel,integraciones,tenants,stores,analytics,health,setup,activity,settings,login,marketplace}` | Platform admin |
| `delivery` | `/delivery`, `/delivery-app` | Apps para repartidores |
| `cms` | `/cms` | CMS page builder |
| `supplier` | `/supplier` | Portal proveedores |
| `marketplace` | `/marketplace` | Marketplace B2B |
| `pedido` | `/pedido/[id]` | Tracking pedido |
| `tracking` | `/tracking` | Tracking público |
| `venta` | `/venta` | Flujo venta rápida |
| `pricing` | `/pricing` | Planes SaaS |
| `saas` | `/saas` | Landing SaaS |
| `panel` | `/panel` | Panel genérico |
| `offline` | `/offline` | PWA offline page |
| `api-docs` | `/api-docs` | Swagger UI |

### 6.2 Backend (Route Handlers)

**546 archivos `route.ts`** en `app/api/`. Agrupados en ~141 carpetas top-level:

```
activity-log, abandoned-cart, admin, admin-chat, admin-users, agents, ai,
ai-assistant, analytics, api-keys, audit-trail, auth, auto-reorder, backup,
backups, barcode-lookup, batches, beta-feedback, billing, birthday-coupons,
bundles, campaigns, cart, cash-registers, changelog, chat, cierre-diario,
cms, commission-rules, commissions, compliance, compras, contratos,
cotizaciones, coupons, credit, cron, custom-kpis, customer,
customer-notifications, customer-preferences, customers, daily-digest,
daily-report, delivery, delivery-slots, demand-prediction, demo,
discount-rules, internal, inventory, inventory-movements, invite, invoices,
locations, loyalty, marketplace, me, mermas, message-templates, newsletter,
notas-credito, notes, notification-center, notifications, ocr, og,
onboarding, orders, payables, plan, platform, pos, prestamos, presupuesto,
price-comparison, price-history, pricing, product-search, products,
promotions, proveedores, purchases, pwa-icon, recetas, recipes,
recommendations, recommender, referrals, reminders, reniec, reorder-alerts,
returns, reviews, sales, saved-filters, search, security-logs, settings,
shopping-feed, shopping-lists, squad, stock-alerts, store-permissions,
stripe-connect, suggestions, sunat, superadmin, supplier,
supplier-evaluations, supplier-returns, suppliers, support, surveys, tags,
tasks, tenant, tenants, track, transfers, treasury, turnos, upload, v1,
visitor-welcome, webhooks, whatsapp, wholesale, workers
```

**Middleware:** `proxy.ts` (renombrado de `middleware.ts` en Next 16) — auth + CSP + tenant resolution + rate limit (ADR-014).

---

## 7. 🧩 COMPONENTES UI COMPARTIDOS

**138 archivos .tsx** en `components/` (raíz). Subcarpetas:

- `components/ui/` (10 archivos): `AnimatedCounter.tsx`, `ClientEffects.tsx`, `CustomCursor.tsx`, `FloatingParticles.tsx`, `HeroIllustration.tsx`, `LiveActivityTicker.tsx`, `MorphingBlob.tsx`, `ResponsiveTable.tsx`, `ScrollProgress.tsx`, `error-boundary.tsx`
- `components/admin/` — componentes del panel admin (ABCAnalysisTab, AIAssistant, AdminSidebar, AdminBottomNav, AdminMobileBottomBar, AdminModals, AdminModuleManagerModal, AccountsReceivableTab, ActivityFeed, AchievementBadges, etc.)
- `components/checkout/` (zona peligrosa): `CheckoutModal.tsx`, `CheckoutAccountStep.tsx`, `CheckoutDeliverySchedule.tsx`, `CheckoutNotesField.tsx`, `CheckoutOrderReview.tsx`, `CheckoutPaymentSection.tsx`, `CheckoutSuccessStep.tsx`, `CashChangeCalculator.tsx`, `YapePaymentPanel.tsx`, `PlinPaymentPanel.tsx`, `FreeDeliveryBanner.tsx`, `StepBar.tsx` + `parts/`, `steps/`, `hooks/`, `types.ts`, `index.ts`
- `components/superadmin/`: `SuperAdminShell.tsx`, `CommandPalette.tsx`, `SupportInbox.tsx`, `TenantLifecycleKanban.tsx`, `TenantMonitorPanel.tsx` + `_shared/`, `setup/`, `stores/`, `tenants/`

**Componentes clave a nivel raíz (extracto):**
- `CartSidebar.tsx` (zona peligrosa — BroadcastChannel multi-tab)
- `CheckoutModal.tsx` (zona peligrosa — 119 KB)
- `CommandPalette.tsx` (atajos Ctrl+K)
- `AbandonedCartRecovery.tsx`, `BackInStock.tsx`, `CartRecoveryToast.tsx`
- `CategoryCatalog.tsx`, `CombosSection.tsx`, `CompareBar.tsx`
- `BetaFeedbackWidget.tsx`, `CookieConsent.tsx`, `Confetti.tsx`
- `ApiDocsClientWrapper.tsx`, `ApiDocsPage.tsx`, `AccessibilityBar.tsx`, `AdvancedSearchPanel.tsx`, `AlsoBoughtSection.tsx`, `AnnouncementBar.tsx`, `Analytics.tsx`, `BreadcrumbSchema.tsx`

---

## 8. 🪝 HOOKS GLOBALES

Ubicación: `hooks/` (32 archivos)

| Hook | Propósito |
|---|---|
| `use-ab-test.ts` | A/B testing client |
| `use-admin-shortcuts.ts` | Atajos teclado admin |
| `use-admin-sse.ts` | Server-Sent Events admin |
| `use-advanced-search.ts` | Búsqueda avanzada |
| `use-auto-refresh.ts` | Auto-refresh data |
| `use-cached-data.ts` | Cache client |
| `use-first-order.ts` | Flag primer pedido |
| `use-in-view.ts` | IntersectionObserver |
| `use-keyboard-shortcuts.ts` | Atajos globales |
| `use-local-storage-draft.ts` | Draft forms |
| `use-local-storage.ts` | localStorage wrapper |
| `use-magnetic.ts` | Efecto magnético cursor |
| `use-marketplace-cart.ts` | Carrito marketplace |
| `use-metering.ts` | Metering uso plan |
| `use-notifications.ts` | Notificaciones |
| `use-onboarding.ts` | Flujo onboarding |
| `use-online-status.ts` | Online/offline |
| `use-optimized-image.ts` | Imagen optimizada |
| `use-pagination.tsx` | Paginación |
| `use-preferences.ts` | Preferencias cliente |
| `use-ripple.ts` | Efecto ripple |
| `use-scroll-lock.ts` | Lock scroll modal |
| `use-shopping-list.ts` | Listas de compra |
| `use-store-products.ts` | Productos de tienda |
| `use-swipe.ts` | Swipe touch |
| `use-table-export.ts` / `useTableExport.ts` | Export tablas (CSV/Excel) |
| `use-tilt.ts` | Efecto tilt 3D |
| `use-toast.ts` | Toasts |
| `use-token-refresh.ts` | Refresh JWT |
| `useModuleTiers.ts` | Módulos por plan |
| `useProductAnalyticsTracking.ts` | Tracking analytics |

**Contextos React (`contexts/`, 11 archivos):**
`cart-context`, `compare-context`, `customer-context`, `favorites-context`, `promotions-context`, `reviews-context`, `settings-context`, `tenant-context`, `theme-context`, `toast-context`, `wishlist-context`

---

## 9. 📦 DEPENDENCIAS CLAVE (de package.json)

### Producción

| Paquete | Versión | Para qué se usa |
|---|---|---|
| `next` | `^16.2.3` | Framework principal (App Router + Cache Components) |
| `react` / `react-dom` | `19.2.3` | UI |
| `@prisma/client` / `prisma` | `^7.4.2` | ORM |
| `@prisma/adapter-pg` | `^7.4.2` | Driver Postgres para Prisma 7 |
| `@supabase/supabase-js` | `^2.99.0` | Cliente Supabase (queries read-only, storage) |
| `pg` | `^8.20.0` | Driver Postgres directo |
| `zod` | `^4.3.6` | Validación (regla #2: `safeParse`) |
| `@ai-sdk/anthropic` | `^3.0.68` | Claude AI SDK |
| `@ai-sdk/openai` | `^3.0.52` | OpenAI AI SDK |
| `ai` | `^6.0.157` | Vercel AI SDK v6 |
| `@sentry/nextjs` | `^10.43.0` | Error monitoring |
| `stripe` | `^20.4.1` | Pasarela pagos internacional |
| `mercadopago` | `^2.12.0` | Pasarela pagos local |
| `resend` | `^6.10.0` | Email transaccional |
| `nodemailer` | `^8.0.1` | Email SMTP fallback |
| `web-push` | `^3.6.7` | Push VAPID |
| `bullmq` | `^5.73.0` | Job queue |
| `@upstash/ratelimit` + `@upstash/redis` | `^2.0.5` / `^1.34.3` | Rate limit + cache |
| `bcryptjs` | `^3.0.3` | Hash passwords |
| `framer-motion` | `^12.35.0` | Animaciones |
| `gsap` | `^3.14.2` | Animaciones avanzadas |
| `lucide-react` | `^0.577.0` | Iconos |
| `recharts` | `^3.8.0` | Charts |
| `leaflet` + `leaflet.heat` | `^1.9.4` / `^0.2.0` | Mapas delivery |
| `@craftjs/core` | `^0.2.12` | CMS drag-drop |
| `@dnd-kit/core` + `sortable` + `utilities` | — | Drag-drop listas |
| `@tiptap/react` + `starter-kit` + extensions | `^3.20.1` | Rich text editor |
| `@ericblade/quagga2` | `^1.12.1` | Barcode scanner |
| `exceljs` | `^4.4.0` | Export Excel |
| `jspdf` + `jspdf-autotable` | `^4.2.0` / `^5.0.7` | Export PDF |
| `sharp` | `^0.34.5` | Image processing |
| `next-sitemap` | `^4.2.3` | Sitemap SEO |
| `posthog-js` + `posthog-node` | `^1.367.0` / `^5.29.2` | Feature flags + analytics |
| `@vercel/analytics` + `@vercel/speed-insights` + `@vercel/otel` | — | Observabilidad Vercel |
| `@opentelemetry/api` | `^1.9.1` | OTel |
| `@asteasolutions/zod-to-openapi` | `^8.5.0` | OpenAPI spec generation |
| `canvas-confetti` | `^1.9.4` | Confeti UI |
| `clsx` + `tailwind-merge` | `^2.1.1` / `^3.5.0` | Class utilities |
| `geist` | `^1.7.0` | Font Geist |
| `react-colorful` | `^5.6.1` | Color picker |
| `react-window` | `^1.8.10` | Virtual scrolling |
| `@lottiefiles/dotlottie-react` | `^0.18.6` | Animaciones Lottie |
| `web-vitals` | `^5.1.0` | Core Web Vitals |

### Dev

| Paquete | Versión | Para qué |
|---|---|---|
| `typescript` | `^5` | TypeScript |
| `eslint` + `eslint-config-next` + `eslint-config-prettier` | — | Linting |
| `prettier` | `^3.8.1` | Format |
| `vitest` + `@vitest/coverage-v8` | `^4.0.18` | Unit tests |
| `@testing-library/react` + `jest-dom` + `user-event` | — | RTL |
| `@playwright/test` + `playwright` + `@playwright/mcp` | — | E2E |
| `jsdom` | `^28.1.0` | DOM para tests |
| `husky` + `lint-staged` | `^9.1.7` / `^16.4.0` | Pre-commit |
| `@commitlint/cli` + `@commitlint/config-conventional` | `^20.5.0` | Conventional Commits |
| `storybook` + addons | `^8.6.18` | Storybook |
| `@next/bundle-analyzer` | `^16.1.6` | Bundle size |
| `@size-limit/preset-app` + `size-limit` | `^12.0.1` | Size limits |
| `tailwindcss` + `@tailwindcss/postcss` | `^4` | Tailwind |
| `tsx` | `^4.21.0` | Runner TS scripts |
| `dotenv` | `^17.3.1` | .env loader scripts |
| `cross-env` | `^10.1.0` | Env vars cross-platform |
| `@babel/*` + `babel-loader` | — | Babel pipeline (Storybook) |
| `webpack` + `css-loader` + `style-loader` + `postcss-loader` | — | Storybook bundler |

---

## 10. ⚙️ SCRIPTS NPM

| Script | Comando | Propósito |
|---|---|---|
| `dev` | `next dev` | Dev server |
| `dev:clean` | `taskkill ... & next dev` | Dev con limpieza lock Windows |
| `build` | `next build` | Build producción |
| `analyze` | `cross-env ANALYZE=true next build` | Bundle analyzer |
| `postinstall` | `prisma generate` | Regenerar Prisma client |
| `start` | `next start` | Run build |
| `lint` | `eslint` | Linting |
| `test` | `vitest run` | Unit tests |
| `test:coverage` | `vitest run --coverage` | Coverage |
| `test:e2e` | `playwright test` | E2E headless |
| `test:e2e:ui` | `playwright test --ui` | E2E interactivo |
| `test:load` | `k6 run k6/superadmin.js` | Load test k6 |
| `db:seed` | `tsx prisma/seed.ts` | Seed inicial |
| `db:seed-demo` | `tsx prisma/seed-demo.ts` | Seed demo |
| `db:migrate` | `prisma migrate dev` | Migrate dev |
| `db:cleanup-fake-tenants` | `tsx scripts/cleanup-fake-tenants.ts` | Limpieza tenants |
| `cap:init` | `npx cap init "Buleje" pe.buleje.app --web-dir out` | Capacitor init |
| `cap:add:android` / `cap:add:ios` | `npx cap add android` / `ios` | Añadir plataforma |
| `cap:sync` | `npx cap sync` | Sync web→nativo |
| `cap:open:android` / `cap:open:ios` | `npx cap open ...` | Abrir IDE nativo |
| `app:build` | `next build && npx cap sync` | Build app móvil |
| `prepare` | `husky` | Pre-commit hooks |
| `openapi:generate` | `tsx scripts/generate-openapi.ts` | OpenAPI spec |
| `storybook` | `storybook dev -p 6006` | Storybook dev |
| `build-storybook` | `storybook build` | Build Storybook |
| `queue:workers` | `tsx lib/queue/workers.ts` | Run BullMQ workers |
| `sentry:setup-alerts` | `tsx scripts/setup-sentry-alerts.ts` | Sentry alerts |
| `redis:health` | `node -e "fetch(...)..."` | Health check Redis |

---

## 11. 🔐 VARIABLES DE ENTORNO (de .env.example)

**Básicas:**
- `DATABASE_URL` — Postgres pooler
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `AUTH_SECRET` — JWT (mín. 32 chars)
- `NEXT_PUBLIC_BASE_URL`, `SITE_URL`
- `ADMIN_PASSWORD`
- `CRON_SECRET` (×2 entradas — duplicado)

**Email:**
- `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL`

**Web Push VAPID:**
- `VAPID_EMAIL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

**WhatsApp:**
- `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`

**Pagos:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_CLIENT_ID` (duplicados Stripe en el archivo)
- `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`

**SUNAT (Perú):**
- `SUNAT_API_URL`, `SUNAT_API_TOKEN`, `SUNAT_RUC`, `SUNAT_RAZON_SOCIAL`, `SUNAT_DIRECCION`

**RENIEC:**
- `RENIEC_API_URL`, `RENIEC_API_TOKEN`

**IA:**
- `GROQ_API_KEY`
- ⚠️ `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — **no declarados en .env.example** aunque hay imports `@ai-sdk/anthropic` y `@ai-sdk/openai`

**Observabilidad:**
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_CLARITY_PROJECT_ID`

**Infra:**
- `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `GOOGLE_MAPS_API_KEY`
- `SUPERADMIN_IP_ALLOWLIST`

⚠️ **No detectado en .env.example** (pero usado por librerías instaladas):
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_KEY`, `DIRECT_URL` (documentado en CLAUDE.md pero ausente del .env.example)

---

## 12. 📜 HISTORIAL DE MEJORAS APLICADAS

> Esta sección se llena MANUALMENTE después de cada ciclo. Inicialmente vacía.

### Ciclo #000 — 2026-04-10 — Inicialización del Libro
- **Qué:** Generación inicial del inventario completo por Claude Code
- **Scope:** Stack, 137 modelos Prisma, 28 migraciones, 546 routes API, 27 módulos admin, 14 superadmin rutas, 138 componentes, 32 hooks, 11 contextos, 19 integraciones externas
- **Status:** APPLIED

---

## 13. 🎯 BACKLOG

> Esta sección se llena MANUALMENTE. Inicialmente vacía.

---

## 14. ⚠️ HALLAZGOS DURANTE LA GENERACIÓN

**Cosas raras, código muerto, TODOs, duplicados detectados al explorar:**

1. **`.env.example` incompleto** — `@ai-sdk/anthropic` y `@ai-sdk/openai` están instalados y usados en `lib/ai/*`, pero `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` no figuran en `.env.example`. También falta `DIRECT_URL` (documentado en CLAUDE.md como obligatorio para migraciones) y las PostHog keys.
2. **Variables de entorno duplicadas en `.env.example`** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WHATSAPP_API_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GTM_ID` aparecen 2 veces cada uno (posible merge mal resuelto).
3. **Migraciones pendientes sin aplicar** — `proposed-pgvector.sql`, `proposed-admin-totp.sql`, `proposed-superadmin-totp.sql`, `proposed-db-indexes-wave-1.sql` + `PENDING_AI_MODELS_MIGRATION.md`. Además, a nivel raíz del repo hay `migration-pending.sql`, `migration-prestamos-guia.sql` y `migration-remove-default-main.sql` fuera de `prisma/migrations/`. El `middleware.ts.bak` en la raíz también es residuo de la migración Next 16 (`proxy.ts` es el vigente).
4. **137 modelos Prisma vs CLAUDE.md que dice "131 modelos"** — la doc quedó desactualizada (se añadieron 6 modelos desde la última revisión).
5. **`lib/db/*` tiene 22 TODOs/FIXMEs** sin resolver, la mayoría en clases críticas (pendiente limpieza).
6. **Sin RLS en Supabase** — el aislamiento multi-tenant depende 100% de que cada DB class pase `tenantId`. Un solo olvido en una query puede leakear datos entre bodegas. Mitigado por audit-logger + tests + regla CLAUDE.md #3, pero sin cinturón de seguridad de DB.
7. **`app/api/` tiene 546 route handlers en 141 carpetas** — alta superficie. Difícil auditar consistentemente auth/rate-limit/Zod. Candidato a consolidar en `lib/http/` o a generar registry automático.
8. **Mezcla de `@ai-sdk/anthropic` v3 + `ai` v6 + `posthog-js` v1 + `posthog-node` v5** — versiones muy heterogéneas. Validar compat cruzada antes de upgrades mayores.
9. **No hay `supabase/functions/` ni `supabase/migrations/`** pese a que Supabase es el Postgres de facto. Todo se hace por Prisma+route handlers. Correcto arquitectónicamente, pero el prompt original del libro asumía lo contrario.
10. **Archivos de build persistidos en el repo** — `build-output.txt`, `build-task003.log`, `dev-output.txt`, `lint-output.txt`, `lint-compact.txt`, `tsconfig.tsbuildinfo`. Deberían estar en `.gitignore`.
