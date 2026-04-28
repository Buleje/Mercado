# Schema Drift — ProductAnalytics — ✅ RESUELTO 2026-04-28

**Estado:** RESUELTO via Supabase MCP `apply_migration`
**Migration name:** `add_productanalytics_clicks_updatedat`

## Cambios aplicados a la DB

```sql
ALTER TABLE "ProductAnalytics" ADD COLUMN "clicks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductAnalytics" ADD COLUMN "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProductAnalytics" RENAME COLUMN "addToCart" TO "addsToCart";
ALTER TABLE "ProductAnalytics" RENAME COLUMN "purchases" TO "conversions";
ALTER TABLE "ProductAnalytics" DROP COLUMN "conversionRate";
ALTER TABLE "ProductAnalytics" ADD CONSTRAINT "ProductAnalytics_productId_date_tenantId_key" UNIQUE ("productId", "date", "tenantId");
CREATE INDEX "ProductAnalytics_tenantId_idx" ...
CREATE INDEX "ProductAnalytics_productId_idx" ...
CREATE INDEX "ProductAnalytics_tenantId_date_idx" ...
```

## Verificación

- `lib/db/product-analytics.db.ts` simplificado (sin lógica defensiva).
- `prisma.productAnalytics.upsert({ where: { productId_date_tenantId } })` funciona end-to-end.
- Smoke test: `POST /api/marketplace/analytics/track-batch` → 200 con `{ok:true, persisted:2, failed:0}`.
- Datos persistidos verificados en DB con todas las columnas pobladas.

---

## Histórico (contexto original — pre-fix)

**Detectado:** 2026-04-28
**Severidad:** Media (no bloquea runtime, sí limita features)

## Síntoma

`prisma.productAnalytics.upsert()` y queries similares fallan en producción con:

```
PrismaClientKnownRequestError: The column `clicks` does not exist in the current database.
PrismaClientKnownRequestError: The column `addsToCart` does not exist in the current database.
PrismaClientKnownRequestError: The column `conversions` does not exist in the current database.
PrismaClientKnownRequestError: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

## Diagnóstico

La tabla `ProductAnalytics` en la DB de Buleje (Supabase) tiene un schema **anterior** al declarado en `prisma/schema.prisma:3191`. Faltan al menos:

| Campo declarado en schema | Existe en DB? |
|---|---|
| `id` | ✅ |
| `productId` | ✅ |
| `tenantId` | ✅ |
| `date` | ✅ |
| `views` | ✅ |
| `clicks` | ❌ |
| `addsToCart` | ❌ |
| `conversions` | ❌ |
| `revenue` | ❌ (probable) |
| `createdAt` | ✅ (probable) |
| `updatedAt` | ✅ (probable) |
| `UNIQUE (productId, date, tenantId)` | ❌ |

## Mitigación aplicada

`lib/db/product-analytics.db.ts` tiene **detección dinámica de columnas** + **fallback sin ON CONFLICT** cuando la UNIQUE no existe. El track NO falla — solo persiste lo que la DB acepta.

- Eventos `view`, `click`, `addToCart` colapsan a `views++`.
- Eventos `conversion` aún colapsan a `views++` hasta que existan las columnas.
- Sin pérdida visible para el usuario; el módulo `/admin/store-analytics` sigue mostrando empty state honesto cuando no hay datos.

## Solución definitiva

Aplicar la migración faltante con `DIRECT_URL` accesible:

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
```

Si `prisma migrate deploy` no detecta migraciones pendientes, generar una `prisma migrate dev --name fix_product_analytics_drift` que aplique:

```sql
ALTER TABLE "ProductAnalytics"
  ADD COLUMN IF NOT EXISTS "clicks" INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "addsToCart" INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "conversions" INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "ProductAnalytics"
  ADD CONSTRAINT "ProductAnalytics_productId_date_tenantId_key"
  UNIQUE ("productId", "date", "tenantId");

CREATE INDEX IF NOT EXISTS "ProductAnalytics_tenantId_idx" ON "ProductAnalytics"("tenantId");
CREATE INDEX IF NOT EXISTS "ProductAnalytics_productId_idx" ON "ProductAnalytics"("productId");
CREATE INDEX IF NOT EXISTS "ProductAnalytics_tenantId_date_idx" ON "ProductAnalytics"("tenantId","date");
```

Después de aplicar:

1. Quitar la lógica de `getAvailableColumns()` y `hasUniqueConstraint()` del archivo `lib/db/product-analytics.db.ts` (puede revertirse al `upsert` original con Prisma).
2. Verificar con: `curl -X POST .../api/marketplace/analytics/track-batch -d '{"events":[{"productId":1,"eventType":"conversion","revenue":1}]}'` — debería persistir conversions+revenue.
3. Borrar este archivo `SCHEMA-DRIFT.md`.

## Otros drifts posibles

Conviene auditar la DB de prod vs schema con:

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate diff \
  --from-url $DIRECT_URL \
  --to-schema-datamodel prisma/schema.prisma \
  --script > drift-report.sql
```

Eso lista todos los `CREATE/ALTER/DROP` que la DB necesita para alinearse al schema actual.
