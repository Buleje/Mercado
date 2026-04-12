# TD-018 Execution Checklist — Float → Decimal(12,2) paso a paso

**Versión:** 1.0  
**Fecha:** 2026-04-09  
**Estrategia:** Opción B (Gradual por tabla)  
**Duración total:** ~15-20 horas (7 fases × 2-3 horas cada una)

---

## PRE-REQUISITOS GLOBALES

Antes de **cualquier ALTER**:

- [ ] DIRECT_URL confirmado y funcional
  ```bash
  psql "$DIRECT_URL" -c "SELECT version();"
  # Debe devolver PostgreSQL versionXX
  ```

- [ ] Backup manual tomado en Supabase (> 50 MB verificado)
  ```
  Supabase → Settings → Backups → Create Manual Backup
  Esperar confirmación de timestamp
  ```

- [ ] Rama `feature/td018-float-to-decimal` creada
  ```bash
  git checkout -b feature/td018-float-to-decimal
  git push origin feature/td018-float-to-decimal
  ```

- [ ] Script de verificación listo (`scripts/verify-td018-columns.ts`)
  ```typescript
  // Lista campos Float reales en producción vs schema.prisma
  // Genera report en docs/td018-column-inventory-2026-04-09.md
  ```

- [ ] Baseline SQL capturado (justo antes de cada ALTER)
  ```bash
  # Por cada tabla, ejecutar y guardar resultado:
  SELECT COUNT(*) as row_count, SUM(price) as sum_price FROM "Product";
  SELECT COUNT(*) as row_count, SUM(total) as sum_total FROM "SaleItem";
  # Etc. → docs/td018-baseline-2026-04-09.sql
  ```

- [ ] Feature flag `FF_TD018_MAINTENANCE` listo (opcional, para read-only)
  ```typescript
  // Si existe, avisar a usuarios: "DB en mantenimiento 06:00-06:30 UTC"
  ```

---

## FASE 1: Verificación de columnas + Prep SQL

**Duración:** 1.5 horas  
**Ejecutor:** database-engineer + migration-planner  
**Deliverable:** `docs/td018-column-inventory-2026-04-09.md` + script SQL

### Paso 1.1: Listar campos Float reales en BD

```bash
# Script: scripts/verify-td018-columns.ts
cd bodega-san-martin

npx ts-node scripts/verify-td018-columns.ts \
  --action=list-float-columns \
  --output=docs/td018-column-inventory-2026-04-09.md
```

**Verificación post-script:**
- [ ] Informe contiene 87 campos Float
- [ ] Agrupa por modelo (28 modelos totales)
- [ ] Marca campos que son **legítimamente Float** (GPS, ratings, etc.) y los excluye

### Paso 1.2: Generar SQL migration por tabla

```typescript
// scripts/generate-td018-sql.ts
// Genera ola 1: Product.sql, SaleItem.sql, Order.sql, etc.

npx ts-node scripts/generate-td018-sql.ts \
  --models=Product,SaleItem,Order,Invoice,Customer,CashierSession \
  --output-dir=docs/td018-migrations/
```

**Verificación post-generación:**
- [ ] Cada archivo .sql contiene ALTERs explícitos con USING cast
- [ ] Ejemplo esperado para Product:
  ```sql
  ALTER TABLE "Product" 
    ALTER COLUMN "price" TYPE DECIMAL(12,2) 
    USING (price::DECIMAL(12,2));
  
  ALTER TABLE "Product" 
    ALTER COLUMN "costPrice" TYPE DECIMAL(12,2)
    USING (costPrice::DECIMAL(12,2));
  ```
- [ ] 0 PRAGMA o comentarios SQL (clean)

### Paso 1.3: Validar syntax SQL

```bash
# Dry-run en staging (si existe) o local
cd bodega-san-martin

# Solo parse, sin ejecutar:
sqlparse --validate docs/td018-migrations/Product.sql
```

**Verificación:**
- [ ] 0 syntax errors

---

## FASE 2: Baseline capture (pre-ALTER)

**Duración:** 15 minutos  
**Ejecutor:** database-engineer  
**Deliverable:** `docs/td018-baseline-2026-04-09.sql`

**IMPORTANTE:** Hacer esto **justo antes** de Fase 3 (no 5h antes)

### Paso 2.1: Capturar SUM, COUNT, AVG de cada tabla

```bash
# Script: scripts/capture-td018-baseline.sh
# Ejecutar en terminal, guardará output en docs/

export DIRECT_URL="postgresql://..."
psql "$DIRECT_URL" << 'EOF' > docs/td018-baseline-2026-04-09.sql

-- PRODUCTO
SELECT 'Product' as table_name, COUNT(*) as row_count, SUM(COALESCE(price, 0)) as sum_price, AVG(COALESCE(price, 0)) as avg_price FROM "Product";

-- SALEITEMS
SELECT 'SaleItem', COUNT(*), SUM(COALESCE(price, 0)), AVG(COALESCE(price, 0)) FROM "SaleItem";

-- ORDERS
SELECT 'Order', COUNT(*), SUM(COALESCE(total, 0)), SUM(COALESCE(discountAmount, 0)), SUM(COALESCE(totalCogs, 0)) FROM "Order";

-- INVOICES
SELECT 'Invoice', COUNT(*), SUM(COALESCE(subtotal, 0)), SUM(COALESCE(igv, 0)), SUM(COALESCE(total, 0)) FROM "Invoice";

-- CUSTOMERS
SELECT 'Customer', COUNT(*), SUM(COALESCE(totalSpent, 0)), SUM(COALESCE(creditBalance, 0)) FROM "Customer";

-- CASHIER SESSIONS
SELECT 'CashierSession', COUNT(*), SUM(COALESCE(openingAmount, 0)), SUM(COALESCE(closingAmount, 0)) FROM "CashierSession";

EOF
```

**Verificación post-captura:**
- [ ] Archivo tiene 6+ líneas (1 por tabla crítica)
- [ ] Cada línea contiene: table_name, row_count, SUM (numéricos)
- [ ] Guardar timestamp exacto en `docs/td018-baseline-2026-04-09.md`:
  ```
  Baseline capturado: 2026-04-13 05:55 UTC
  Ventana de migración: 2026-04-13 06:00-06:30 UTC
  ```

---

## FASE 3: Ejecutar ALTERs tabla por tabla

**Duración:** 2-3 horas (6-7 tablas × 10 min cada una)  
**Ejecutor:** database-engineer  
**Deliverable:** SQL ejecutado, logs en `docs/td018-execution-log.md`

### Para CADA tabla en orden (Product → SaleItem → Order → Invoice → Customer → CashierSession → resto)

#### Tabla actual: `Product` (ejemplo)

**Paso 3.A: Avisar a usuarios**

- [ ] Activar feature flag `FF_TD018_MAINTENANCE = true` (si existe)
- [ ] Banner en UI: "Actualización de sistema en progreso (5 min)"
- [ ] Monitoreo de Sentry/logs activado

**Paso 3.B: Ejecutar ALTER**

```bash
# Via script bypass (NO via Prisma CLI)
export DIRECT_URL="postgresql://..."

psql "$DIRECT_URL" << 'EOF'
-- PRODUCT TABLE
BEGIN TRANSACTION;

  ALTER TABLE "Product" 
    ALTER COLUMN "price" TYPE DECIMAL(12,2) 
    USING (price::DECIMAL(12,2));

  ALTER TABLE "Product" 
    ALTER COLUMN "costPrice" TYPE DECIMAL(12,2)
    USING (costPrice::DECIMAL(12,2));

COMMIT;
EOF
```

**Verificación inmediata:**
- [ ] Comando retorna sin errores en < 30 segundos
- [ ] Guardar output en `docs/td018-execution-log.md`

**Paso 3.C: Validar datos post-ALTER**

```bash
# Comparar SUM vs baseline
psql "$DIRECT_URL" << 'EOF'

SELECT COUNT(*) as row_count, SUM(COALESCE(price, 0)) as sum_price FROM "Product";
-- Debe ser IDÉNTICO al baseline (mismo COUNT, mismo SUM)

-- Si no coinciden, ABORTAR INMEDIATAMENTE y restaurar backup
EOF
```

**Verificación post-validación:**
- [ ] COUNT(*) igual a baseline
- [ ] SUM(price) exactamente igual (centavo a centavo)
- [ ] 0 errores de tipo de dato en Postgres (verificar `\d "Product"`)
  ```bash
  psql "$DIRECT_URL" -c '\d "Product"'
  # Debe mostrar "price | numeric(12,2)" no "double precision"
  ```

**Paso 3.D: Desactivar feature flag + publicar**

- [ ] Desactivar `FF_TD018_MAINTENANCE`
- [ ] Remover banner de UI
- [ ] Publicación en log: `✅ Product migrado de Float a Decimal(12,2)`

#### Tabla siguiente: `SaleItem` (repetir Pasos 3.A-D)

**Esperar 24 horas entre tablas** para testing de smoke tests.

---

## FASE 4: Deploy TypeScript (schema + código)

**Duración:** 3-4 horas (1 sesión concentrada)  
**Ejecutor:** backend-platform-engineer  
**Deliverable:** Branch con schema + TS fixes + tests

### Paso 4.1: Actualizar schema.prisma

```prisma
// ANTES
model Product {
  price         Float
  costPrice     Float?
  ...
}

// DESPUÉS
model Product {
  price         Decimal @db.Decimal(12, 2)
  costPrice     Decimal? @db.Decimal(12, 2)
  ...
}
```

**Verificación:**
- [ ] Todos los 87 campos actualizados
- [ ] `npx prisma validate` sin errores
- [ ] `npx prisma format` limpio

### Paso 4.2: Actualizar tipos en lib/db/*.db.ts

```typescript
// Antes
export async function getProduct(id: string): Promise<DbProduct> {
  const p = await prisma.product.findUnique({ where: { id } });
  return {
    ...p,
    price: p.price,  // number
  };
}

// Después
export async function getProduct(id: string): Promise<DbProduct> {
  const p = await prisma.product.findUnique({ where: { id } });
  return {
    ...p,
    price: p.price.toFixed(2),  // string "19.99"
  };
}
```

**Verificación:**
- [ ] `npm run build` sin errores
- [ ] `npx tsc --noEmit` limpio
- [ ] 0 instancias de `\.price\s*\+` (operaciones matemáticas sin Decimal)

### Paso 4.3: Revisar JSON responses

```typescript
// Patrón: antes de NextResponse.json(), convertir a string

export async function GET() {
  const product = await db.product.get("123");
  return NextResponse.json({
    price: product.price.toFixed(2),  // "19.99", no Decimal object
    costPrice: product.costPrice?.toFixed(2) ?? null,
  });
}
```

**Verificación:**
- [ ] Grep: `grep -r "Decimal\|\.price\|\.total" app/api/ | grep -v toFixed` → debe retornar 0 matches
- [ ] Tests e2e validan que respuesta JSON es string, no [object Object]

### Paso 4.4: Actualizar tests unitarios

```typescript
// Test: operaciones con Decimal
import { Decimal } from "decimal.js";

test("calcular total de orden con Decimal", () => {
  const price = new Decimal("19.99");
  const quantity = 2;
  const total = price.times(quantity);
  expect(total.toFixed(2)).toBe("39.98");
});
```

**Verificación:**
- [ ] `npm run test` verde
- [ ] Coverage no baja

### Paso 4.5: Commit y push

```bash
git add prisma/schema.prisma lib/db/*.db.ts app/api/*.ts
git commit -m "feat(td018): migrar 87 campos Float → Decimal(12,2)

- Actualizar schema.prisma con @db.Decimal(12,2)
- Convertir respuestas JSON a .toFixed(2)
- Actualizar tipos en 22 DB classes
- Tests validados (suite completa verde)"

git push origin feature/td018-float-to-decimal
```

---

## FASE 5: Smoke tests (post-deploy)

**Duración:** 1 hora  
**Ejecutor:** QA + backend-engineer  
**Deliverable:** Test report con ✅ pases

### Paso 5.1: Deploy a staging

```bash
# Vercel preview deploy automático desde PR
# o manual: npm run deploy:staging
```

### Paso 5.2: Ejecutar 5 smoke tests críticos

**Test 1: Crear producto y verificar precio**

```typescript
// Endpoint: POST /api/products
const res = await fetch("http://staging/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: "Arroz 1kg",
    price: "19.99",
    costPrice: "12.50",
  }),
});

const data = await res.json();
expect(data.price).toBe("19.99");  // string, no [object Object]
expect(typeof data.price).toBe("string");
```

**Test 2: Crear orden con 2 items**

```typescript
// POST /api/orders
const order = await fetch("http://staging/api/orders", {
  body: JSON.stringify({
    items: [
      { productId: "...", quantity: 1, unitPrice: "19.99" },
      { productId: "...", quantity: 1, unitPrice: "5.00" },
    ],
  }),
});

const data = await order.json();
expect(data.total).toBe("24.99");  // 19.99 + 5.00, exacto
expect(data.subtotal).toBe("24.99");
```

**Test 3: Generar factura (Invoice)**

```typescript
// POST /api/invoices
const invoice = await fetch("http://staging/api/invoices/generate", {
  body: JSON.stringify({ orderId: "..." }),
});

const data = await invoice.json();
const expected_igv = 24.99 * 0.18;  // Decimal cálculo
expect(parseFloat(data.igv)).toBeCloseTo(expected_igv, 2);
expect(parseFloat(data.total)).toBeCloseTo(24.99 + expected_igv, 2);
```

**Test 4: Cuadre de caja**

```typescript
// GET /api/cashier/session/{id}/balance
const session = await fetch("http://staging/api/cashier/session/...");
const data = await session.json();

// difference = closingAmount - (openingAmount + inflows - outflows)
const expected_diff = data.closingAmount - (data.openingAmount + data.totalSales - data.totalRefunds);
expect(parseFloat(data.difference)).toBeCloseTo(expected_diff, 2);
```

**Test 5: Checkout (end-to-end)**

```typescript
// 1. Cart con 2 items
// 2. Aplicar cupón (descuento)
// 3. Pagar (stripe webhook)
// 4. Verificar orden.total exacto = sum(items) - cupón
```

**Verificación post-tests:**
- [ ] Todos 5 tests pasan
- [ ] 0 JSON con [object Object]
- [ ] Cantidades y totales exactos (centavo a centavo)

### Paso 5.3: Monitoreo 4 horas en staging

- [ ] Sentry: 0 errors nuevos relacionados a Decimal
- [ ] Logs: 0 warnings de tipos
- [ ] Respuestas API: inspeccionar 10 random responses, verificar format

**Si falla algo:**
- [ ] Revert schema.prisma a Float
- [ ] Revert DB vía backup
- [ ] Crear issue detallando qué falló
- [ ] NO continuar a Fase 6 hasta fix

---

## FASE 6: Validación exhaustiva post-migración

**Duración:** 1.5 horas  
**Ejecutor:** database-engineer + business-analyst  
**Deliverable:** Reporte de validación `docs/td018-validation-report.md`

### Paso 6.1: Comparar baselines (antes vs después)

```bash
# Capturar baseline post-migración
export DIRECT_URL="postgresql://..."
psql "$DIRECT_URL" > docs/td018-baseline-post-2026-04-13.sql << 'EOF'
SELECT 'Product' as t, COUNT(*) as cnt, SUM(COALESCE(price, 0)) as sum FROM "Product";
... (6 tablas)
EOF

# Diff
diff docs/td018-baseline-2026-04-09.sql docs/td018-baseline-post-2026-04-13.sql
```

**Verificación:**
- [ ] 0 diferencias (COUNT y SUM son idénticos)
- [ ] Si hay diferencias, investigar:
  - ¿Había nuevas filas entre baseline y migración? (explicado)
  - ¿Cambio SUM sin cambio COUNT? (data loss → ABORTAR, restaurar backup)

### Paso 6.2: Validar tipos de datos en Postgres

```bash
psql "$DIRECT_URL" << 'EOF'
-- Verificar 87 columnas son ahora DECIMAL(12,2)
SELECT table_name, column_name, udt_name, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE (table_name = 'Product' AND column_name IN ('price', 'costPrice'))
   OR (table_name = 'Order' AND column_name IN ('total', 'discountAmount'))
   ... (rest 85 campos)
ORDER BY table_name;
-- Todas deben tener: udt_name = 'numeric', numeric_precision = 12, numeric_scale = 2
EOF
```

**Verificación:**
- [ ] 87 registros devueltos
- [ ] 87 con `numeric_precision = 12` y `numeric_scale = 2`

### Paso 6.3: Ejecutar queries comunes y validar formato

```bash
# Query 1: Total de ventas por día
psql "$DIRECT_URL" -c "
  SELECT DATE(createdAt) as day, SUM(total) as daily_total 
  FROM \"Order\" 
  GROUP BY DATE(createdAt)
  LIMIT 5;
"
# daily_total debe ser DECIMAL(12,2), no float con decimales raros

# Query 2: Facturación con IGV
psql "$DIRECT_URL" -c "
  SELECT subtotal, igv, total,
         (subtotal + igv) as calculated_total,
         CASE WHEN (subtotal + igv) = total THEN 'OK' ELSE 'MISMATCH' END
  FROM \"Invoice\"
  LIMIT 5;
"
# Todas las filas deben tener 'OK'
```

**Verificación:**
- [ ] Queries devuelven resultados en < 1 segundo
- [ ] 0 mismatches en Invoice (calculated = almacenado)

### Paso 6.4: Generar reporte final

```markdown
# TD-018 Validation Report

**Fecha:** 2026-04-13 10:30 UTC

## Resumen
- ✅ 87 campos migrados Float → Decimal(12,2)
- ✅ Baselines match (COUNT y SUM idénticos)
- ✅ 87 columnas verificadas en schema Postgres
- ✅ 5 smoke tests pasados
- ✅ 0 data loss

## Resultados por tabla
| Tabla | Campos | Rows | SUM antes | SUM después | Status |
|-------|--------|------|-----------|-------------|--------|
| Product | 2 | 450 | 45,000.50 | 45,000.50 | ✅ |
| SaleItem | 4 | 12,000 | 250,100.25 | 250,100.25 | ✅ |
| Order | 3 | 8,500 | 412,050.75 | 412,050.75 | ✅ |
| Invoice | 3 | 8,500 | 412,050.75 | 412,050.75 | ✅ |
| Customer | 3 | 650 | 98,500.00 | 98,500.00 | ✅ |
| CashierSession | 3 | 340 | 1,250,000.00 | 1,250,000.00 | ✅ |
| Resto (22 tablas) | 72 | ... | ... | ... | ✅ |

## Conclusión
**VALIDACIÓN EXITOSA** — TD-018 completado sin data loss ni discrepancias.

Próximo paso: Monitoreo 48h en producción.
```

---

## KILL-SWITCH (si algo sale mal)

**En cualquier momento durante Fases 3-5, si:**
- ALTER falla en > 60 segundos
- JSON respuestas muestran [object Object]
- Smoke tests fallan
- Data loss detectada

**Ejecutar inmediatamente:**

```bash
# PASO 1: Restaurar backup pre-migración
# Supabase UI → Backups → Restore (punto 5 min antes de ALTER)
# Esperar 10 min

# PASO 2: Revertir código (volver a main)
git checkout main
git pull origin main
npm install

# PASO 3: Redeploy
npm run build && npm run deploy:prod

# PASO 4: Verificar que app está up
curl https://bodega-san-martin.vercel.app/api/health

# PASO 5: Crear issue post-mortem
gh issue create \
  --title="TD-018 rollback ejecutado — investigar causa" \
  --body="[detalles de qué falló, logs, steps para reproducir]"
```

**Tiempo total de rollback:** ~15 minutos (10 min restore + 5 min redeploy)

---

## MONITOREO POST-MIGRACIÓN (48h después de deploy final)

**Quién:** DevOps + backend-engineer  
**Dónde:** Sentry, Vercel Logs, DB query logs

### Cada 4 horas:

- [ ] Sentry errors: buscar "Decimal", "toFixed", "type"
- [ ] Vercel: latencia endpoint API < 500ms (no degradación)
- [ ] DB: slow queries > 1s (buscar nuevo full-scans de Decimal)
- [ ] Usuarios: 0 reportes de "dinero desaparecido" o "factura rota"

### Al cierre (48h):

```markdown
## Post-Migration Monitoring Report

✅ 0 Sentry errors relacionados a Decimal
✅ 0 aumento de latencia API
✅ 0 slow queries nuevas
✅ 0 reportes de usuarios
**STATUS: 🟢 LISTO PARA CIERRE**
```

---

## Checklist de Cierre

- [ ] Todas las Fases completadas (1-6)
- [ ] Reporte de validación generado
- [ ] Monitoreo 48h pasado
- [ ] PR merged a main
- [ ] Tag git: `v-td018-float-decimal-complete-2026-04-13`
- [ ] Documentación actualizada (`TECH-DEBT.md`: marcar TD-018 como DONE ✅)
- [ ] ADR-018 cambiar estado a "Aceptada"
- [ ] Retrospectiva (opcional): ¿qué salió bien/mal?

---

## Dependencias / Bloqueantes

Antes de iniciar CUALQUIER fase:

- [ ] ADR-017 (índices) ✅ completado (hoy 2026-04-09)
- [ ] Zero schema drift en Postgres (Fase 1 verifica)
- [ ] DIRECT_URL funcional (Fase 1 verifica)
- [ ] Backup confimado > 50 MB
- [ ] Team consciente (Slack: "TD-018 iniciando...")

---

**Documento:** Checklist de ejecución TD-018  
**Versión:** 1.0  
**Generado:** 2026-04-09  
**Estado:** ⏳ Listo para fase 1

