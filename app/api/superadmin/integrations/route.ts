import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidate } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * /api/superadmin/integrations
 *
 * Key-value store sobre el modelo Prisma `PlatformSetting` (global, sin
 * tenantId). Dos entradas:
 *   - "integrations-overview" → string con TODO el panorama del proyecto
 *     en una sola línea completa (arquitectura, flujo, módulos,
 *     integraciones externas — SUNAT, email, pagos, etc.).
 *   - "integrations-new"      → lista de nuevas integraciones/mejoras,
 *     cada una con fecha, detalle, estado.
 *
 * Auth: getPlatformSession() (superadmin only).
 * Validación: Zod safeParse (regla CLAUDE.md #2).
 *
 * Nota: accedemos a Prisma directo en vez de pasar por PlatformSettingsDB.get
 * porque su helper `getOrSet` cachea `null` y puede enmascarar errores la
 * primera vez que la key no existe. Aquí queremos fail-loud en dev.
 */

const OVERVIEW_KEY = "integrations-overview";
const NEW_KEY = "integrations-new";
const CACHE_PREFIX = "platform-settings:";

const DEFAULT_OVERVIEW = `╔═══════════════════════════════════════════════════════════════════════════╗
║  Buleje / BULEJE — INVENTARIO COMPLETO DEL SISTEMA             ║
║  Generado: 2026-04-10                                                     ║
╚═══════════════════════════════════════════════════════════════════════════╝

━━━ 1. IDENTIDAD DEL PROYECTO ━━━

Nombre técnico: buleje (package.json) · Marca: Buleje
Tipo: ERP + e-commerce multi-tenant para bodegas familiares en Pucallpa, Perú
Versión actual: 0.1.1
Repo local: C:\\Users\\Usuario\\OneDrive\\Documentos\\Escritorio\\Prueba 2\\bodega-san-martin
Proyecto Vercel vinculado: mercado
App móvil (bundle ID): pe.buleje.app (iOS + Android vía Capacitor)

━━━ 2. STACK TÉCNICO ━━━

Frontend: Next.js 16.2.3 (App Router + cacheComponents true + PPR) · React 19.2.3 · Tailwind CSS 4 · TypeScript 5 estricto (ignoreBuildErrors false)
Backend: Next.js Route Handlers (546 archivos route.ts) · Node 24 LTS · Vercel Fluid Compute (300s timeout)
DB: PostgreSQL vía Supabase (pooler + DIRECT_URL) · Prisma 7.4.2 + @prisma/adapter-pg
Validación: Zod 4.3.6 (siempre safeParse, nunca parse)
Auth: JWT cookie custom + bcryptjs + TOTP (migración pendiente) · 6 roles × 26 recursos en role-permissions.ts
UI: lucide-react · framer-motion · gsap · recharts · leaflet + leaflet.heat · @craftjs/core · @dnd-kit · @tiptap (rich text) · @ericblade/quagga2 (barcode scanner)
Estado cliente: 11 React Contexts (cart, compare, customer, favorites, promotions, reviews, settings, tenant, theme, toast, wishlist) · sin Redux/Zustand
Mobile: Capacitor (capacitor.config.ts) · Android Studio · Xcode
Observabilidad: Sentry NextJS 10.43 · OpenTelemetry + @vercel/otel · Vercel Analytics + Speed Insights · PostHog feature flags + analytics
Infra: Upstash Redis (rate limit + cache) · BullMQ (job queue, queue:workers) · Web Push VAPID · Resend + Nodemailer (email)
Testing: Vitest 4 (unit) · Playwright 1.59 + @playwright/mcp (E2E) · k6 (load) · Storybook 8.6 · Testing Library
CI/Quality: Husky 9 · lint-staged 16 · commitlint 20 (Conventional Commits obligatorio) · ESLint 9 · Prettier 3.8 · @next/bundle-analyzer · size-limit

━━━ 3. BASE DE DATOS — 137 MODELOS PRISMA ━━━

Aislamiento multi-tenant: 100% en capa de aplicación vía tenantId como primer parámetro en TODA query en lib/db/*.db.ts. No hay RLS de Postgres. Regla CLAUDE.md #1: nunca prisma directo, siempre pasar por la DB class.

Cache híbrido: lib/cache.ts getOrSet(key, ttlSec, fn) + invalidate(key) tras writes. Prefijo "platform-settings:" para settings globales.

Grupos de modelos (137 total):

• Tenants y usuarios: Tenant, AdminUser, TenantInvitation, TenantFeatureFlag, TenantSunatConfig, TenantWhatsAppConfig, TenantHealthScore, StorePermission, ApiKey, CronDeadLetter
• Productos y catálogo: Product, ProductImage, ProductVariant, PriceHistory, Bundle, BundleItem, Batch, SavedFilter, SearchSuggestion
• Clientes: Customer, LoyaltyTransaction, SavedCart, SavedLocation, ShoppingList, ShoppingListItem, PushSubscription, CustomerNotification, NewsletterSubscriber, VisitorWelcome
• Pedidos y ventas: Order, OrderItem, OrderStatusHistory, Sale, SaleItem, Return, ReturnItem, AbandonedCart (implícito)
• Inventario: InventoryMovement, Warehouse, Transfer, Location, ConteoFisico, ConteoFisicoItem
• Caja y finanzas: CashRegister, CashMovement, Payable, Payment, Expense, DailySummary, TreasuryCuenta, TreasuryMovimiento, TreasuryTransferencia
• Fiado (créditos a clientes): Fiado, FiadoCuota
• Préstamos: Prestamo, PrestamoCuota, PrestamoDocumento
• Scoring crédito: CreditProfile, CreditInstallment, CreditScoreHistory, CreditReminder
• Proveedores y compras: Supplier, PurchaseOrder, PurchaseItem, SupplierEvaluation, SupplierReturn, SupplierReturnItem, SupplierPortal, SupplierPriceVersion, SupplierRating, SupplierOffer
• Turnos: Turno
• Recetas (producción): Receta, RecetaIngrediente, ProduccionLote
• Documentos tributarios: Cotizacion, CotizacionItem, GuiaRemision, GuiaRemisionItem, NotaCredito, SunatInvoice
• Promociones: Promotion, Coupon, DiscountRule, SponsoredBoost, Campaign, BirthdayCoupon (implícito)
• Mermas: Mermas (en schema como Expense variant)
• Reviews: Review, ReviewVote
• CMS page builder: Page, PageBlock, BlockTemplate, Media, PageVersion, ThemeSettings, Navigation
• WhatsApp: WhatsAppConversation (+ TenantWhatsAppConfig)
• Notificaciones: NotificationLog, Notification, MessageTemplate, Reminder, Note
• Chat: ChatMessage, AdminMessage, ConversationThread, ConversationMessage, SupportTicket
• A/B testing: ABTest, ABTestEvent, SurveyResponse
• Analytics IA: ProductAnalytics, StockoutPrediction, SalesAnomaly, ForecastLog
• IA: AIConversation, AIMessage
• Marketplace B2B: Store, StoreBanner, StoreProduct, WholesaleOrder, WholesaleOrderItem, CommissionRule, CommissionLedger
• Delivery: DeliveryPartner, DeliveryAssignment, DeliveryTracking, DeliveryRoute, DeliveryRouteStop, DeliverySlot
• Anti-churn SaaS: ChurnSignal, ChurnPlaybook
• Compliance: ComplianceItem, ActivityLog (audit log hash chain SHA-256), CustomKpi
• Platform (globales sin tenantId): PlatformSetting (usado por /superadmin/integraciones), RoadmapItemStatus, StripeWebhookQueue, MpPendingPlan

Migraciones Prisma aplicadas (28): init, add_new_fields, add_cms_tables, add_order_discount_fields, add_idempotency_soft_delete, add_partial_and_composite_indexes, add_feature_flags, add_stripe_webhook_queue, add_product_description_review_productid, add_review_admin_reply, add_transfer_location_models, add_warehouse_product_links, add_createdby_inventory_movement, add_prestamos_guia_new_fields, remove_default_main, add_tenant_branding, add_mercadopago_fields, add_email_verification, add_mp_pending_plan, add_anti_churn, add_sunat_models, add_whatsapp_commerce, add_forecast_log, add_credit_engine, add_supplier_portal_models, add_fk_indexes_for_supabase_audit, add_ai_conversation_and_message, add_loyalty_transaction.

Migraciones SQL pendientes (propuestas sin aplicar): proposed-pgvector.sql (embeddings IA), proposed-admin-totp.sql (2FA admin), proposed-superadmin-totp.sql (2FA superadmin), proposed-db-indexes-wave-1.sql (optimización índices), PENDING_AI_MODELS_MIGRATION.md.

━━━ 4. PANEL ADMIN — 27 MÓDULOS ━━━

Ruta: /admin (por tenant) · Entry: app/admin/page.tsx (~1256 líneas, zona peligrosa) · Tabs definidos en app/admin/admin-types.ts · Navegación via AdminNavigation.tsx + AdminSidebar.tsx + AdminBottomNav.tsx (mobile) + TabRouter.tsx.

1) IA & Analítica (asistente-ia) 🟢
   Sub: dashboard IA, chat asistente, health IA
   DB: analytics.db.ts, product-analytics.db.ts, sales-anomalies.db.ts, forecasting.db.ts, stockout-predictions.db.ts, recommendations-personalized.db.ts, search-suggestions.db.ts
   API: /api/ai/*, /api/analytics/*, /api/recommendations/*, /api/recommender/*, /api/demand-prediction/*
   UI: AIAssistant.tsx, AIFloatingButton.tsx, AIHealthPanel.tsx, AIProductDescriptionGenerator.tsx, AIReviewResponder.tsx
   Providers: Groq · Anthropic Claude (@ai-sdk/anthropic v3) · OpenAI (@ai-sdk/openai v3) · Vercel AI SDK v6
   Lib: lib/ai/*, lib/ai-quality-evaluator.ts, lib/ai-safety.ts, lib/ai-temperatures.ts, lib/ai-usage-tracker.ts, lib/ai-conversation-memory.ts, lib/ai-failure-monitor.ts, lib/ai-json-parser.ts, lib/ai-ab-testing.ts

2) Ventas & Caja (ventas-caja) 🟢
   Sub: dashboard, vender (POS), turnos, caja, pedidos, fiados, cuadrar (cierre)
   DB: sales.db.ts, orders.db.ts (ZONA PELIGROSA — idempotency + state machine), turnos.db.ts, fiados.db.ts
   API: /api/sales/*, /api/orders/*, /api/pos/*, /api/turnos/*, /api/cash-registers/*, /api/cierre-diario/*
   UI: CheckoutModal.tsx (119 KB, 2018 líneas, ZONA PELIGROSA), CartSidebar.tsx (BroadcastChannel multi-tab), CashChangeCalculator.tsx, YapePaymentPanel.tsx, PlinPaymentPanel.tsx, CheckoutAccountStep/DeliverySchedule/NotesField/OrderReview/PaymentSection/SuccessStep
   Features: Yape (QR) · PLIN · efectivo con cambio · Stripe · MercadoPago · idempotency keys · state machine de pago · recomposición server-side de totales · cupones · geolocalización delivery · fiado automático

3) Inventario (inventario) 🟢
   Sub: stock, alertas, movimientos (kardex), conteo físico, valorizado
   DB: inventory.db.ts, batches.db.ts, mermas.db.ts
   API: /api/inventory/*, /api/inventory-movements/*, /api/stock-alerts/*, /api/reorder-alerts/*, /api/mermas/*, /api/batches/*, /api/auto-reorder/*, /api/transfers/*
   Features: alertas stock bajo · fechas de vencimiento por lote · transfers entre warehouses · conteo físico → ajuste auto · kardex valorizado (PEPS/UEPS) · auto-reorder

4) Productos & Precios (productos) 🟢
   Sub: dashboard, catálogo, precios, variantes, imágenes, tags
   DB: products.db.ts, product-variants.db.ts, product-images.db.ts, product-analytics.db.ts
   API: /api/products/*, /api/product-search/*, /api/price-history/*, /api/price-comparison/*, /api/discount-rules/*, /api/tags/*
   Features: variantes (talla/color/peso) · imágenes múltiples por producto (Sharp optimization) · histórico de precios · reglas de descuento · barcode lookup Quagga2

5) Compras (compras-mod) 🟢
   DB: purchases.db.ts, supplier-portal.db.ts, supplier-signup.db.ts
   API: /api/purchases/*, /api/suppliers/*, /api/supplier/*, /api/supplier-evaluations/*, /api/supplier-returns/*, /api/proveedores/*, /api/payables/*
   Features: órdenes de compra · recepción de mercadería · evaluación de proveedores · devoluciones a proveedor · portal proveedor · pagos a proveedores (payables)

6) Mi Plata / Finanzas (plata) 🟢
   DB: finance.db.ts, treasury.db.ts
   API: /api/treasury/*, /api/presupuesto/*, /api/invoices/*
   Features: flujo de caja · cuentas por pagar · cuentas por cobrar · presupuesto · facturas

7) Mis Clientes (clientes) 🟢
   DB: customers.db.ts, loyalty.db.ts
   API: /api/customers/*, /api/customer/*, /api/customer-preferences/*, /api/customer-notifications/*, /api/loyalty/*, /api/birthday-coupons/*
   Features: programa de puntos (LoyaltyTransaction) · cupones de cumpleaños · segmentación · preferencias · notificaciones personalizadas

8) Fiados (fiados) 🟢
   Modelos: Fiado + FiadoCuota
   Features: venta a crédito · cuotas programables · recordatorios · scoring básico · pagos parciales

9) Turnos (turnos) 🟢
   Modelo: Turno
   API: /api/turnos/*
   Features: apertura/cierre de turno · arqueo de caja · control por cajero · auditoría por turno

10) Recetas (recetas) 🟢
    Modelos: Receta, RecetaIngrediente, ProduccionLote
    API: /api/recetas/*, /api/recipes/*
    Features: recetas de producción (ej: combos preparados) · descuento automático de ingredientes al producir · trazabilidad de lotes

11) Préstamos (prestamos) 🟢
    Modelos: Prestamo, PrestamoCuota, PrestamoDocumento
    API: /api/prestamos/*
    Features: préstamos a clientes con cuotas · documentos adjuntos · seguimiento de pagos · estados (activo/vencido/pagado/incobrable)

12) Auditoría (auditoria) 🟢
    Lib: lib/audit/*, lib/audit-logger.ts
    Modelo: ActivityLog (con hash chain SHA-256 — compliance Ley 29733)
    API: /api/activity-log/*, /api/audit-trail/*, /api/security-logs/*
    Features: log inmutable · hash chain · búsqueda por usuario/recurso/acción · export para auditores

13) Devoluciones (devoluciones-proveedor) 🟢
    Modelos: SupplierReturn, SupplierReturnItem, Return, ReturnItem
    API: /api/returns/*, /api/supplier-returns/*

14) Tesorería (tesoreria) 🟢
    DB: treasury.db.ts
    Modelos: TreasuryCuenta, TreasuryMovimiento, TreasuryTransferencia
    Features: múltiples cuentas bancarias · transferencias entre cuentas · conciliación

15) Promociones (promociones) 🟢
    DB: promotions.db.ts, coupons.db.ts, sponsored-boosts.db.ts
    Lib: lib/coupons/*
    API: /api/promotions/*, /api/coupons/*
    Features: descuentos por % o monto fijo · cupones con código · fechas de vigencia · límite de usos · productos sponsored (boost visibility)

16) Scoring de Crédito (scoring) 🟢
    DB: credit.db.ts · Lib: lib/credit/*
    Modelos: CreditProfile, CreditInstallment, CreditScoreHistory, CreditReminder
    API: /api/credit/*
    Features: perfil crediticio por cliente · historial de score · recordatorios automáticos · playbooks de cobro

17) Documentos (documentos) 🟢
    DB: cotizaciones.db.ts, guias-remision.db.ts, notas-credito.db.ts
    API: /api/cotizaciones/*, /api/notas-credito/*
    Features: cotizaciones con PDF (jspdf + autotable) · guías de remisión · notas de crédito · export Excel (exceljs)

18) Marketplace B2B (marketplace-ops) 🟢
    DB: marketplace.db.ts
    API: /api/marketplace/*
    Modelos: Store, StoreBanner, StoreProduct, WholesaleOrder, WholesaleOrderItem, CommissionLedger, StorePermission
    Features: tiendas sub-tenants · banners por tienda · órdenes al por mayor · comisiones por venta · permisos granulares

19) Mi Tienda (mi-tienda) 🟢
    DB: store-banners.db.ts
    Features: personalización de storefront público · banners rotativos · tema

20) Configuración (config) 🟢
    DB: settings.db.ts
    API: /api/settings/*
    Features: datos de la bodega · horarios · métodos de pago habilitados · branding · idioma · timezone

21) SUNAT (facturación electrónica Perú) 🟢
    DB: sunat.db.ts · Modelos: TenantSunatConfig, SunatInvoice
    API: /api/sunat/config, /api/sunat/emit, /api/sunat/emit-on-sale, /api/sunat/invoices, /api/sunat/status, /api/sunat/void
    Provider: Nubefact (SUNAT_API_URL, SUNAT_API_TOKEN, SUNAT_RUC, SUNAT_RAZON_SOCIAL)
    Features: emisión automática post-venta (fire-and-forget) · anulación · consulta de estado · PDF/XML · reintentos con circuit breaker

22) WhatsApp Commerce 🟢
    Modelos: TenantWhatsAppConfig, WhatsAppConversation
    API: /api/whatsapp/concierge, /api/whatsapp/webhook, /api/webhooks/whatsapp/*
    Provider: WhatsApp Business Cloud API (Meta) + Groq (LLM concierge)
    Features: webhook de mensajes entrantes · concierge IA 24/7 · consultas de productos/pedidos · notificaciones de pedido · verify token

23) CMS Page Builder 🟢
    Lib: lib/cms/*, lib/cms-db/* · Modelos: Page, PageBlock, BlockTemplate, Media, PageVersion, ThemeSettings, Navigation
    API: /api/cms/* + rutas /cms/ + /admin/cms/
    Stack: TipTap rich editor · craftjs drag-drop · dnd-kit sortable
    Features: páginas versionadas · bloques reutilizables · templates · media library · navegación configurable

24) Delivery 🟢
    DB: delivery.db.ts
    Modelos: DeliveryPartner, DeliveryAssignment, DeliveryTracking, DeliveryRoute, DeliveryRouteStop, DeliverySlot
    API: /api/delivery-slots/*
    UI: /delivery, /delivery-app (apps para repartidores) · Leaflet + leaflet.heat (heatmaps)
    Features: ventanas horarias · asignación de repartidor · tracking en vivo · rutas optimizadas · stops secuenciales

25) Notificaciones 🟢
    DB: notifications.db.ts · Lib: lib/create-notification.ts
    API: /api/notifications/*, /api/notification-center/*, /api/customer-notifications/*
    Modelos: NotificationLog, CustomerNotification, PushSubscription, MessageTemplate, Notification
    Canales: Web Push VAPID (web-push) · email (Resend + Nodemailer fallback) · WhatsApp · in-app toast
    Features: plantillas de mensaje · programación · reintentos · opt-in/opt-out

26) SuperAdmin (panel platform) 🟢
    Ruta: /superadmin (auth separada con PLATFORM_SESSION cookie)
    Rutas UI (14): /dashboard, /control-center, /roadmap, /project-intel, /integraciones (NUEVO), /tenants, /stores (marketplace), /analytics, /health, /setup, /activity, /settings, /login, /marketplace
    API: /api/superadmin/* (activity, analytics, audit, auth, churn, commissions, costs, health, impersonate, marketplace, notifications, project-intel, purge, roadmap, settings, stores, tenants, integrations NUEVO)
    Lib: lib/superadmin-session.ts, lib/db/platform-settings.db.ts, lib/db/roadmap-status.db.ts
    Shell: SuperAdminShell.tsx (sidebar colapsable + command palette Ctrl+K + impersonation banner + theme toggle + session expired modal)

27) Integraciones y funciones (integraciones) 🟢 NUEVO 2026-04-10
    Ruta UI: /superadmin/integraciones
    API: /api/superadmin/integrations (GET/POST con Zod + rate limit + PlatformSession)
    Storage: PlatformSetting keys "integrations-overview" + "integrations-new"
    Features: bloque único editable con todo el panorama del sistema + bitácora de nuevas integraciones/mejoras (fecha, tipo, estado, detalles) · botones copiar/editar · stats (total/hecho/en progreso/falta)

━━━ 5. FRONTEND COMPONENTES (138 archivos en components/) ━━━

Zona peligrosa: CheckoutModal.tsx (119 KB) · CartSidebar.tsx (BroadcastChannel) · components/checkout/* (14 archivos + parts/ + steps/ + hooks/)
Admin: components/admin/* (AdminSidebar, AdminBottomNav, AdminMobileBottomBar, AdminModals, AdminModuleManagerModal, AdminImpersonationBanner, ABCAnalysisTab, ABTestsTab, AIAssistant, AIFloatingButton, AIHealthPanel, AIProductDescriptionGenerator, AIReviewResponder, AccountsReceivableTab, AchievementBadges, ActivityFeed, ActivityLogTab, ActivityTracker, AdminChatTab, AdminFloatingButtons, etc.)
SuperAdmin: SuperAdminShell, CommandPalette, SupportInbox, TenantLifecycleKanban, TenantMonitorPanel, _shared/, setup/, stores/, tenants/
Tienda pública: CategoryCatalog, CategoryBubbles, CombosSection, CompareBar, CartSidebar, CartUpsellSection, CartRecoveryToast, AbandonedCartRecovery, BackInStock, AdvancedSearchPanel, AlsoBoughtSection, AnnouncementBar, BreadcrumbSchema, BrandStory, CTABanner, CookieConsent, Confetti, Contact, CustomCursor, AccessibilityBar, AnimatedCounter, ApiDocsPage, Benefits
UI primitivos: components/ui/ (AnimatedCounter, ClientEffects, CustomCursor, FloatingParticles, HeroIllustration, LiveActivityTicker, MorphingBlob, ResponsiveTable, ScrollProgress, error-boundary)

━━━ 6. HOOKS GLOBALES (32 en hooks/) ━━━

use-ab-test, use-admin-shortcuts, use-admin-sse (Server-Sent Events), use-advanced-search, use-auto-refresh, use-cached-data, use-first-order, use-in-view (IntersectionObserver), use-keyboard-shortcuts, use-local-storage, use-local-storage-draft, use-magnetic, use-marketplace-cart, use-metering (plan quotas), use-notifications, use-onboarding, use-online-status, use-optimized-image, use-pagination, use-preferences, use-ripple, use-scroll-lock, use-shopping-list, use-store-products, use-swipe, use-table-export, use-tilt, use-toast, use-token-refresh, useModuleTiers, useProductAnalyticsTracking, useTableExport

━━━ 7. INTEGRACIONES EXTERNAS (19 activas) ━━━

1) Supabase Postgres — DATABASE_URL + DIRECT_URL + NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY (Prisma ORM + @supabase/supabase-js para queries read-only)
2) SUNAT/Nubefact — facturación electrónica Perú · SUNAT_API_URL, SUNAT_API_TOKEN, SUNAT_RUC, SUNAT_RAZON_SOCIAL, SUNAT_DIRECCION
3) RENIEC — validación de DNI · RENIEC_API_URL, RENIEC_API_TOKEN
4) WhatsApp Business Cloud API (Meta) — concierge IA + notificaciones · WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID
5) Stripe — suscripciones SaaS + Stripe Connect · STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_CLIENT_ID
6) MercadoPago — pagos locales Perú · MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_PUBLIC_KEY, MERCADOPAGO_WEBHOOK_SECRET
7) Resend — email transaccional primary
8) Nodemailer SMTP — email fallback · SMTP_USER, SMTP_PASS, NOTIFY_EMAIL
9) Groq — LLM rápido (concierge WhatsApp) · GROQ_API_KEY
10) Anthropic Claude — LLM calidad (@ai-sdk/anthropic)
11) OpenAI — LLM (@ai-sdk/openai)
12) Sentry — error monitoring · NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
13) PostHog — feature flags + analytics runtime · posthog-js + posthog-node
14) Vercel Analytics + Speed Insights + OpenTelemetry · @vercel/analytics, @vercel/speed-insights, @vercel/otel
15) Upstash Redis — rate limit + distributed cache · UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL
16) BullMQ — job queue (lib/queue/workers.ts)
17) Web Push VAPID — push notifications navegador · VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
18) Google Maps + Leaflet — mapas delivery · GOOGLE_MAPS_API_KEY
19) Capacitor — app móvil nativa iOS/Android · capacitor.config.ts · pe.buleje.app

━━━ 8. FLUJOS DE USUARIO ━━━

FLUJO CLIENTE (tienda pública):
1. Llega a la tienda vía subdominio (tenant-slug.buleje.pe) o /t/[slug] (proxy.ts resuelve tenantId)
2. Navega catálogo con SSR cacheado ("use cache" + cacheLife) → LCP <1s
3. Busca productos (advanced search + barcode scanner Quagga2)
4. Ve detalle: imágenes optimizadas (Sharp) · variantes · reviews · also bought · price history
5. Agrega al carrito → BroadcastChannel sincroniza entre tabs abiertas + localStorage draft
6. Abre CheckoutModal (StepBar: Account → Delivery → Payment → Review → Success)
7. Account step: login/registro o guest (con OTP email si quiere tracking)
8. Delivery step: geolocalización (use-geolocation) · elige DeliverySlot · calcula delivery fee
9. Payment step: Yape QR / PLIN / efectivo / Stripe / MercadoPago / fiado
10. Review step: backend recompone totales (nunca confía en client) · aplica cupón (validación server)
11. Submit: POST /api/orders con idempotencyKey → crea Order + OrderItems + descuenta stock
12. Fire-and-forget: emite SunatInvoice (.catch(()=>{}) + retry queue) + envía WhatsApp + email
13. Success step: confirma pedido · muestra tracking link · ofrece Plin puntos
14. Tracking en /pedido/[id]: estados (pending → confirmed → preparing → out_for_delivery → delivered) · mapa en vivo · ETA

FLUJO ADMIN (dueño de bodega):
1. Login /admin/login con 2FA opcional (TOTP, migración pendiente)
2. Dashboard con KPIs live: ventas hoy, stock crítico, pedidos pendientes, fiados vencidos, cumpleaños del día
3. Módulo vender (POS): busca producto por barcode o nombre · agrega al carrito · elige cliente · cobra · imprime ticket · emite SUNAT
4. Inventario: revisa alertas de stock bajo · hace conteo físico · ajusta · crea transfer entre warehouses
5. Compras: crea orden a proveedor · recibe mercadería · paga al proveedor
6. Clientes: ve top clientes (Pareto 80/20) · envía campaña · activa cupón de cumpleaños
7. Fiados: cobra deuda · registra pago parcial · envía recordatorio WhatsApp
8. Cierre de turno: arqueo de caja · diferencia · firma · crea DailySummary
9. Reportes: exporta Excel (exceljs) o PDF (jspdf) · envía por email

FLUJO SUPERADMIN (owner platform — Brandon):
1. Login /superadmin/login (auth separada PLATFORM_SESSION, 8h lifetime, rotation halfway)
2. Dashboard platform: MRR, ARR, tenants activos, payings, churn rate, growth %
3. Tenants: listado · impersonate (con banner warning) · kill switch · suspender · export datos (GDPR)
4. Integraciones: ve/edita panorama del sistema + agrega nuevas integraciones/mejoras con fecha y estado
5. Project Intel: 11 tabs con qué es, cómo funciona, agentes, skills, MCPs, avance, precios, packaging
6. Roadmap: 24 semanas planificadas (ROADMAP-24-WEEKS.md)
7. Health: SLOs, error budgets, Sentry errors, chaos engineering status
8. Settings: precios de planes (fuente única de verdad para MRR calculation)

━━━ 9. SEGURIDAD Y COMPLIANCE ━━━

Reglas críticas CLAUDE.md:
#1 Nunca Prisma directo · siempre lib/db/*.db.ts
#2 Zod safeParse() siempre · nunca parse()
#3 tenantId en TODA query multi-tenant (primer parámetro)
#4 NO segment configs estáticos en Next 16 · usar "use cache" + cacheLife
#5 invalidate(key) tras cada write
#6 Totales se calculan SIEMPRE en backend
#7 Fire-and-forget explícito (.catch(() => {}))
#8 tsc --noEmit es el type-check real
#9 requireAdmin(req, ["admin", "cajero"]) con roles explícitos
#10 Sin secrets hardcodeados · lib/env.ts valida en startup
#11 Raw SQL solo con parámetros posicionales
#12 Cambio de arquitectura → ADR nuevo en docs/adr/
#13 Regla de Oro — self-heal auto 3 intentos antes de escalar
#14 security-pentester pre-merge obligatorio
#15 Directiva de Rentabilidad — finops-guard audita cada cambio
#16 Nunca deploy sin SLO healthy + canary + DR drill <35 días

Compliance Ley 29733 (Perú, equivalente GDPR):
· Audit log inmutable con hash chain SHA-256 (ActivityLog)
· Endpoints GDPR: export de datos por DNI, derecho a borrado, derecho a rectificación, derecho a portabilidad, derecho a saber quién accedió
· Consentimiento explícito en checkout (CookieConsent)
· Data retention policies · purge programado

Seguridad aplicación:
· JWT cookie httpOnly + secure + sameSite=lax · rotación de token halfway del lifetime
· Rate limiting (Upstash): STRICT (10/15min), MODERATE (20/5min), GENEROUS (100/60s), AUTH (3/60min)
· CSP headers en proxy.ts · CORS configurado · CSRF tokens (lib/csrf.ts)
· bcryptjs para passwords (12 rounds)
· Input validation con Zod en TODOS los endpoints
· SQL injection prevention vía Prisma + raw SQL parametrizado
· Multi-tenant isolation vía tenantId obligatorio (app-level, no RLS)
· security-pentester agente corre en pre-merge hook (ADR-025)

━━━ 10. OBSERVABILIDAD Y SLOs ━━━

4 SLOs definidos (slo/ directory):
1. Checkout success rate > 99.5% (ventana 30d, budget 0.5%)
2. API P95 latency < 500ms (ventana 7d)
3. Dashboard load < 2s (LCP ventana 7d)
4. SUNAT emission success > 98% (ventana 30d)

Hooks operacionales:
· pre-deploy-enterprise-gate.mjs — bloquea deploy si tsc/lint/tests/console.log fallan
· pre-deploy-slo-gate.mjs — bloquea si algún SLO >90% burned
· post-deploy-sentinel.mjs — health check automático post-deploy
· pre-deploy-db-snapshot — snapshot DB antes de deploy (permite /db-restore)

Chaos engineering: ejecuta nocturno en staging · simula fallo de Redis/SUNAT/WhatsApp · verifica circuit breakers
DR drills: mensual automático · restaura último backup a DB temporal · corre 10 validaciones · alerta si >35 días sin drill exitoso
Canary deploys: 5% → 25% → 100% con auto-rollback si error rate sube
Feature flags runtime (PostHog + TenantFeatureFlag): encender/apagar features por tenant sin redeploy · kill switches

Runbooks (8 en runbooks/): checkout-caido, redis-down, sunat-no-funciona, whatsapp-webhook-fallando, stripe-webhook-loop, db-connection-exhausted, memory-leak-detectado, deploy-rollback-urgente

━━━ 11. TESTING Y CI/CD ━━━

Unit tests: Vitest 4 · coverage target 80% líneas/statements, 70% branches, 75% functions
E2E: Playwright 1.59 con @playwright/mcp · headless en CI, UI interactive local
Load test: k6 (k6/superadmin.js) · npm run test:load
Evals automáticos (evals/): checkout, fiado, sunat, multi-tenant · prerequisito del Sentry auto-fix loop
Storybook 8.6 para componentes · addon-a11y · addon-interactions

CI GitHub Actions (.github/workflows/):
· ci.yml — lint + tsc + test + build en cada PR
· claude-autonomous.yml — 4 jobs: auto-fix issues con label claude-auto, auto-resolve Dependabot PRs, nightly audit 3 AM, manual dispatch
Pre-commit (Husky 9): lint-staged (ESLint fix + Prettier) + commitlint (Conventional Commits obligatorio)

━━━ 12. MOBILE (Capacitor) ━━━

Config: capacitor.config.ts · bundle ID: pe.buleje.app
Build: npm run app:build (next build + npx cap sync)
Platforms: android/ · iOS pendiente
Features nativas: push notifications (VAPID + native) · deep links · camera (barcode scanner) · geolocation · file system access · biometric auth pendiente

━━━ 13. PERFORMANCE OPTIMIZATIONS ━━━

· cacheComponents: true (Next 16 PPR + "use cache" + cacheLife + cacheTag + updateTag)
· Dynamic imports para componentes pesados (RevenueCharts, TenantMonitorPanel, CheckoutModal)
· react-window para listas virtuales largas
· Sharp para optimización de imágenes (WebP + blur placeholder)
· next/image con sizes responsive · priority en LCP
· next/font con subset es-PE + preload
· Bundle analyzer (@next/bundle-analyzer) + size-limit gates
· Prefetch de rutas críticas
· Service Worker para PWA offline (app/offline/)
· Upstash Redis para sub-ms reads en warm serverless
· Connection pooling Supabase · PrismaPg adapter
· Fluid Compute 300s timeout + function reuse across concurrent requests

━━━ 14. AGENTES, SKILLS Y AUTOMATIZACIÓN ECC ━━━

24 agentes especializados en bodega-san-martin/.claude/agents/:
solution-architect, backend-platform-engineer, database-engineer, frontend-engineer, product-uiux-strategist, checkout-specialist, migration-planner, integration-specialist, mobile-engineer, qa-reliability-engineer, security-auditor, security-pentester (Phase 2), visual-qa-specialist (Phase 2), performance-engineer, seo-growth-strategist, data-analyst, devops-release-engineer, code-reviewer, director-orchestrator, finops-guard (Phase 3), sre-observability (Phase 3), growth-specialist (Phase 3), bug-hunter, test-writer

+ 3 squads: full-stack-squad, security-squad, performance-squad

36 skills en bodega-san-martin/.claude/skills/ + plugin ecc global (181 skills, 46 agentes, 79 commands, v1.10.0)

9 hooks operacionales + 42 ADRs (docs/adr/)

━━━ 15. ESTADO ACTUAL ━━━

Total: 24 agentes · 36 skills · 9 hooks · 42 ADRs · 8 runbooks · 6 workflows · 16 reglas CLAUDE.md · 137 modelos Prisma · 28 migraciones aplicadas · 546 route handlers · 138 componentes · 32 hooks globales · 11 contextos React · 27 módulos admin · 14 rutas superadmin · 19 integraciones externas.

Level 5 REAL alcanzado (STATUS_LEVEL5_REAL.md) — Sprint 2 activo: Programmatic SEO · AI Insights NLP · pgvector (#4) · WhatsApp AI (#6) · metering (#8).`;

const NewItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  date: z.string().min(1).max(32),
  type: z.enum(["integracion", "mejora", "feature", "fix"]),
  status: z.enum(["hecho", "falta", "en-progreso"]),
  details: z.string().max(4000),
});

const OverviewBodySchema = z.object({
  overview: z.string().min(1).max(100_000),
});

const NewListBodySchema = z.object({
  items: z.array(NewItemSchema).max(500),
});

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

function isTableMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("does not exist") || msg.includes("relation") && msg.includes("does not exist");
}

function errorResponse(err: unknown, fallback: string) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[api/superadmin/integrations]", fallback, err);
  return NextResponse.json(
    { error: fallback, message: msg },
    { status: 500 },
  );
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "GENEROUS", "sa-integrations-get");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: [OVERVIEW_KEY, NEW_KEY] } },
      select: { key: true, value: true },
    });

    const overviewRow = rows.find((r) => r.key === OVERVIEW_KEY);
    const itemsRow = rows.find((r) => r.key === NEW_KEY);

    const overview =
      typeof overviewRow?.value === "string" && overviewRow.value.length > 0
        ? overviewRow.value
        : DEFAULT_OVERVIEW;

    const items = Array.isArray(itemsRow?.value) ? itemsRow.value : [];

    return NextResponse.json({ overview, items });
  } catch (err) {
    // If the table doesn't exist yet, return defaults instead of 500
    if (isTableMissing(err)) {
      console.warn("[api/superadmin/integrations] PlatformSetting table missing — returning defaults. Run: npx prisma db push");
      return NextResponse.json({ overview: DEFAULT_OVERVIEW, items: [], _warning: "PlatformSetting table missing — run migration" });
    }
    return errorResponse(err, "integrations-get-failed");
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "MODERATE", "sa-integrations-post");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const raw = await req.json().catch((err) => { logger.error("[superadmin/integrations] parse JSON body failed", { error: String(err) }); return null; });
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");

    if (kind === "overview") {
      const parsed = OverviewBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "invalid-body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      await prisma.platformSetting.upsert({
        where: { key: OVERVIEW_KEY },
        create: {
          key: OVERVIEW_KEY,
          value: parsed.data.overview as Prisma.InputJsonValue,
          updatedBy: session.username,
        },
        update: {
          value: parsed.data.overview as Prisma.InputJsonValue,
          updatedBy: session.username,
        },
      });
      invalidate(`${CACHE_PREFIX}${OVERVIEW_KEY}`);
      invalidate(`${CACHE_PREFIX}__all__`);
      return NextResponse.json({ ok: true });
    }

    if (kind === "items") {
      const parsed = NewListBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "invalid-body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      await prisma.platformSetting.upsert({
        where: { key: NEW_KEY },
        create: {
          key: NEW_KEY,
          value: parsed.data.items as unknown as Prisma.InputJsonValue,
          updatedBy: session.username,
        },
        update: {
          value: parsed.data.items as unknown as Prisma.InputJsonValue,
          updatedBy: session.username,
        },
      });
      invalidate(`${CACHE_PREFIX}${NEW_KEY}`);
      invalidate(`${CACHE_PREFIX}__all__`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown-kind" }, { status: 400 });
  } catch (err) {
    if (isTableMissing(err)) {
      return NextResponse.json(
        { error: "table-missing", message: "La tabla PlatformSetting no existe. Ejecuta: npx prisma db push" },
        { status: 503 },
      );
    }
    return errorResponse(err, "integrations-post-failed");
  }
}
