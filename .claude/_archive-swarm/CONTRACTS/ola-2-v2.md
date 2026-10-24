# CONTRACTS/ola-2-v2.md — Contrato endurecido Ola 2

**Fecha:** 2026-04-10 17:35
**Generado por:** architect (solution-architect agent)
**Supera:** `ola-2.md` v1 (NO usar v1 — tiene 10 errores criticos)
**Items:** #9 Cupones por tienda, #11 Cashflow 13 semanas, #13 Recetas costo real, #15 Self-signup proveedor

> ⚠️ **V1 ES OBSOLETO.** Los frentes DEBEN leer la tabla de cambios criticos antes de tocar codigo.

---

## 🚨 Tabla C1-C10 — Cambios criticos vs v1

| # | Cambio | Frente afectado | Severidad |
|---|--------|-----------------|-----------|
| C1 | `lib/db/coupons.db.ts` YA EXISTE — `CouponsDB` tiene `list()`, `listByStore()`, `create()`, `findByCode()`. NO crear `lib/types/coupons.ts` separado. Importar `DbCoupon` desde `@/lib/db/coupons.db` | back, front | 🔴 CRITICO — duplicaria logica |
| C2 | Tipos cashflow: `WeekRow` + `CashflowRollingResult` (en `lib/finance/cashflow-rolling.ts`), **NO** `WeekBucket`/`CashFlowRolling13` | front, qa | 🔴 CRITICO — crash de tipos |
| C3 | Form supplier: `razonSocial` (string) + `category` (enum singular), **NO** `businessName` + `categories[]` | front, qa | 🔴 CRITICO — runtime crash silencioso |
| C4 | `GET /api/recetas/:id/cost-breakdown` NO existe aun — es el UNICO endpoint nuevo de #13 | back | 🟠 ALTO — hay que crearlo |
| C5 | Schema `Coupon` YA tiene `storeId` + `@@unique([tenantId, code])` + `@@index([storeId, code])`. Solo FALTA `@@index([tenantId, storeId])` | back, database | 🟠 ALTO — migracion doble rompe deploy |
| C6 | Rate limit supplier: **3/hora/IP**, NO 5 | qa | 🟡 MEDIO — tests fallarian |
| C7 | `SupplierApplication` NO es modelo separado — usar `Supplier` con `estado: "pending_review"` + `tenantId: "__platform__"` | back, database | 🟠 ALTO — duplica logica |
| C8 | Response POST `/supplier/register` = `{ok, supplierId, message}`, NO incluye `status/submittedAt/estimatedReviewDays` | front | 🟡 MEDIO — UI ajustarse |
| C9 | `/api/finance/cashflow-rolling` YA existe, acepta roles `["admin", "cajero"]`, NO solo `admin` | qa | 🟡 MEDIO — test de auth fallaria |
| C10 | `lib/db/supplier-signup.db.ts` + `lib/finance/cashflow-rolling.ts` YA existen completos — NO crear duplicados | back | 🔴 CRITICO — colision de modulos |

---

## Plan de migracion Prisma — UNA sola migracion

```sql
-- Archivo: 20260410_001_coupon_tenant_store_index.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coupon_tenantId_storeId_idx"
  ON "Coupon"("tenantId", "storeId");
```

Items #11, #13, #15 NO requieren cambios de schema.

---

## Esquemas Zod concretos

### #9 — POST /api/marketplace/coupons

```ts
export const CreateCouponSchema = z.object({
  code: z.string().min(3).max(50).regex(/^[A-Z0-9_-]+$/, "Solo mayusculas, numeros, guion y guion bajo"),
  description: z.string().max(300).optional(),
  discountType: z.enum(["percent", "fixed", "giftcard"]).default("percent"),
  discountValue: z.number().positive().max(100),
  storeId: z.string().cuid().nullable().optional(),
  minPurchase: z.number().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.discountType === "percent" && data.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big, maximum: 100, type: "number",
      inclusive: true, path: ["discountValue"],
      message: "Porcentaje no puede superar 100"
    });
  }
});
```

### #13 — GET /api/recetas/[id]/cost-breakdown (RecetaCostBreakdown)

```ts
export interface RecetaCostBreakdown {
  recetaId: string;
  tenantId: string;
  nombre: string;
  ingredientes: {
    productoId: number;
    nombre: string;
    cantidad: number;
    unidad: string;
    precioUnitario: number;   // costPrice || price
    subtotal: number;
  }[];
  costoIngredientes: number;
  costoManoObra: number;         // 0 esta iteracion
  costoIndirectos: number;       // 0 esta iteracion
  costoTotalUnitario: number;
  precioVenta: number | null;    // null si receta sin Product vinculado
  margenBruto: number | null;
  margenPorcentaje: number | null;
}
```

### #15 — POST /api/supplier/register (schema real)

```ts
const SUPPLIER_CATEGORIES = [
  "abarrotes","bebidas","limpieza","higiene",
  "snacks","lacteos","panaderia","otros"
] as const;

export const SupplierRegisterSchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "RUC debe tener exactamente 11 digitos"),
  razonSocial: z.string().min(3).max(200),
  category: z.enum(SUPPLIER_CATEGORIES),           // SINGULAR — no categories[]
  contactName: z.string().min(2).max(100),
  contactPhone: z.string().min(9).max(15).transform(v => v.replace(/\s/g, "")),
  contactEmail: z.string().email(),
});

// Response shape (NO estimatedReviewDays, NO status, NO submittedAt)
export interface SupplierRegisterResponse {
  ok: boolean;
  supplierId: string;
  message: string;
}
```

### #11 — Tipos reales cashflow (NO WeekBucket)

```ts
// Estos YA existen en lib/finance/cashflow-rolling.ts — IMPORTAR, no redefinir
export interface WeekRow {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  ingresos: number;
  egresos: number;
  fiadosAbonados: number;
  netFlow: number;
}

export interface CashflowRollingResult {
  tenantId: string;
  generatedAt: string;
  weeks: WeekRow[];
  totals: { ingresos: number; egresos: number; netFlow: number };
  warnings: string[];
}
```

---

## Errores tipados por endpoint

| Endpoint | 400 | 401 | 403 | 404 | 409 | 429 | 503 |
|----------|-----|-----|-----|-----|-----|-----|-----|
| POST `/api/marketplace/coupons` | Zod issues | sin auth | rol insuficiente | storeId no pertenece al tenant | code duplicado en tenant | — | db error |
| GET `/api/finance/cashflow-rolling` | weeks fuera de rango | sin auth | rol distinto admin/cajero | — | — | — | error calculo |
| GET `/api/recetas/[id]/cost-breakdown` | id invalido (no cuid) | sin auth | — | receta no existe o tenant diff | — | — | db error |
| POST `/api/supplier/register` | Zod issues | — | — | — | RUC duplicado | **3 req/hora/IP** | db error |

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|-----------|
| Front importa tipos v1 y falla compilacion | ALTA | ALTO | Leer C1-C10 antes de tocar nada |
| Database-engineer migra columnas existentes | MEDIA | ALTO | Solo crear el indice compuesto — nada mas |
| Back duplica `supplier-signup.db.ts` | MEDIA | ALTO | El archivo ya existe |
| QA escribe tests con tipos v1 | ALTA | MEDIO | Usar tipos de este v2 |
| Indice CONCURRENTLY falla en Supabase pooler | BAJA | BAJO | Migracion debe correr con `DIRECT_URL` |

---

## Ruta por frente

| Frente | Tarea critica antes de empezar |
|--------|-------------------------------|
| back | Verificar `lib/db/coupons.db.ts` — importar `CouponsDB` existente, NO duplicar |
| front | Reemplazar `WeekBucket`→`WeekRow`, `businessName`→`razonSocial`, `categories[]`→`category` |
| database | SOLO migracion 001 del indice compuesto — NO crear modelos |
| qa | Fixtures: `razonSocial`, `category`, rate limit 3 (no 5), roles `[admin, cajero]` en cashflow |
