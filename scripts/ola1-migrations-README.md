# Ola 1 — Scripts de migración TD-030/031/032

Scripts ejecutables para aplicar las 3 migraciones pendientes de la Ola 1.
Derivados del plan unificado `docs/migration-plan-ola1-2026-04-09.md` y
del ADR `docs/adr/020-ola1-migration-plan.md`.

**Fecha:** 2026-04-09
**Patrón base:** `scripts/apply-ola1-indices.ts` (pooler session mode :5432)
**Ámbito:** Los índices (TD-019/020/021) ya fueron aplicados; este lote cubre
solo los schema gaps pendientes.

---

## Archivos de este lote

| Archivo | TD | Qué hace |
|---|---|---|
| `apply-td030-loyalty-transaction.ts` | TD-030 | Crea tabla `LoyaltyTransaction` + 3 índices + backfill desde `Customer.loyaltyPoints` |
| `apply-td031-review-imageurls.ts`    | TD-031 | Añade `Review.imageUrls TEXT[] NOT NULL DEFAULT '{}'` |
| `apply-td032-coupon-storeid.ts`      | TD-032 | Añade `Coupon.storeId` + FK → Store + rebuild del unique constraint |
| `verify-ola1-migrations.ts`          | Cross  | Verificación unificada read-only de los 3 cambios |
| `ola1-migrations-README.md`          | Docs   | Este archivo |

---

## Orden recomendado de ejecución

| Paso | Script | Riesgo | Duración | Ventana | Motivo del orden |
|---|---|---|---|---|---|
| 1 | `apply-td031-review-imageurls.ts` | 🟢 Bajo  | ~2–5 min | Cualquier horario | Más simple; valida pipeline |
| 2 | `apply-td032-coupon-storeid.ts`   | 🟡 Medio | ~5–10 min | **Horario bajo** (02:00–06:00 UTC) | DROP del unique viejo toma ACCESS EXCLUSIVE 1–3 s |
| 3 | `apply-td030-loyalty-transaction.ts` | 🟡 Medio | ~15–30 min | Cualquier horario | Mayor complejidad + backfill; aislado si algo falla antes |

**Regla:** cada paso debe dejar la DB sana antes del siguiente. Verificar con
`verify-ola1-migrations.ts` tras cada ejecución.

---

## Cómo correrlos

Todos los scripts parsean `DATABASE_URL` de `.env.local` y fuerzan el puerto
5432 (pooler session mode), imprescindible para `CREATE INDEX CONCURRENTLY`.

### 1. Dry-run (default — no toca la DB)

```bash
cd bodega-san-martin

# Inspección por separado
npx tsx scripts/apply-td031-review-imageurls.ts
npx tsx scripts/apply-td032-coupon-storeid.ts
npx tsx scripts/apply-td030-loyalty-transaction.ts
```

Cada uno imprime el plan y termina sin conectarse a la DB.

### 2. Verificación previa (read-only)

```bash
npx tsx scripts/verify-ola1-migrations.ts
```

Reporta el estado actual de los 3 TDs. Antes de empezar, los 3 deberían
aparecer como faltantes.

### 3. Ejecución real

```bash
# Paso 1 — TD-031 (en cualquier horario)
npx tsx scripts/apply-td031-review-imageurls.ts --execute
npx tsx scripts/verify-ola1-migrations.ts        # confirmar TD-031 ✅

# Paso 2 — TD-032 (en horario bajo 02:00–06:00 UTC)
npx tsx scripts/apply-td032-coupon-storeid.ts --execute
npx tsx scripts/verify-ola1-migrations.ts        # confirmar TD-032 ✅

# Paso 3 — TD-030 (en cualquier horario)
npx tsx scripts/apply-td030-loyalty-transaction.ts --execute
npx tsx scripts/verify-ola1-migrations.ts        # confirmar TD-030 ✅
```

Todos los scripts son **idempotentes**: seguros de correr múltiples veces
(usan `IF NOT EXISTS`, `NOT EXISTS` checks en backfill, y detección de
constraints/índices pre-existentes).

---

## Detalles por script

### TD-031 — `apply-td031-review-imageurls.ts`

**SQL principal:**
```sql
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT '{}';
```

- Postgres 11+: `ADD COLUMN NOT NULL DEFAULT <constant>` es O(1), sin rewrite.
- Sin backfill (el default `'{}'` cubre todas las filas existentes).
- Validaciones: tipo correcto, 0 nulls.

### TD-032 — `apply-td032-coupon-storeid.ts`

**Pasos:**
1. Detecta versión de Postgres con `SHOW server_version_num`.
2. `ADD COLUMN "storeId" TEXT NULL`
3. `ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ... NOT VALID` + `VALIDATE CONSTRAINT` (sin lock exclusivo prolongado).
4. `CREATE INDEX CONCURRENTLY "idx_coupon_storeid"`
5. Rebuild del unique:
   - **Path A (pg 15+):** `ADD CONSTRAINT ... UNIQUE NULLS NOT DISTINCT ("tenantId","code","storeId")`
   - **Path B (pg <15):** 2 unique parciales — uno con `WHERE "storeId" IS NULL` y otro con `WHERE "storeId" IS NOT NULL`

**Decisión sobre la versión:** automática vía `SHOW server_version_num`.
Supabase corre Postgres 15+ desde 2023, así que en práctica se usará Path A.
Path B queda como fallback defensivo.

**Ventana de ejecución:** el DROP del viejo `Coupon_tenantId_code_key` toma
`ACCESS EXCLUSIVE` lock por 1–3 s. Correr en horario bajo para minimizar
impacto en writes concurrentes al admin de cupones.

### TD-030 — `apply-td030-loyalty-transaction.ts`

**Pasos:**
1. `CREATE TABLE IF NOT EXISTS "LoyaltyTransaction"` con FK a `Customer(phone)` ON DELETE CASCADE.
2. `CREATE INDEX CONCURRENTLY IF NOT EXISTS` x3:
   - `idx_loyaltytxn_tenant_createdat` (tenantId, createdAt DESC)
   - `idx_loyaltytxn_customer_createdat` (customerPhone, createdAt DESC)
   - `idx_loyaltytxn_tenant_reason` (tenantId, reason)
3. Backfill sintético: 1 fila `reason='legacy-backfill'` por cada `Customer` con `loyaltyPoints > 0`. Id determinístico `'legacy_' || substr(md5(phone||tenantId), 1, 20)` para re-runs estables. Filtrado con `NOT EXISTS` para idempotencia.
4. Validaciones:
   - Backfill cubre todos los clientes con puntos.
   - `SUM(amount)` por cliente == `Customer.loyaltyPoints`.
   - Sin `tenantId` nulls/empty.
   - 3/3 índices presentes.
   - Ningún índice INVALID.

**Nota sobre FK:** El modelo usa `customerPhone` (no `customerId`) porque
`Customer.phone` es el `@id` del modelo (ver `prisma/schema.prisma:163`).

---

## Rollback

Cada script tiene su rollback documentado en el header. En orden inverso:

### TD-030
```sql
DROP TABLE IF EXISTS "LoyaltyTransaction" CASCADE;
```
Zero data loss sobre `Customer.loyaltyPoints` (intacto).

### TD-031
```sql
ALTER TABLE "Review" DROP COLUMN IF EXISTS "imageUrls";
```
Si se rollback después de escribir imágenes reales, se pierden — mitigar con snapshot previo si preocupa.

### TD-032
```sql
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_tenant_code_store_unique";
DROP INDEX IF EXISTS "Coupon_tenant_code_pos_unique";
DROP INDEX IF EXISTS "Coupon_tenant_code_marketplace_unique";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_code_key" UNIQUE ("tenantId", "code");
DROP INDEX CONCURRENTLY IF EXISTS "idx_coupon_storeid";
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_storeId_fkey";
ALTER TABLE "Coupon" DROP COLUMN IF EXISTS "storeId";
```

### Rollback global (TD-030+031+032)
```sql
-- TD-032
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_tenant_code_store_unique";
DROP INDEX IF EXISTS "Coupon_tenant_code_pos_unique";
DROP INDEX IF EXISTS "Coupon_tenant_code_marketplace_unique";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_code_key" UNIQUE ("tenantId", "code");
DROP INDEX CONCURRENTLY IF EXISTS "idx_coupon_storeid";
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_storeId_fkey";
ALTER TABLE "Coupon" DROP COLUMN IF EXISTS "storeId";

-- TD-031
ALTER TABLE "Review" DROP COLUMN IF EXISTS "imageUrls";

-- TD-030
DROP TABLE IF EXISTS "LoyaltyTransaction" CASCADE;
```

---

## Post-migración (fuera del alcance de estos scripts)

Los scripts **solo aplican SQL**. Después, Brandon debe:

1. **Editar `prisma/schema.prisma`** con los 3 cambios:
   - Nuevo `model LoyaltyTransaction { ... }` + relación inversa en `Customer`
   - `imageUrls String[] @default([])` en `Review`
   - `storeId String?` + relación a `Store` + nuevo `@@unique([tenantId, code, storeId])` en `Coupon`
2. **Regenerar el cliente Prisma:**
   ```bash
   npx prisma validate
   npx prisma format
   npx prisma generate
   ```
   **NO correr `prisma migrate dev`** — los cambios ya están en DB; `migrate dev` intentaría re-crearlos y fallaría.
3. **Quitar comentarios `TECH-DEBT`** en:
   - `app/api/marketplace/loyalty/route.ts` (3 ubicaciones)
   - `app/api/marketplace/stores/[slug]/reviews/route.ts` (3 ubicaciones)
   - `app/api/marketplace/coupons/route.ts`, `.../coupons/validate/route.ts`, `app/api/superadmin/marketplace/coupons/route.ts` (5 ubicaciones)
4. **Reactivar la lógica**: GET historial de puntos, persistencia de `imageUrls`, filtros por `storeId` en queries de cupones.
5. **Tests + build:**
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run test
   npm run build
   ```
6. **Actualizar `docs/TECH-DEBT.md`** → marcar TD-030/031/032 como ✅ Cerrado.

---

## Gotchas Supabase/Prisma

1. **pgBouncer :6543 NO soporta `CREATE INDEX CONCURRENTLY`.** Los scripts fuerzan `:5432` (session mode) parseando `DATABASE_URL`.
2. **Prisma 7 `migrate dev` envuelve cada migración en una transacción.** `CONCURRENTLY` falla con `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. Nunca usar `migrate dev` para estas migraciones.
3. **`NULLS NOT DISTINCT` requiere Postgres 15+.** Los scripts lo detectan automáticamente y usan la alternativa con unique parciales si no está disponible.
4. **`Customer.phone` es el `@id`.** La FK de `LoyaltyTransaction` apunta a `phone`, no a un `customerId` ficticio.
5. **Pooler se desconecta en sesiones largas.** Si el backfill TD-030 se alarga, ejecutar en batches separados (el script actual usa un único INSERT — si se detectan timeouts, dividir el backfill en lotes con limit/offset y re-correr).

---

## Referencias

- `docs/migration-plan-ola1-2026-04-09.md` — plan unificado
- `docs/adr/020-ola1-migration-plan.md` — decisión arquitectónica
- `docs/adr/017-ola1-migrations-indices-strategy.md` — patrón original de CONCURRENTLY + pooler session
- `scripts/apply-ola1-indices.ts` — script de referencia (índices ya aplicados)
- `scripts/verify-pg-indexes-ola1.ts` — verificador de referencia (índices ya aplicados)
