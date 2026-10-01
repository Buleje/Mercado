# CONTRACTS/ola-2.md — Contrato de tipos Ola 2

**Fecha:** 2026-04-10
**Generado por:** orchestrator (sesion opus main)
**Items:** #9 Cupones por tienda, #11 Cashflow 13 semanas, #13 Recetas costo real, #15 Self-signup proveedor

> ⚠️ **Regla de oro:** back, front y qa deben importar SOLO los tipos de este archivo. Si necesitan un tipo nuevo → pedir al orchestrator via BIDDING.md. Nada de inventar tipos sobre la marcha.

---

## #9 — Cupones por tienda (TD-032)

### Schema delta (solo back toca)

```prisma
// prisma/schema.prisma — modelo Coupon
model Coupon {
  // ... campos existentes
  storeId   String?   // NULL = cupon de plataforma, valor = cupon de tienda
  store     Store?    @relation(fields: [storeId], references: [id])

  @@index([tenantId, storeId])
}
```

### Tipos compartidos

```ts
// lib/types/coupons.ts (NUEVO — back crea, front lee)
export type CouponScope = "platform" | "store";

export interface CouponWithScope {
  id: string;
  tenantId: string;
  code: string;
  scope: CouponScope;
  storeId: string | null;
  discount: number;
  active: boolean;
}

export interface CreateCouponInput {
  code: string;
  scope: CouponScope;
  storeId?: string;        // obligatorio si scope === "store"
  discount: number;
  active?: boolean;
}
```

### API

| Verbo | Ruta | Body | Response | Quien |
|---|---|---|---|---|
| POST | `/api/marketplace/coupons` | `CreateCouponInput` | `CouponWithScope` | back |
| GET | `/api/marketplace/coupons?storeId=X` | — | `CouponWithScope[]` | back |
| GET | `/api/marketplace/coupons?scope=platform` | — | `CouponWithScope[]` | back |

### Invariantes (QA valida)

1. Si `scope === "store"` → `storeId` obligatorio, no null.
2. Tenant A NO puede ver cupones de tenant B (multi-tenant).
3. Tienda A NO puede ver cupones de tienda B dentro del mismo tenant.
4. Cupon de `scope === "platform"` visible por todas las tiendas del tenant.

---

## #11 — Cashflow 13 semanas rolling

### Tipos

```ts
// lib/types/cashflow.ts (NUEVO)
export interface WeekBucket {
  weekStart: string;       // ISO date lunes de esa semana
  weekEnd: string;         // ISO date domingo
  weekNumber: number;      // 1..13
  ingresos: number;        // suma ventas pagadas
  egresos: number;         // compras, gastos operativos
  fiadosAbonados: number;  // abonos a fiados
  netFlow: number;         // ingresos - egresos + fiadosAbonados
}

export interface CashFlowRolling13 {
  tenantId: string;
  generatedAt: string;     // ISO
  weeks: WeekBucket[];     // length === 13
  totals: {
    ingresos: number;
    egresos: number;
    netFlow: number;
  };
  warnings: string[];      // ej: "semana 5 tiene 0 ventas"
}
```

### API

| Verbo | Ruta | Query | Response | Quien |
|---|---|---|---|---|
| GET | `/api/finance/cashflow-rolling` | `?weeks=13` (default 13) | `CashFlowRolling13` | back |

### Invariantes

1. Solo rol `admin` puede llamar (requireAdmin).
2. Siempre devuelve exactamente 13 semanas, incluso si algunas tienen 0 datos.
3. Semana 1 = actual, semana 13 = mas antigua.
4. `netFlow` se calcula server-side — front NO recalcula.

---

## #13 — Recetas con costo real

### Tipos

```ts
// lib/types/recetas.ts (extender existente)
export interface RecetaCostBreakdown {
  recetaId: string;
  costoIngredientes: number;
  costoManoObra: number;
  costoIndirectos: number;
  costoTotalUnitario: number;
  precioVenta: number;
  margenBruto: number;      // precioVenta - costoTotalUnitario
  margenPorcentaje: number; // (margenBruto / precioVenta) * 100
}
```

### API

| Verbo | Ruta | Response | Quien |
|---|---|---|---|
| GET | `/api/recetas/:id/cost-breakdown` | `RecetaCostBreakdown` | back (YA EXISTE, verificar) |

Front solo consume. NO toca esta API.

---

## #15 — Self-signup proveedor

### Tipos

```ts
// lib/types/supplier-signup.ts (NUEVO)
export interface SupplierSignupInput {
  businessName: string;
  ruc: string;              // 11 digitos Peru
  contactName: string;
  contactEmail: string;
  contactPhone: string;     // +51 format
  categories: string[];     // ["abarrotes", "bebidas", ...]
  acceptedTerms: boolean;
}

export interface SupplierSignupResult {
  id: string;
  status: "pending_review" | "approved" | "rejected";
  submittedAt: string;
  estimatedReviewDays: number;
}
```

### API

| Verbo | Ruta | Body | Response | Quien |
|---|---|---|---|---|
| POST | `/api/supplier/register` | `SupplierSignupInput` | `SupplierSignupResult` | back |

### Invariantes

1. Rate limit 5 requests / hora por IP.
2. RUC validado formato 11 digitos antes de DB.
3. Email unico — si ya existe devolver 409.
4. Crea entry en `SupplierApplication` con `status: "pending_review"`.
5. Notifica a `admin@tenant.com` fire-and-forget.

---

## Asignacion de archivos (referencia cruzada con LOCKS.md)

| Archivo | Frente | Accion |
|---|---|---|
| `prisma/schema.prisma` | back | ALTER Coupon (storeId) |
| `lib/db/coupons.db.ts` | back | Agregar methods scoped |
| `lib/db/supplier-signup.db.ts` | back | CREAR |
| `lib/finance/cashflow-rolling.ts` | back | CREAR |
| `app/api/marketplace/coupons/route.ts` | back | Update GET + POST |
| `app/api/finance/cashflow-rolling/route.ts` | back | CREAR |
| `app/api/supplier/register/route.ts` | back | CREAR |
| `lib/types/coupons.ts` | back | CREAR (source of truth) |
| `lib/types/cashflow.ts` | back | CREAR |
| `lib/types/supplier-signup.ts` | back | CREAR |
| `components/admin/unified/VendorDashboardModule.tsx` | front | toggle cupon tienda/plataforma |
| `components/admin/CashFlowRolling.tsx` | front | CREAR |
| `components/admin/RecetasModule.tsx` | front | costo real + margen |
| `app/supplier/registrar/page.tsx` | front | CREAR |
| `components/supplier/SupplierSignupForm.tsx` | front | CREAR |
| `__tests__/coupons-store-isolation.test.ts` | qa | CREAR |
| `__tests__/cashflow-rolling.test.ts` | qa | CREAR |
| `__tests__/supplier-signup.test.ts` | qa | CREAR |
| `__tests__/recetas-costo-real.test.ts` | qa | CREAR |

---

## Checklist de salida (antes de REPORTS/ola-2-{frente}.md)

- [ ] TSC limpio en el worktree (`npx tsc --noEmit`)
- [ ] Lint limpio (`npm run lint`)
- [ ] Tests verdes del slot propio (`npm run test -- [files]`)
- [ ] LOCKS.md con items marcados `[done]`
- [ ] REPORTS/ola-2-{frente}.md con lista de archivos tocados, riesgos, y tests agregados
- [ ] Push a `wt/roadmap-{bugs|features|tier-a}` — NO merge
