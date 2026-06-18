# Fiado en checkout (pago único el día de pago) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente elegible pague su pedido con fiado en el checkout ("paga el día de pago"), creando un `Fiado` real, con elegibilidad y total validados en backend, detrás de `FIADO_DIGITAL_V2_PHASE3`.

**Architecture:** Rebanada MVP de la **Fase 3 del plan Fiado Digital Ola 2** (`docs/fiado-digital-ola2-plan.md`, US-F3-08). Pago **único** (saldo = total, sin cuotas ni interés, sin aval). Reutiliza: `getAvailableCredit` (CreditProfile), `FiadosDB.validateForNewFiado` + `FiadosDB.create`, crons `fiados-reminder` existentes. Endpoint nuevo `POST /api/checkout/fiado-option` decide si mostrar la opción; el branch fiado vive en `app/api/orders/route.ts` (zona de peligro).

**Tech Stack:** Next 16 App Router · Prisma 7 · Zod 4 `safeParse` · Vitest 4 · feature flags por env var.

**Zona de peligro:** `app/api/orders/route.ts`, `components/checkout/**`, `CheckoutModal.tsx`. Prerequisito Task 0: skill `audit-first` + `checkout-squad`. Total y elegibilidad SIEMPRE en backend (anti-fraude). Idempotency intacta. Rollout gradual del flag 10%→50%→100%.

**Fuera de scope (YAGNI — diferido a Fase 3 completa):** cuotas 2/3/4 con interés (`createInstallmentPlan`), fiado familiar / aval (`CreditGuarantor`), `suggestedPlans` en el endpoint.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `lib/credit/payday.ts` | `nextPayday(from)` — próxima fecha de pago (15 o fin de mes) | Crear |
| `lib/credit/checkout-fiado.ts` | `getFiadoCheckoutEligibility()` — compone flag + crédito + bloqueos + payday | Crear |
| `app/api/checkout/fiado-option/route.ts` | Endpoint POST que devuelve `{ eligible, availableCredit, dueDate, reason }` | Crear |
| `app/api/orders/route.ts:56` | Ampliar `OrderPostSchema.paymentMethod` a incluir `"fiado"` | Modificar |
| `app/api/orders/route.ts` (POST) | Branch fiado: re-valida server-side, crea `Fiado` ligado a la orden | Modificar |
| `components/checkout/FiadoCheckoutOption.tsx` | Tarjeta "Paga el día de pago" con crédito disponible + fecha | Crear |
| `components/checkout/CheckoutPaymentSection.tsx:23` | Ampliar `type PaymentMethod` + render de la opción fiado | Modificar |
| `components/CheckoutModal.tsx` | Fetch a `/api/checkout/fiado-option`, pasar elegibilidad al section | Modificar |
| Tests bajo `__tests__/**` | **CONVENCIÓN (corregida):** vitest SOLO incluye `__tests__/**/*.test.{ts,tsx}` (ver `vitest.config.ts:11`). Los tests NO van colocados junto al source. Mirror: `__tests__/lib/credit/<x>.test.ts`, `__tests__/app/api/checkout/fiado-option/route.test.ts`. Import del source con alias `@/...`, no `./`. | Crear |

---

## Task 0: Pre-flight (zona de peligro)

**No-código. Gate de seguridad antes de tocar checkout.**

- [ ] **Step 1: Cargar contexto de la zona de peligro**

Invocar skill `audit-first` apuntando a `app/api/orders/route.ts` + `components/checkout/`. Leer `docs/adr/` ADR-015 (checkout footer slot) referenciado en el plan Ola 2.

- [ ] **Step 2: Confirmar el branch y el flag**

```bash
git rev-parse --abbrev-ref HEAD   # debe ser audit/storefront-mejoras-verificadas-2026-06-15 o una feature branch
grep -n "FIADO_DIGITAL_V2_PHASE3" .env.example   # documentar la env var
```

Expected: la env var `FIADO_DIGITAL_V2_PHASE3` existe en `.env.example`. Si no, agregarla con valor `"false"`.

- [ ] **Step 3: Activar el flag en local para desarrollo**

Agregar a `.env.local`: `FIADO_DIGITAL_V2_PHASE3="true"` (y sus prerequisitos `FIADO_DIGITAL_V2_PHASE1="true"`, `FIADO_DIGITAL_V2_PHASE2="true"` — Phase 3 los exige). Reiniciar dev server.

---

## Task 1: Helper `nextPayday()` (pura, TDD)

**Files:**
- Create: `lib/credit/payday.ts`
- Test: `lib/credit/payday.test.ts`

Regla de negocio: la fecha de pago por defecto es el **próximo día 15 o último día del mes**, lo que llegue primero, contado desde `from`. Si `from` ya es 15 o fin de mes, salta al siguiente hito.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/credit/payday.test.ts
import { describe, it, expect } from "vitest";
import { nextPayday } from "./payday";

describe("nextPayday", () => {
  it("antes del 15 → devuelve el 15 del mismo mes", () => {
    const r = nextPayday(new Date("2026-06-03T10:00:00"));
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(5); // junio (0-indexed)
    expect(r.getDate()).toBe(15);
  });

  it("entre el 15 y fin de mes → devuelve el último día del mes", () => {
    const r = nextPayday(new Date("2026-06-20T10:00:00"));
    expect(r.getMonth()).toBe(5);
    expect(r.getDate()).toBe(30); // junio tiene 30 días
  });

  it("el día 15 exacto → salta a fin de mes", () => {
    const r = nextPayday(new Date("2026-06-15T10:00:00"));
    expect(r.getDate()).toBe(30);
  });

  it("el último día del mes → salta al 15 del mes siguiente", () => {
    const r = nextPayday(new Date("2026-06-30T10:00:00"));
    expect(r.getMonth()).toBe(6); // julio
    expect(r.getDate()).toBe(15);
  });

  it("febrero (28 días) calcula bien el fin de mes", () => {
    const r = nextPayday(new Date("2026-02-20T10:00:00"));
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(28);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/credit/payday.test.ts`
Expected: FAIL con "Cannot find module './payday'" o "nextPayday is not a function".

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/credit/payday.ts
import "server-only";

/** Último día del mes de `d` (a medianoche local). */
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 0, 0, 0, 0);
}

/**
 * Próxima fecha de pago: el siguiente día 15 o último día del mes,
 * lo que llegue primero después de `from` (estrictamente posterior).
 */
export function nextPayday(from: Date): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const day = from.getDate();

  if (day < 15) return new Date(y, m, 15, 0, 0, 0, 0);

  const eom = endOfMonth(from);
  if (day < eom.getDate()) return eom;

  // from es el último día del mes → 15 del mes siguiente
  return new Date(y, m + 1, 15, 0, 0, 0, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/credit/payday.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/credit/payday.ts lib/credit/payday.test.ts
git commit -m "feat(credit): helper nextPayday para fecha de pago del fiado"
```

---

## Task 2: Eligibility `getFiadoCheckoutEligibility()` (TDD con mocks)

**Files:**
- Create: `lib/credit/checkout-fiado.ts`
- Test: `lib/credit/checkout-fiado.test.ts`

Compone (en este orden, corta temprano): flag PHASE3 → perfil activo → límite > 0 → `validateForNewFiado` (bloqueos por mora/límite). Devuelve un resultado serializable. **Fuente de verdad del gate = `validateForNewFiado`** (lee filas Fiado reales).

Firmas reales reutilizadas:
- `isFiadoDigitalPhase3Enabled(): boolean` — `lib/feature-flags/fiado-digital.ts`
- `getAvailableCredit(tenantId, customerId): Promise<{ creditLimit; usedCredit; availableCredit; isActive }>` — `lib/credit/installment-manager.ts`
- `FiadosDB.validateForNewFiado(tenantId, customerId, requestedAmount, creditLimit): Promise<{ error; status } | null>` — `lib/db/fiados.db.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/credit/checkout-fiado.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/feature-flags/fiado-digital", () => ({
  isFiadoDigitalPhase3Enabled: vi.fn(),
}));
vi.mock("@/lib/credit/installment-manager", () => ({
  getAvailableCredit: vi.fn(),
}));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: { validateForNewFiado: vi.fn() },
}));

import { getFiadoCheckoutEligibility } from "./checkout-fiado";
import { isFiadoDigitalPhase3Enabled } from "@/lib/feature-flags/fiado-digital";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { FiadosDB } from "@/lib/db/fiados.db";

const T = "tenant-1";
const C = "+51999111222";

beforeEach(() => {
  vi.mocked(isFiadoDigitalPhase3Enabled).mockReturnValue(true);
  vi.mocked(getAvailableCredit).mockResolvedValue({
    creditLimit: 100, usedCredit: 20, availableCredit: 80, isActive: true,
  });
  vi.mocked(FiadosDB.validateForNewFiado).mockResolvedValue(null); // sin bloqueo
});

describe("getFiadoCheckoutEligibility", () => {
  it("flag apagado → no elegible", async () => {
    vi.mocked(isFiadoDigitalPhase3Enabled).mockReturnValue(false);
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(false);
  });

  it("perfil inactivo → no elegible con razón", async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue({
      creditLimit: 0, usedCredit: 0, availableCredit: 0, isActive: false,
    });
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/no.*activ/i);
  });

  it("bloqueo por mora (validateForNewFiado) → no elegible, propaga el error", async () => {
    vi.mocked(FiadosDB.validateForNewFiado).mockResolvedValue({
      error: "Cliente bloqueado: tiene 3 fiados vencidos sin pagar", status: 400,
    });
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("vencidos");
  });

  it("elegible → devuelve availableCredit y dueDate", async () => {
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(true);
    expect(r.availableCredit).toBe(80);
    expect(r.dueDate).toBeInstanceOf(Date);
  });

  it("pasa el creditLimit del perfil a validateForNewFiado", async () => {
    await getFiadoCheckoutEligibility(T, C, 30);
    expect(FiadosDB.validateForNewFiado).toHaveBeenCalledWith(T, C, 30, 100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/credit/checkout-fiado.test.ts`
Expected: FAIL con "Cannot find module './checkout-fiado'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/credit/checkout-fiado.ts
import "server-only";
import { isFiadoDigitalPhase3Enabled } from "@/lib/feature-flags/fiado-digital";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { FiadosDB } from "@/lib/db/fiados.db";
import { nextPayday } from "./payday";

export type FiadoEligibility = {
  eligible: boolean;
  availableCredit: number;
  creditLimit: number;
  dueDate: Date | null;
  reason: string | null;
};

const NO = (reason: string): FiadoEligibility => ({
  eligible: false, availableCredit: 0, creditLimit: 0, dueDate: null, reason,
});

/**
 * Decide si un cliente puede pagar `total` con fiado en el checkout.
 * Gate autoritativo = FiadosDB.validateForNewFiado (lee filas Fiado reales).
 * tenantId 1er parámetro (regla multi-tenant).
 */
export async function getFiadoCheckoutEligibility(
  tenantId: string,
  customerId: string,
  total: number,
): Promise<FiadoEligibility> {
  if (!isFiadoDigitalPhase3Enabled()) return NO("Fiado no disponible");
  if (!Number.isFinite(total) || total <= 0) return NO("Monto inválido");

  const profile = await getAvailableCredit(tenantId, customerId);
  if (!profile.isActive) return NO("El fiado no está activado para tu cuenta");
  if (profile.creditLimit <= 0) return NO("Aún no tienes límite de fiado asignado");

  const block = await FiadosDB.validateForNewFiado(
    tenantId, customerId, total, profile.creditLimit,
  );
  if (block) return { ...NO(block.error), creditLimit: profile.creditLimit };

  return {
    eligible: true,
    availableCredit: profile.availableCredit,
    creditLimit: profile.creditLimit,
    dueDate: nextPayday(new Date()),
    reason: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/credit/checkout-fiado.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/credit/checkout-fiado.ts lib/credit/checkout-fiado.test.ts
git commit -m "feat(credit): elegibilidad de fiado para checkout (gate por validateForNewFiado)"
```

---

## Task 3: Endpoint `POST /api/checkout/fiado-option`

**Files:**
- Create: `app/api/checkout/fiado-option/route.ts`
- Test: `app/api/checkout/fiado-option/route.test.ts`

Contrato (simplificado vs Ola 2 — sin `suggestedPlans`):
- Request body: `{ total: number }`
- Auth: sesión de cliente (cookie), igual que `/mi-credito`.
- Response 200: `{ eligible, availableCredit, dueDate: string | null, reason }`.

Reglas db-classes: `safeParse`, sin `force-dynamic`, `applyRateLimit` (síncrono).

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/checkout/fiado-option/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/customer-session", () => ({
  CUSTOMER_SESSION: { COOKIE_NAME: "buleje-cust-sess" },
  getCustomerPayload: vi.fn(),
}));
vi.mock("@/lib/credit/checkout-fiado", () => ({
  getFiadoCheckoutEligibility: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));

import { POST } from "./route";
import { getCustomerPayload } from "@/lib/auth/customer-session";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";

function req(body: unknown, cookie = "buleje-cust-sess=tok") {
  return new Request("http://t.local/api/checkout/fiado-option", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getCustomerPayload).mockResolvedValue({
    tenantId: "t1", customerId: "+51999", name: "Ana",
  } as never);
});

describe("POST /api/checkout/fiado-option", () => {
  it("sin sesión → 401", async () => {
    const res = await POST(req({ total: 30 }, ""));
    expect(res.status).toBe(401);
  });

  it("body inválido → 400", async () => {
    const res = await POST(req({ total: -5 }));
    expect(res.status).toBe(400);
  });

  it("elegible → 200 con dueDate serializado", async () => {
    vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
      eligible: true, availableCredit: 80, creditLimit: 100,
      dueDate: new Date("2026-06-15"), reason: null,
    });
    const res = await POST(req({ total: 30 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eligible).toBe(true);
    expect(json.availableCredit).toBe(80);
    expect(typeof json.dueDate).toBe("string");
  });

  it("pasa tenantId del payload a la elegibilidad", async () => {
    vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
      eligible: false, availableCredit: 0, creditLimit: 0, dueDate: null, reason: "x",
    });
    await POST(req({ total: 30 }));
    expect(getFiadoCheckoutEligibility).toHaveBeenCalledWith("t1", "+51999", 30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/checkout/fiado-option/route.test.ts`
Expected: FAIL con "Cannot find module './route'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// app/api/checkout/fiado-option/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CUSTOMER_SESSION,
  getCustomerPayload,
} from "@/lib/auth/customer-session";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";
import { applyRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({ total: z.number().positive() });

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export async function POST(req: Request): Promise<Response> {
  const limited = applyRateLimit(req as never);
  if (limited) return limited;

  const token = readCookie(req, CUSTOMER_SESSION.COOKIE_NAME);
  const customer = token ? await getCustomerPayload(token) : null;
  if (!customer?.tenantId || !customer?.customerId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const elig = await getFiadoCheckoutEligibility(
    customer.tenantId, customer.customerId, parsed.data.total,
  );

  return NextResponse.json({
    eligible: elig.eligible,
    availableCredit: elig.availableCredit,
    dueDate: elig.dueDate ? elig.dueDate.toISOString() : null,
    reason: elig.reason,
  });
}
```

> **Nota de integración (verificar en Step 3):** confirmar la firma real de `applyRateLimit` en `lib/rate-limit.ts` y de `getCustomerPayload`. En `app/api/orders/route.ts` el import es `import("@/lib/auth/customer-session")` con `getCustomerPayload(sessionToken)` y `CUSTOMER_SESSION` — alinear nombres exactos. Si `applyRateLimit` espera `NextRequest`, importar `NextRequest` y tipar el handler como `(req: NextRequest)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/checkout/fiado-option/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/fiado-option
git commit -m "feat(checkout): endpoint fiado-option (elegibilidad por sesión de cliente)"
```

---

## Task 4: Branch fiado en el POST de órdenes (zona de peligro)

**Files:**
- Modify: `app/api/orders/route.ts:56` (schema) y el POST handler (branch fiado tras `OrdersDB.add`)
- Test: `app/api/orders/route.fiado.test.ts`

Reglas: validar elegibilidad **antes** de crear la orden (anti-fraude, total backend). Crear el `Fiado` después de `OrdersDB.add(order, tenantId)`. Idempotency intacta. Si `FiadosDB.create` falla, loguear con `logger.error` (nunca `.catch(() => {})`) — atomicidad fuerte (createInTransaction) queda como hardening del checkout-squad en un follow-up.

- [ ] **Step 1: Ampliar el enum de paymentMethod**

En `app/api/orders/route.ts:56`, cambiar:

```typescript
// ANTES
paymentMethod: z.enum(["yape", "efectivo"]).optional().default("efectivo"),
// DESPUÉS
paymentMethod: z.enum(["yape", "efectivo", "fiado"]).optional().default("efectivo"),
```

- [ ] **Step 2: Write the failing test**

```typescript
// app/api/orders/route.fiado.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/credit/checkout-fiado", () => ({
  getFiadoCheckoutEligibility: vi.fn(),
}));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: { create: vi.fn() },
}));

import { createFiadoForOrder } from "@/lib/credit/checkout-fiado-order";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";
import { FiadosDB } from "@/lib/db/fiados.db";

beforeEach(() => {
  vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
    eligible: true, availableCredit: 80, creditLimit: 100,
    dueDate: new Date("2026-06-15"), reason: null,
  });
  vi.mocked(FiadosDB.create).mockResolvedValue({ id: "fiado-1" } as never);
});

describe("createFiadoForOrder", () => {
  it("crea el Fiado con fechaVence = dueDate y descripción del pedido", async () => {
    await createFiadoForOrder("t1", {
      orderId: "ord-9", customerId: "+51999", total: 30,
    });
    expect(FiadosDB.create).toHaveBeenCalledWith({
      tenantId: "t1",
      customerId: "+51999",
      total: 30,
      descripcion: "Pedido ord-9",
      fechaVence: new Date("2026-06-15"),
    });
  });

  it("rechaza si la elegibilidad falla (anti-fraude server-side)", async () => {
    vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
      eligible: false, availableCredit: 0, creditLimit: 0, dueDate: null,
      reason: "Supera límite",
    });
    await expect(
      createFiadoForOrder("t1", { orderId: "ord-9", customerId: "+51999", total: 999 }),
    ).rejects.toThrow(/límite/i);
    expect(FiadosDB.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/orders/route.fiado.test.ts`
Expected: FAIL con "Cannot find module '@/lib/credit/checkout-fiado-order'".

- [ ] **Step 4: Implementar el helper de creación**

```typescript
// lib/credit/checkout-fiado-order.ts
import "server-only";
import { getFiadoCheckoutEligibility } from "./checkout-fiado";
import { FiadosDB } from "@/lib/db/fiados.db";

/**
 * Re-valida elegibilidad en backend y crea el Fiado ligado a una orden.
 * Lanza si no es elegible (la orden NO debe quedar como fiado en ese caso).
 */
export async function createFiadoForOrder(
  tenantId: string,
  args: { orderId: string; customerId: string; total: number },
): Promise<{ id: string }> {
  const elig = await getFiadoCheckoutEligibility(
    tenantId, args.customerId, args.total,
  );
  if (!elig.eligible || !elig.dueDate) {
    throw new Error(elig.reason ?? "No elegible para fiado");
  }
  const fiado = await FiadosDB.create({
    tenantId,
    customerId: args.customerId,
    total: args.total,
    descripcion: `Pedido ${args.orderId}`,
    fechaVence: elig.dueDate,
  });
  return { id: fiado.id };
}
```

- [ ] **Step 5: Run helper test to verify it passes**

Run: `npx vitest run app/api/orders/route.fiado.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Cablear el branch en el POST de órdenes**

En `app/api/orders/route.ts`, **después** de `const saved = await ... OrdersDB.add(order, tenantId)` (≈línea 749) y **antes** de construir la respuesta, agregar:

```typescript
// ── Fiado: "paga el día de pago" ──────────────────────────────────────────
// Anti-fraude: re-validar en backend y crear el Fiado ligado a la orden.
// Si falla la creación del Fiado, NO rompemos la orden (ya guardada); se
// loguea fuerte para reconciliación. Atomicidad estricta = follow-up del
// checkout-squad con FiadosDB.createInTransaction.
if (saved.paymentMethod === "fiado") {
  const customerPhone = saved.customerPhone ?? phoneFromBody;
  if (!customerPhone) {
    return NextResponse.json(
      { error: "El fiado requiere un teléfono de cliente" },
      { status: 400 },
    );
  }
  try {
    const { createFiadoForOrder } = await import("@/lib/credit/checkout-fiado-order");
    await createFiadoForOrder(tenantId, {
      orderId: saved.id,
      customerId: customerPhone,
      total: saved.total ?? body.total,
    });
  } catch (err) {
    logger.error("[orders.POST] fiado creation failed", {
      orderId: saved.id, error: String(err),
    });
    // La orden existe; queda pending de reconciliación por cron/admin.
  }
}
```

> **Verificar nombres reales en Step 6:** `saved.customerPhone`, `phoneFromBody`, `saved.total`, `logger` ya están en scope del POST handler (`phoneFromBody` se usa en la lógica de idempotency ~línea 275; `logger` es el logger del proyecto). Ajustar a los identificadores exactos del archivo.

- [ ] **Step 7: Verificación de tipos y lint**

Run: `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit && npm run lint`
Expected: 0 errores. Cerrar el navegador Playwright antes del tsc (mem-guard).

- [ ] **Step 8: Commit**

```bash
git add app/api/orders/route.ts lib/credit/checkout-fiado-order.ts app/api/orders/route.fiado.test.ts
git commit -m "feat(checkout): metodo de pago fiado crea Fiado ligado a la orden (validado backend)"
```

---

## Task 5: UI — opción "Paga el día de pago" en el checkout

**Files:**
- Create: `components/checkout/FiadoCheckoutOption.tsx`
- Modify: `components/checkout/CheckoutPaymentSection.tsx` (tipo + render)
- Modify: `components/CheckoutModal.tsx` (fetch elegibilidad + props)

Reglas UI: tokens DS (sin hex salvo los ya usados con fallback de marca), `h-12`+ para inputs, copy en **tuteo** ("Paga"/"Elige"), Lucide icons, `"use client"` primera línea.

- [ ] **Step 1: Crear el componente de la opción**

```tsx
// components/checkout/FiadoCheckoutOption.tsx
"use client";

import { CalendarClock, CheckCircle2, Wallet } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/utils";

interface Props {
  selected: boolean;
  onSelect: () => void;
  availableCredit: number;
  dueDateLabel: string; // ej. "15 de junio"
}

/**
 * Tarjeta de método de pago "Paga el día de pago" (fiado, pago único).
 * Solo se renderiza cuando el cliente es elegible (decisión del padre).
 */
export function FiadoCheckoutOption({
  selected, onSelect, availableCredit, dueDateLabel,
}: Props) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid="payment-fiado"
      onClick={onSelect}
      className="relative w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99]"
      style={
        selected
          ? {
              borderColor: "var(--color-primary, #00A0A0)",
              background: "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--color-card))",
            }
          : {
              borderColor: "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
              background: "var(--color-card)",
            }
      }
    >
      {selected && (
        <span
          className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ background: "var(--color-primary, #00A0A0)" }}
          aria-hidden="true"
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
      <span
        className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"
        style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 14%, transparent)" }}
      >
        <Wallet className="h-6 w-6" strokeWidth={2} style={{ color: "var(--color-primary-dark, #009690)" }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-extrabold" style={{ color: "var(--color-primary-dark, #009690)" }}>
          Paga el día de pago
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2} />
          Vence el {dueDateLabel} · disponible {formatCurrency(availableCredit)}
        </span>
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Ampliar el tipo y los props en `CheckoutPaymentSection.tsx`**

En `components/checkout/CheckoutPaymentSection.tsx:23`:

```typescript
type PaymentMethod = "yape" | "efectivo" | "fiado";
```

Agregar a `CheckoutPaymentSectionProps` (después de `cashEnabled`):

```typescript
  fiadoEligible: boolean;
  fiadoAvailableCredit: number;
  fiadoDueDateLabel: string;
```

Importar el componente al tope (después del directive y junto a los otros imports):

```typescript
import { FiadoCheckoutOption } from "./FiadoCheckoutOption";
```

Renderizar dentro del `<section>` de método de pago, **después** del `</div>` del `grid grid-cols-2` (línea ≈336) y antes de los paneles condicionales:

```tsx
{fiadoEligible && (
  <FiadoCheckoutOption
    selected={paymentMethod === "fiado"}
    onSelect={() => onPaymentMethodChange("fiado")}
    availableCredit={fiadoAvailableCredit}
    dueDateLabel={fiadoDueDateLabel}
  />
)}
```

Y desestructurar los 3 props nuevos en la firma de la función `CheckoutPaymentSection({ ... })`.

- [ ] **Step 3: Cablear elegibilidad en `CheckoutModal.tsx`**

Agregar estado y fetch (cuando el total esté disponible y el usuario llegue al paso de pago):

```tsx
const [fiado, setFiado] = useState<{
  eligible: boolean; availableCredit: number; dueDateLabel: string;
}>({ eligible: false, availableCredit: 0, dueDateLabel: "" });

useEffect(() => {
  if (finalTotal <= 0) return;
  let alive = true;
  fetch("/api/checkout/fiado-option", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ total: finalTotal }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!alive || !d) return;
      setFiado({
        eligible: !!d.eligible,
        availableCredit: d.availableCredit ?? 0,
        dueDateLabel: d.dueDate
          ? new Date(d.dueDate).toLocaleDateString("es-PE", { day: "numeric", month: "long" })
          : "",
      });
    })
    .catch((err) => console.warn("[checkout] fiado-option failed", err));
  return () => { alive = false; };
}, [finalTotal]);
```

Pasar al `<CheckoutPaymentSection ... />`:

```tsx
fiadoEligible={fiado.eligible}
fiadoAvailableCredit={fiado.availableCredit}
fiadoDueDateLabel={fiado.dueDateLabel}
```

> **Verificar en Step 3:** el nombre real de la variable del total final en `CheckoutModal.tsx` (probablemente `finalTotal`), y que el `paymentMethod` state ya admite el string `"fiado"` (si está tipado como union, ampliarlo).

- [ ] **Step 4: Verificación visual + tipos**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit
```
Luego `/preview /checkout` o abrir el checkout en el navegador con un cliente elegible (ver Task 6 para crear el perfil) y confirmar que la tarjeta "Paga el día de pago" aparece con la fecha y el monto. Capturar screenshot light + dark.

Expected: tarjeta visible solo si `fiadoEligible`, seleccionable, copy en tuteo, sin texto diminuto.

- [ ] **Step 5: Commit**

```bash
git add components/checkout/FiadoCheckoutOption.tsx components/checkout/CheckoutPaymentSection.tsx components/CheckoutModal.tsx
git commit -m "feat(checkout): UI metodo de pago paga el dia de pago (fiado)"
```

---

## Task 6: Verificación end-to-end + eval de zona roja

**Files:**
- Create (opcional): `e2e/fiado-checkout.spec.ts`

- [ ] **Step 1: Sembrar un cliente elegible**

Crear (o verificar) un `CreditProfile` activo con `creditLimit` > 0 para un cliente de prueba en tenant `main`, vía script `pg` directo o la UI admin de fiado. Confirmar con:

```sql
SELECT "customerId","creditLimit","usedCredit","availableCredit","isActive"
FROM "CreditProfile" WHERE "tenantId"=(SELECT id FROM "Tenant" WHERE slug='main') LIMIT 5;
```

- [ ] **Step 2: Probar el endpoint con sesión real (curl)**

Usar skill `/auth` para loguear un cliente y persistir la cookie, luego:

```bash
curl -s -X POST http://localhost:3000/api/checkout/fiado-option \
  -H "content-type: application/json" -b /tmp/bsm-auth.env \
  -d '{"total":30}' | jq
```

Expected: `{ "eligible": true, "availableCredit": <n>, "dueDate": "<iso>", "reason": null }`.

- [ ] **Step 3: Flujo completo en el navegador**

Con el cliente elegible: agregar productos (total ≤ availableCredit) → checkout → elegir "Paga el día de pago" → confirmar. Verificar en DB que se creó la orden con `paymentMethod='fiado'` y un `Fiado` con `descripcion='Pedido <id>'` y `fechaVence` = próximo payday.

```sql
SELECT o.id, o."paymentMethod", f.id AS fiado_id, f.saldo, f."fechaVence"
FROM "Order" o LEFT JOIN "Fiado" f ON f.descripcion = CONCAT('Pedido ', o.id)
WHERE o."paymentMethod"='fiado' ORDER BY o."createdAt" DESC LIMIT 3;
```

- [ ] **Step 4: Caso negativo (anti-fraude)**

Intentar checkout con `total` > `availableCredit`: el endpoint devuelve `eligible:false` (la tarjeta no aparece) y, si se fuerza el POST a `/api/orders` con `paymentMethod:"fiado"` y monto excesivo (curl directo), `createFiadoForOrder` lanza y se loguea — **no se crea Fiado**. Verificar que no hay fila Fiado huérfana.

- [ ] **Step 5: Eval de zona roja**

Run: skill `eval` zona `fiado` (y `checkout`). Expected: pasa el bar de la rubric.

- [ ] **Step 6: Commit**

```bash
git add e2e/fiado-checkout.spec.ts 2>/dev/null; git commit -m "test(checkout): e2e + eval del flujo fiado en checkout" --allow-empty
```

---

## Task 7: Rollout del flag (gradual)

- [ ] **Step 1: Documentar el rollout**

`FIADO_DIGITAL_V2_PHASE3` arranca `"false"` en prod. Encender gradual 10%→50%→100% (R5 del plan Ola 2: bug en checkout = compras bloqueadas). Fallback: si la tarjeta fiado no aparece, el cliente paga con Yape/efectivo normal (cero bloqueo).

- [ ] **Step 2: Pre-deploy gate**

Run: skill `deploy-check` (lint + tsc + test + build + SLO). Expected: todo verde.

---

## Self-Review (cobertura vs spec)

| Requisito del spec (Fase 1 / B) | Task |
|---|---|
| Método de pago fiado en checkout, solo si elegible | Task 4 (schema/branch) + Task 5 (UI) + Task 3 (endpoint elegibilidad) |
| Elegibilidad y total validados en backend (anti-fraude) | Task 2 + Task 4 (`createFiadoForOrder` re-valida) |
| Crea `Fiado` con vence = día de pago | Task 1 (payday) + Task 4 |
| Límite controlado por el dueño | Reutiliza `CreditProfile.creditLimit` (admin existente) — no se toca aquí |
| Recordatorio WhatsApp el día de pago | Crons `fiados-reminder` existentes (PHASE2) — sin trabajo nuevo |
| Detrás de flag | **Corrección:** `FIADO_DIGITAL_V2_PHASE3` (no PHASE1; PHASE3 = "integración checkout") · Task 0 + Task 7 |
| Chip "crédito disponible" en home/PDP | **Diferido** — surfacing fuera del core de checkout; se hace en plan aparte (menor prioridad) |

**Decisión de scope:** el chip de home/PDP se difiere a un plan de surfacing posterior para mantener este plan enfocado en el flujo de pago (single, testeable). Queda registrado, no perdido.

---

## Estado de ejecución (2026-06-18)

| Task | Estado | Evidencia |
|---|---|---|
| 1 — `nextPayday` | ✅ | 5/5 vitest (`e4ee48f8` + fix `e20a81bd` reubica test a `__tests__/`) |
| 2 — elegibilidad | ✅ | 5/5 vitest (`c8061682`) |
| 3 — endpoint | ✅ | 4/4 vitest (`80b09f1b`); en dev responde 403 sin auth (middleware CSRF protege la ruta) |
| 4 — branch orders (DANGER) | ✅ | 2/2 vitest helper; tsc de todo el proyecto verde; `GET /api/orders` 200 en dev = compila+corre (`f6ff86bd`) |
| 5 — UI | ✅ | tsc + 67 related tests + design lint verdes (`9540b88f`); `canConfirm` y tipos `PaymentMethod`/`EffectiveValues` ampliados a "fiado" |
| 6 — e2e + eval | 🟡 parcial | unit 16/16, routing y compile verificados. **Pendiente:** flujo browser del cliente ELEGIBLE (requiere flags PHASE1/2/3 on + `CreditProfile` activo sembrado + sesión cliente) — hacer en staging, NO reiniciar dev local al pepe. Eval zona fiado/checkout: correr con flags on. |
| 7 — rollout | ✅ doc | Flags `FIADO_DIGITAL_V2_PHASE1/2/3 = "false"` en `.env.local` (OFF por defecto = seguro). Encender en orden 1→2→3. Prod gradual 10%→50%→100% (R5 Ola 2: bug en checkout = compras bloqueadas). Fallback: si la tarjeta fiado no aparece, el cliente paga Yape/efectivo (cero bloqueo). Pre-deploy: skill `deploy-check`. |

**Gotchas descubiertos en ejecución (para el próximo agente):**
- Vitest SOLO corre `__tests__/**` — no colocar tests junto al source (un agente lo hizo y reportó verde en falso).
- El tipo de orden `DbOrder.paymentMethod` vive en `lib/db/misc.db.ts` (no en el schema Zod) — ampliarlo al agregar métodos de pago.
- `EffectiveValues.payment` y `canConfirm` (useCheckoutHandlers) también tipaban/validaban solo yape/efectivo — ampliados.
- Agentes `backend`/`frontend` se aíslan en worktree de base vieja (sin prisma generate → 200+ errores tsc falsos). Para esta feature se implementó en el working dir principal.
