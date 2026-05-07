# MEMORIA-PROYECTO.md — Buleje

> **Última verificación:** 2026-05-04 · Fuente: `package.json`, `CLAUDE.md`, `docs/HISTORY.md`
> **Versión:** v15 — slim (2026-04-26). Snapshot histórico (133 tabs, 14 fases ERP, batches) movido a `docs/HISTORY.md`.
> **Propósito:** contexto vivo NO derivable del código (decisiones, patrones, operaciones críticas, gaps).

---

## 1. Visión

Buleje = **e-commerce + POS + ERP + Marketplace SaaS multi-tenant** para una bodega/minimarket real en **Pucallpa, Perú**.

| Dimensión | Valor |
|---|---|
| Negocio físico | Bodega familiar de barrio en Pucallpa |
| Producto digital | Plataforma SaaS white-label vendible a otras bodegas/tiendas PE |
| Tipos de usuario | vecino · admin (dueño/cajero/almacenero) · repartidor · proveedor · superadmin · vendor |
| Cobertura admin | **133 tabs** organizados en 14 fases ERP completadas (lista en `docs/HISTORY.md`) |
| Idioma UI | Español (Perú). Moneda PEN, formato `S/ X,XXX.XX` |

> Stack, módulos, convenciones de código y zona de peligro: ver **`CLAUDE.md`**.
> Arquitectura de agentes Hub & Spoke v2: ver **`AGENTS.md`**.

---

## 2. Patrones de código obligatorios

### Tab Admin Component
```tsx
"use client";
import { useState, useMemo } from "react";
import { IconName } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// Types, helpers, seed data FUERA del componente (evita re-render)

export default function NombreTab() {
  return (
    <div className="space-y-6">
      {/* Header + botones · KPIs grid · Alertas · Filtros · Tabla/cards · Modal detalle */}
    </div>
  );
}
```

### Registrar tab en `app/admin/page.tsx`
```tsx
const NuevoTab = dynamic(() => import("@/components/admin/NuevoTab"), { loading: TabSpinner });
type Tab = "..." | "nuevo-id";
{ id: "nuevo-id" as Tab, label: "Nuevo Módulo", icon: IconName },
{tab === "nuevo-id" && <NuevoTab />}
```

### Tailwind tokens (dark mode coherente)
| Uso | Clase |
|---|---|
| Bordes | `border-gray-200 dark:border-card-border` |
| Fondo card | `bg-white dark:bg-card` |
| Fondo superficie | `bg-gray-50 dark:bg-surface` |
| Texto principal | `text-gray-900 dark:text-foreground` |
| Texto secundario | `text-gray-500 dark:text-muted` |
| Hover | `hover:bg-gray-50 dark:hover:bg-accent` |
| Radii | `rounded-2xl` (cards) · `rounded-xl` (botones, inputs) |
| Pesos | `font-extrabold` (títulos) · `font-bold` (subs) · `font-semibold` (labels) |

### Helpers de formato (siempre estos, nunca inline)
```tsx
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
```

---

## 3. Migraciones Prisma con Supabase — operativo crítico

### Por qué `prisma migrate dev` NO funciona
Supabase + pgBouncer bloquea la shadow DB que `migrate dev` necesita. Error típico:
```
Error: P3006 — Migration failed to apply cleanly to the shadow database.
```

### Procedimiento estándar (4 pasos, idempotente)

**1. Crear SQL manual** con guards `IF NOT EXISTS` / `DO $$ BEGIN ... END $$`:
```
prisma/migrations/YYYYMMDDHHMMSS_nombre/migration.sql
```

**2. Aplicar el SQL directo:**
```bash
npx prisma db execute --file "prisma/migrations/NOMBRE/migration.sql"
```

**3. Registrar en historial:**
```bash
npx prisma migrate resolve --applied "NOMBRE_DE_LA_MIGRACION"
```

**4. Regenerar cliente:**
```bash
npx prisma generate
```

**Verificar:** `npx prisma migrate status` debe decir *"Database schema is up to date!"*

### Baseline cuando `_prisma_migrations` está desincronizado
```bash
npx prisma migrate resolve --applied "20260307161913_init"
npx prisma migrate resolve --applied "20260309160725_add_new_fields"
# repetir por cada migración existente en BD pero no en el historial
```

Después usar `prisma migrate deploy` para aplicar las genuinamente nuevas. `deploy` no usa shadow DB y es seguro para Supabase.

### Helpers ya en el repo
- `scripts/resolve-drift-migrations.mjs` — automatiza el baseline
- `scripts/db-sanity.ts` — detecta schema drift (`npm run db:sanity`)
- `DATABASE_URL` (pgBouncer) NO sirve para migrations — usar `DIRECT_URL`

---

## 4. Notas técnicas (gotchas reales)

| # | Regla | Por qué |
|---|---|---|
| 1 | `next/dynamic` 2do arg debe ser **object literal inline** | Next 16 no acepta variable |
| 2 | NO declarar componentes dentro del render | Causa re-render por reference change |
| 3 | `TabSpinner` único compartido | Todos los `dynamic()` lo usan, no clones |
| 4 | `exportToCSV` y `cn()` siempre desde `@/lib/utils` | No re-implementar |
| 5 | Iconos solo `lucide-react` | Verificar import antes de agregar |
| 6 | Seed data realista PE | Nombres, ubicaciones (Pucallpa), montos en Soles |

---

## 5. Seguridad implementada

- ✅ RBAC `lib/auth/role-permissions.ts` — 26 recursos × 6 roles (admin, cajero, almacenero, vendor, repartidor, superadmin)
- ✅ `requireAdmin(req, roles[])` middleware en rutas API sensibles
- ✅ `CRON_SECRET` validado en rutas `/api/cron/*`
- ✅ Rate limiting (Upstash) en endpoints críticos
- ✅ bcryptjs para passwords + JWT (`jose`) para sesiones
- ✅ CSRF tokens en mutaciones cliente
- ✅ Multi-tenant guard app-level (`tenantId` 1er param + middleware)
- ✅ IP allowlist superadmin (`SUPERADMIN_IP_ALLOWLIST`)
- ✅ TOTP 2FA opcional para superadmin (`SuperadminUser.totpSecret`)
- ✅ `.env*` excluidos de allowlist en `.claude/settings.json`

---

## 6. Integraciones activas

| Categoría | Servicio |
|---|---|
| Pagos | **Yape QR** (PE local), efectivo, tarjeta, Stripe (suscripciones SaaS), Mercado Pago |
| Mensajería | WhatsApp via Twilio · Web Push (VAPID) · Resend · Nodemailer |
| Mapas | Leaflet (delivery zones, heatmap) |
| Analytics | Sentry · Vercel Analytics · Speed Insights · GA4 · GTM · MS Clarity · PostHog · OpenTelemetry |
| Mobile | Capacitor (Android/iOS) |
| Tributación | SUNAT (facturación electrónica, IGV) |
| AI | `@ai-sdk/anthropic` + `@ai-sdk/openai` via `lib/claude-router.ts` |
| Cache/RL | Upstash Redis + ratelimit |
| Queues | BullMQ (workers en `lib/queue/workers.ts`) |

---

## 7. Gaps conocidos (TD vivo)

- [ ] `SearchAction` URL declarada en schema.org pero página `/buscar` parcial
- [ ] `CombosSection.tsx` aún usa `COMBO_TEMPLATES` hardcodeado, no lee `settings`
- [ ] Warnings Tailwind v4 residuales (`bg-gradient-to-r` → `bg-linear-to-r`) en algunos componentes
- [ ] **TD-003** — Métricas A/B testing en memoria (`lib/ab-testing.ts`), se pierden al reiniciar. Mover a Redis+Postgres.
- [ ] **TD-035** — ~30 componentes con `setState` síncrono en `useEffect` (warning React 19 `react-hooks/set-state-in-effect`). No rompe, pero degrada perf.

> Backlog completo en `docs/TECH-DEBT.md`.

---

## 8. Decisiones arquitectónicas vivas

| Tema | Decisión | ADR |
|---|---|---|
| State management | **React Context** (no Zustand) | ADR-056 |
| Cache Next 16 | `"use cache"` + `cacheLife()` + `cacheTag()`, sin segment configs | ADR-019 |
| Multi-tenant | App-level guard (no Postgres RLS) | — |
| WhatsApp | Webhook AI-first | ADR-058 |
| Marketplace | Single tenant `vendor` con StoreProduct cross-store | ADR-059 |
| Design system | Single source of truth en `packages/design-system` | ADR-075 |
| Agent orchestration | Hub & Spoke v2 (BUILD/QUALITY/OPS) | ADR-057 |
| Deploy | Canary 5%→25%→100% + DR drill <35d | — |

---

## 9. Documentación complementaria

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Stack, módulos, convenciones, reglas críticas, comandos |
| `AGENTS.md` | Hub & Spoke v2 — 14 agentes y protocolos handoff |
| `docs/adr/` | Architecture Decision Records vivas |
| `docs/HISTORY.md` | Snapshot histórico de tabs, fases, batches (movido desde MEMORIA v14) |
| `docs/TECH-DEBT.md` | Backlog técnico activo |
| `README.md` | Quick start, deploy, API endpoints |
| `SESSION_HANDOFF.md` | Estado última sesión |

---

## 2026-05-05 — Sesión 15: 35 fixes seguridad

Sesión enfocada en cerrar hallazgos de auditoría de seguridad antes del
canary 25%. 35 fixes aplicados en 6 áreas + 3 ADRs + 2 docs nuevos.

### POS / Sales / Caja
- `app/api/sales/[id]/route.ts` — IDOR cross-tenant: `findFirst` con
  `tenantId` en GET, PATCH, DELETE.
- `app/api/sales/refund/[id]/route.ts` — mismo guard antes de revertir
  inventario.
- `app/api/cash-register/close/[id]/route.ts` — bloquea cierre de
  turno ajeno; chequea `cashier.tenantId === auth.tenantId`.
- `lib/db/sales.db.ts` — métodos `byId`, `update`, `delete` pasan a
  recibir `tenantId` como 1er argumento (breaking refactor de 12
  callsites).

### SUNAT / Facturación electrónica
- `app/api/sunat/comprobante/[id]/route.ts` — IDOR fix: la consulta de
  estado de comprobante validaba sólo por `id`.
- `app/api/sunat/anular/[id]/route.ts` — guard antes de generar nota
  de crédito.
- `app/api/invoices/boleta/[id]/route.ts` — guard antes de exponer el
  PDF firmado.
- `lib/sunat/sender.ts` — `tenantId` validado antes de cualquier
  envío a Nubefact (evita usar credenciales de otro tenant).

### Delivery
- `app/api/delivery/me/assignments/[id]/route.ts` — guard de
  `assignment.partner.tenantId === auth.tenantId`.
- `app/api/delivery/me/assignments/[id]/proof/route.ts` — guard +
  ADR-094: foto de prueba ahora vive en bucket privado con UUID v4 y
  signed URL de 60min en GET.
- `app/api/delivery/assignments/[id]/deliver/route.ts` — guard antes
  de marcar como entregada.
- `app/api/delivery/tip/[orderId]/route.ts` — token firmado validado
  contra `Order.id + tenantId`; antes aceptaba cualquier `orderId`.

### Webhooks (idempotencia atómica + anti-replay)
- `app/api/billing/mp-webhook/route.ts` — refactor a patrón
  `create + catch P2002` (ADR-092). Antes `findUnique + upsert` con
  race window. Aplicado tanto al handler de `payment` como al de
  `subscription_preapproval` y `subscription_authorized_payment`.
- Validación timestamp de `x-signature` (anti-replay >5min).
- Fail-closed: 503 si falta `MERCADOPAGO_WEBHOOK_SECRET`.
- `app/api/billing/webhook/route.ts` (Stripe) — mismo patrón aplicado
  con `event.id` como key.
- `app/api/whatsapp/yape-capture/route.ts` — idempotencia por
  `MessageSid`; storage migrado a UUID + signed URL.

### Billing / SaaS
- `app/api/billing/checkout/route.ts` — validación de plan target ≥
  plan actual (no permitir downgrade vía checkout); antes se aceptaba
  cualquier `planId` con monto manipulado en el cliente.
- Totales calculados 100% en backend desde `MP_PLAN_ITEMS` /
  `STRIPE_PRICE_IDS`. Cliente sólo ve preview (Regla 6).
- `lib/billing/trial-suspension.ts` — handler de gracia +24h con
  `tenantId` propagado.

### Marketplace
- `app/api/marketplace/payment-proof/route.ts` — guard cross-tenant
  + storage privado (ADR-094).
- `app/api/marketplace/reviews/route.ts` — POST requiere
  `customerToken` firmado o reCAPTCHA score >0.5.
- `lib/db/marketplace.db.ts` — `commissionFor` ahora requiere
  `tenantId` para evitar leer config de otro vendor.

### Documentación nueva
- `docs/adr/092-webhook-idempotency-unique-p2002.md` — patrón canónico
  de idempotencia (UNIQUE + P2002).
- `docs/adr/093-cross-tenant-guard-pattern.md` — patrón canónico
  Source 0 + `findFirst({ id, tenantId })`; lista de tablas exentas.
- `docs/adr/094-signed-urls-pii.md` — UUID v4 + bucket privado +
  signed URL para todo PII (delivery, payment proofs, vendor docs,
  SUNAT futuro).
- `docs/security/public-endpoints.md` — inventario canónico de
  endpoints sin auth con justificación, mitigación y riesgo residual
  por cada uno.

### Pendientes detectados
- `app/api/api-keys/route.ts` — sigue sin `requireAdmin`. P0 para
  próxima sesión.
- `app/api/supplier/*` — guard de sesión `requireSupplier`
  inconsistente. PR de unificación pendiente.
- `app/api/birthday-coupons`, `customer-preferences`, `shopping-lists`,
  `stock-alerts`, `reorder-alerts`, `daily-digest`,
  `email-automation` — auditar IDOR sobre `customerId`.
- Migración de PII existente: ~3000 fotos de delivery proof a re-subir
  a bucket privado con UUID. Script en backlog.

### Verificación
- `npx tsc --noEmit` pasa.
- `npm run lint` pasa.
- `scripts/visual-verify-admin-focused.mjs` 9/9 verde.
- Tests E2E de checkout MP/Stripe verde con webhooks simulados de
  carrera (2 requests simultáneos al mismo `paymentId`).
