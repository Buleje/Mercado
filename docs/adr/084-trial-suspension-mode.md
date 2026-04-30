# ADR-084 — Trial Suspension Mode (15 días, read-only post-trial)

**Status:** Proposed
**Date:** 2026-04-30
**Owner:** Brandon

## Contexto

Cada negocio que se da de alta en Buleje obtiene un **trial de 15 días** sin requerir tarjeta. Pasado el plazo, si no activó un plan pagado:

- No debe poder **realizar ventas** (ni POS ni checkout público).
- Su **tienda individual** y su **listing en el marketplace** deben quedar ocultos.
- No debe poder **crear clientes, gastos, productos**.
- Sí debe poder **entrar al panel** y **ver gráficos / dashboards** (modo lectura) — para que tome la decisión de pagar.
- Activar cualquier plan pagado **revierte la suspensión** automáticamente vía webhook Stripe.

Hoy existe `Tenant.trialEndsAt` y un cron `app/api/cron/trial-expiry` que apaga al tenant con `active: false`. Eso es **demasiado restrictivo** — desactiva el panel entero. Necesitamos un estado intermedio.

## Decisión

Introducir el campo `Tenant.suspendedAt: DateTime?` y `Tenant.suspendedReason: String?`, con semántica:

| `active` | `suspendedAt` | Estado |
|---|---|---|
| `true` | `null` | Operativo |
| `true` | `set` | **Read-only** (puede ver, no escribir, oculto del público) |
| `false` | — | Eliminado / ban manual |

### Schema (migración)

```prisma
model Tenant {
  // ...existente
  trialEndsAt        DateTime?
  suspendedAt        DateTime?
  suspendedReason    String?    // "trial_expired" | "payment_failed" | "manual"

  @@index([suspendedAt])
}
```

### Cron `trial-expiry`

```ts
// Antes:  data: { active: false }
// Ahora:
data: {
  suspendedAt: now,
  suspendedReason: "trial_expired",
}
```

### Helper de enforcement

`lib/billing/require-active.ts`:

```ts
export async function requireActiveSubscription(tenantId: string) {
  const t = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: { suspendedAt: true, suspendedReason: true, plan: true },
  });
  if (t?.suspendedAt) {
    return NextResponse.json({
      error: "Trial expirado",
      detail: "Activa un plan para continuar operando.",
      code: "TENANT_SUSPENDED",
      suspendedReason: t.suspendedReason,
      upgradeUrl: "/admin?tab=plan",
    }, { status: 402 });
  }
  return null;
}
```

Aplicar en endpoints de **escritura** (allowlist explícito):

| Endpoint | Razón |
|---|---|
| `/api/checkout/finalize` | Bloquear ventas |
| `/api/admin/customers` POST | Bloquear altas |
| `/api/admin/products` POST/PUT | Bloquear catálogo |
| `/api/admin/expenses` POST | Bloquear gastos |
| `/api/admin/sales` POST | Bloquear POS |
| `/api/admin/orders` POST | Bloquear pedidos manuales |

Endpoints **lectura/billing exentos**: `/api/billing/*`, `/api/admin/analytics/*`, `/api/admin/dashboard/*`, `/api/auth/*`.

### Marketplace listing filter

`lib/db/marketplace.db.ts:listStores()`:

```ts
where: { active: true, suspendedAt: null, plan: { not: undefined } }
```

### Storefront público

`app/t/[tenantSlug]/page.tsx` y `app/(store)/page.tsx`:

```tsx
if (tenant.suspendedAt) {
  return <TenantPausedPage tenantName={tenant.name} />;
}
```

### Webhook reactivación

`app/api/billing/webhook/route.ts` — case `checkout.session.completed`:

```ts
data: {
  // ...existente
  plan: newPlan,
  suspendedAt: null,
  suspendedReason: null,
}
```

### UI

- `<TrialCountdownBanner />` en layout de `/admin` — banner amarillo a 7d, rojo a 3d, crítico si suspended.
- `<TenantSuspendedScreen />` — overlay full-page cuando suspended; CTA "Activar plan" → `/admin?tab=plan`.

### Notificaciones (Fase D)

Cron diario `/api/cron/trial-reminders`:
- T-7 → WhatsApp + email
- T-3 → WhatsApp + email
- T-1 → WhatsApp + email + push

## Consecuencias

**Positivas:**
- Negocios que no pagan dejan de **competir gratis** en marketplace tras 15d.
- El bodeguero **no pierde sus datos** — solo se le ocultan al público.
- Activar plan revierte instantáneamente vía webhook.

**Negativas:**
- Schema change requiere migración Prisma (bloqueado por DIRECT_URL en sesión actual).
- ~10 archivos nuevos/modificados.
- Necesita tests de regresión sobre los endpoints write protegidos.

## Plan de implementación (4 fases)

| Fase | Cambios | Riesgo |
|---|---|---|
| **C1** Schema | Add `suspendedAt`, `suspendedReason` + migration | Requiere DIRECT_URL |
| **C2** Enforcement | `requireActiveSubscription` helper + ~6 endpoints | Bajo |
| **C3** Visibility | Marketplace filter + storefront redirect + `TenantSuspendedScreen` | Bajo |
| **C4** UX | `TrialCountdownBanner` en /admin layout (puede ir antes de C1 — solo lee `trialEndsAt`) | Cero |
| **D** Notifs | Cron `/api/cron/trial-reminders` con WhatsApp/email | Medio |

C4 puede arrancar **YA** (no requiere schema change). Resto espera DIRECT_URL.

## Alternativas descartadas

- **Reusar `active: false`**: rompe ban manual + bloquea panel entero (queremos modo lectura).
- **Solo flag `Tenant.plan = "expired"`**: contamina enum, plan ya implica nivel de capacidad.
- **Cron que borra el tenant**: pierde datos, mala UX para reactivación.

## Referencias

- `prisma/schema.prisma:17-78` — modelo Tenant
- `app/api/cron/trial-expiry/route.ts` — cron actual
- `app/api/onboarding/route.ts:154` — set trial 15d (ya aplicado)
- `app/api/billing/webhook/route.ts:100-165` — webhook activación plan
- ADR-015 checkout-idempotency
- ADR-058 fast-path-routing
