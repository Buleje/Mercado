# Architecture — Bodega San Martín

> **Ancla arquitectónica del proyecto.** Este documento es la referencia única para entender cómo fluye la información de punta a punta. Si algo contradice lo que está acá, la fuente de verdad es el código + los ADRs en `docs/adr/`.
>
> **Léelo primero, después `CLAUDE.md`, después los ADRs relevantes.**

**Última revisión:** 2026-04-08
**Stack resumen:** Next.js 16 App Router · React 19 · TypeScript 5 estricto · Prisma 7 + Supabase PostgreSQL · Zod 4 · BullMQ 5 · Tailwind CSS 4 · Capacitor 8

---

## 1. Vista de 10 000 pies

Bodega San Martín es un **ERP/e-commerce multi-tenant** para bodegas familiares en Pucallpa. Una sola instancia de la app sirve a N tenants mediante aislamiento por `tenantId` en cada query. Los usuarios finales son:

| Actor | Rol típico | Dónde interactúa |
|---|---|---|
| Dueño de bodega | `admin` | `/admin` (dashboard con ~30 tabs dinámicos) |
| Cajero | `cajero` | `/admin` tabs limitados (POS, ventas, fiados) |
| Almacenero | `almacenero` | `/admin` tab inventario + recepción |
| Cliente final | público / `customer` | Marketplace (`/`, `/tienda/[slug]`) |
| Repartidor | `delivery` | Mobile app Capacitor + endpoints delivery |
| Superadmin del SaaS | `superadmin` | `/superadmin` (multi-tenant health) |

---

## 2. Capas lógicas (top-down)

```
┌─────────────────────────────────────────────────────────────┐
│  UI — app/ + components/                                    │  ← Next.js App Router
│  ├── (store)/   marketplace público + storefront            │
│  ├── admin/     panel ERP con code-splitting por tab        │
│  └── superadmin/ panel del dueño del SaaS                   │
└───────────────┬─────────────────────────────────────────────┘
                │ fetch() con lib/tenant-fetch.ts (x-tenant-id)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  API — app/api/**/*.ts (~509 route handlers)                │
│  export const dynamic = "force-dynamic"                     │
│  1. requireAdmin(req, roles) → SessionPayload | NextResponse│
│  2. Zod.safeParse(body) → 400 si falla                      │
│  3. delegar a DB class                                      │
│  4. logActivity(...).catch(()=>{}) fire-and-forget          │
└───────────────┬─────────────────────────────────────────────┘
                │ siempre pasa tenantId como 1er parámetro
                ▼
┌─────────────────────────────────────────────────────────────┐
│  DB Classes — lib/db/*.db.ts (38 clases)                    │
│  Repositorio con cache híbrido (Memory + Redis)             │
│  Audit trail automático · invalidación por prefix           │
└───────────────┬─────────────────────────────────────────────┘
                │ Prisma tipado o prisma.$executeRawUnsafe
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Prisma 7 — prisma/schema.prisma (120 modelos)              │
│  Adapter @prisma/adapter-pg para pgbouncer-safe             │
└───────────────┬─────────────────────────────────────────────┘
                │ connection pooler (DATABASE_URL)
                │ direct URL (DIRECT_URL) para migraciones
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                        │
│  Row-Level Security por tenantId (ADR 001)                  │
└─────────────────────────────────────────────────────────────┘
```

**Regla irrompible:** cada capa habla solo con la capa siguiente. UI nunca toca Prisma directo. Route handler nunca instancia `new PrismaClient()`.

---

## 3. Resolución de tenant (dual, NO obvia)

El tenant es el núcleo de la seguridad multi-tenant. Se resuelve en dos lugares distintos:

### 3.1 Server-side (`middleware.ts` → `proxy.ts`, ~398 líneas)

Orden de precedencia:

1. **Hostname** (`slug.localhost:3000` / `slug.bodegasaas.com`) — producción
2. **Path** (`/t/{slug}/`) → rewrite a la ruta real + inyecta header + cookie
3. **Referer header** (`/t/{slug}/admin`) — seguro per-tab
4. **Cookie `active-tenant`** — compartida entre tabs, puede estar stale
5. **JWT de sesión** (`bsm-admin-sess`) — decode base64 del payload
6. Default: `"main"`

**Seguridad:** el middleware **ignora** `x-tenant-id` enviado por el cliente y audita discrepancias como posible inyección.

### 3.2 Client-side (`lib/tenant-fetch.ts`)

1. `sessionStorage("active-tenant-slug")` — override por tab
2. Path URL `/t/{slug}/`
3. Subdominio (`demo.buleje.com` → `"demo"`)
4. `localStorage("active-tenant-slug")` — fallback cross-tab
5. Default: `"main"`

Ver **ADR 004 — Dual Tenant Resolution** para el razonamiento.

---

## 4. Módulos por dominio (mapa mental)

```
ERP core
├── Productos / Inventario    → lib/db/products.db.ts + batches.db.ts + recipes.db.ts
├── Ventas / POS / Caja       → lib/db/sales.db.ts + turnos.db.ts + registers.db.ts
├── Fiados / Cuentas por cobrar → lib/db/fiados.db.ts + prestamos.db.ts
├── Facturación electrónica   → lib/db/invoices.db.ts (integración SUNAT futura)
└── RRHH / Empleados          → lib/db/employees.db.ts

Marketplace / E-commerce
├── Storefront público        → app/(store)/** + components/marketplace/**
├── Catálogo / Búsqueda       → lib/db/products.db.ts + advanced-search
├── Carrito + Checkout        → contexts/cart-context.tsx + components/checkout/** + components/marketplace/MarketplaceCheckoutModal.tsx
├── Cupones / Promociones     → lib/db/coupons.db.ts + pricing.agent.ts
├── Reviews / Reputación      → lib/db/reviews.db.ts (Bloque D3)
├── Chat buyer↔seller         → lib/db/chat.db.ts + components/admin/ChatTab (Bloque D2)
└── Delivery vivo             → lib/db/delivery.db.ts + components/admin/DeliveryTab (Bloque D1)

Cross-cutting
├── Auth + RBAC               → lib/auth/role-permissions.ts + require-admin.ts
├── Feature flags             → lib/feature-flags.ts (ADR 005)
├── Domain events             → lib/domain-events/ (ADR 007)
├── BullMQ queues             → lib/queue/ (ADR 003)
├── LLM router                → lib/llm-router/ (ADR 010)
├── Cache híbrido             → lib/cache.ts
└── Observabilidad            → lib/logger.ts + lib/sentry-alerts.ts + instrumentation.ts
```

---

## 5. Flujos críticos end-to-end

### 5.1 Venta POS
```
CashierTab → addToCart → computeTotals → CheckoutModal →
POST /api/sales → requireAdmin → SalesDB.create →
  ├─ transacción: Order + OrderItem + StockMovement
  ├─ invalidateByPrefix("products:")
  ├─ enqueueActivityLog(fire-and-forget)
  ├─ enqueueEmail(recibo) (si tiene email)
  └─ enqueueNotification(whatsapp) (si tiene phone)
```

### 5.2 Compra marketplace (flujo buyer)
```
MarketplaceCart → MarketplaceCheckoutModal (steps: datos → pago → confirm) →
POST /api/marketplace/orders → validar cupón → crear Order → Stripe/MercadoPago →
  └─ webhook → actualizar estado → disparar delivery worker → WhatsApp al buyer
```

### 5.3 Delivery vivo (Bloque D1)
```
Admin crea ruta → POST /api/admin/delivery/routes →
Delivery app envía evento tracking → POST /api/admin/delivery/tracking →
  ├─ DeliveryTrackingDB.add auto-cascade actualiza Order.deliveryStatus
  ├─ BullMQ delivery-notifications worker → WhatsApp al buyer
  └─ GET público /api/track/[orderId] (sin auth, link WhatsApp)
```

### 5.4 Chat buyer↔seller (Bloque D2)
```
Buyer escribe → POST /api/chat/public → ChatMessagesDB.send (tx incrementa unread seller) →
BullMQ chat-notifications worker → WhatsApp al admin/cajero →
Seller responde → POST /api/admin/chat/threads/[id]/messages → WhatsApp al buyer
```

---

## 6. Decisiones clave (enlaces rápidos a ADRs)

| ADR | Tema | Por qué importa |
|---|---|---|
| 001 | Multi-tenancy row-level | Contrato de aislamiento |
| 002 | Stateless JWT sessions | No Redis requerido para auth |
| 003 | Fire-and-forget → BullMQ | Tareas asíncronas confiables |
| 004 | Dual tenant resolution | Ver §3 de este doc |
| 005 | Feature flags | Rollout gradual sin deploys |
| 006 | Strategy pattern descuentos | Regla de negocio modular |
| 007 | Domain events + BullMQ | VentaCompletada, StockBajo |
| 008 | TypeScript strict gate | `ignoreBuildErrors: false` |
| 009 | Structured output strategy | LLM → JSON confiable |
| 010 | LLM router | Cambio de proveedor sin refactor |
| 011 | Delivery raw SQL pattern | Migraciones bypass pgbouncer |
| 012 | Chat polling vs realtime | Trade-offs Fase 2 vs Fase 3 |
| 013 | Chat public endpoint security | Privacy by design del buyer |

---

## 7. Zonas de peligro (hook `danger-zone.mjs` las bloquea en Edit/Write)

| Archivo | Riesgo |
|---|---|
| `components/checkout/CheckoutModal.tsx` | Pagos, cupones, reservas |
| `components/CartSidebar.tsx` | BroadcastChannel multi-tab |
| `app/admin/page.tsx` | 1256 líneas, 30 tabs |
| `lib/auth/role-permissions.ts` | RBAC 26×6 |
| `lib/db/orders.db.ts` | Idempotency, state machine |
| `prisma/schema.prisma` | 120 modelos, requiere DIRECT_URL |
| `contexts/cart-context.tsx` | BroadcastChannel + localStorage |
| `proxy.ts` | Auth + CSP + tenant + rate limit |

---

## 8. Qué lees después de este doc

1. `CLAUDE.md` (raíz del repo "Prueba 2") — comandos, convenciones, glosario visual
2. `docs/ONBOARDING.md` — qué hacer en tu primer día / primera sesión
3. `docs/adr/README.md` — índice de decisiones arquitectónicas
4. `docs/instructions-index.md` — mapa de los 34 skills en `.github/instructions/`
5. `docs/TECH-DEBT.md` — deuda viva que podés agarrar
6. `AGENTS.md` (raíz) — qué agente invocar para qué tarea
