# Plan de Migración: Float → Decimal (TD-018)

**Fecha:** 2026-04-07  
**Estado:** Plan completado — Listo para ejecución (sesión dedicada)  
**Riesgo:** 🔴 CRÍTICO — Cambio destructivo de tipo de datos con reversión no trivial

---

## Resumen ejecutivo

Migrar **87 campos monetarios** de `Float` a `Decimal(12,2)` en 28 modelos de Prisma. Razón: Float IEEE 754 acumula errores de redondeo (15-17 dígitos de precisión) → discrepancias de centavos en auditorías, chargebacks, y conciliación de pagos. Este es el primer paso crítico en el Plan de Sprint TD-018/TD-019/TD-020 (Supabase Best Practices Audit 2026-04-06).

**Estimación realista:**
- Fase 1 (Preparación + Backup): **2-4 horas** (una sola sesión, antes de migración)
- Fase 2 (Migración SQL): **1 hora** (una sesión dedicada, ventana de mantenimiento)
- Fase 3 (Cambios TypeScript): **3-4 horas** (sesión posterior, en paralelo con validación DB)
- Fase 4 (Validación + rollback): **2-3 horas** (cierre y monitoreo)

**Total: 8-14 horas distribuidas en 3-4 sesiones**

---

## Inventario de campos monetarios a migrar

### Decisión sobre Decimal(N,M)

Investigación de precisión para soles peruanos (PEN):

| Escenario | Rango | Decimal recomendado |
|-----------|-------|---------------------|
| Mayorista bodega (precios unitarios hasta S/. 9.999.99) | 0.01 → 9,999.99 | `Decimal(7,2)` |
| Órdenes acumuladas (hasta S/. 999.999.99) | 0.01 → 999,999.99 | `Decimal(9,2)` |
| Reportes agregados (multi-orden, auditoría) | 0.01 → 99.999.999.99 | `Decimal(12,2)` ← **ELEGIDO** |
| Futura escalabilidad (marketplace nacional) | 0.01 → 9.999.999.999.99 | `Decimal(14,2)` (backup) |

**Decimal(12,2) selected:** Cubre soles peruanos hasta S/. 9.999.999.99 (casi 10 millones), con 2 decimales de precisión exacta. Escala a futuro marketplace sin re-migración. Interés en porcentajes y ratios usaremos `Decimal(5,4)` (rango 0-9.9999, 4 decimales).

---

## Campos críticos a migrar (resumen Tier 1)

| Modelo | Campos | Razón | Líneas |
|--------|--------|-------|--------|
| Product | price, costPrice | Base de cálculo para todas las órdenes | 79, 80 |
| Order | total, discountAmount, totalCogs | Cabecera de orden, impacta facturación | 229, 238, 239 |
| SaleItem | unitCost, total, amountPaid, change | Línea de venta, incluye vuelto (cash) | 524, 536, 539, 540 |
| Customer | totalSpent, creditBalance, creditLimit | Dinero acumulado, crucial para auditoría | 127, 134, 135 |
| Invoice | subtotal, igv, total | Requerimiento SUNAT (precisión exacta) | 2419, 2420, 2421 |
| CashierSession | openingAmount, closingAmount, difference | Cuadre de caja, diferencia crítica | 647, 648, 650 |

**Total campos a migrar:** 87 encontrados en 28 modelos.  
**Campos que NO migran (legítimamente Float):** GPS coordinates, distancia (KM), ratings 0-5, confidence 0-1, conversión factors.

---

## Estrategia de migración (5 fases)

### Fase 1: Preparación pre-migración (Sesión 1, 2-4 horas)

**Tareas principales:**

1. **Backup completo de DB producción**
   ```bash
   # Vía Supabase UI: Settings → Backups → Manual backup
   # Verificar tamaño > 50 MB
   ```

2. **Baseline de datos monetarios**  
   ```sql
   SELECT SUM(total), AVG(total) FROM "Order" WHERE total > 0;
   SELECT SUM(price) FROM "Product" WHERE price > 0;
   SELECT SUM(subtotal), SUM(igv), SUM(total) FROM "Invoice";
   ```
   Guardar en `docs/migration-float-to-decimal-baseline.sql`

3. **DIRECT_URL disponible**
   ```bash
   echo $DIRECT_URL | grep -q postgresql && echo "✅" || echo "❌"
   ```

4. **Crear script de bypass** (`scripts/apply-td018-migration.ts`)
   ```typescript
   import { prisma } from "../lib/prisma";
   import fs from "node:fs";
   
   const sql = fs.readFileSync("prisma/migrations/.../migration.sql", "utf8");
   const statements = sql.split(/;\s*$/m).map(s => s.trim()).filter(s => s.length > 0);
   
   for (const stmt of statements) {
     try {
       console.log(`[Applying] ${stmt.substring(0, 60)}...`);
       await prisma.$executeRawUnsafe(stmt);
     } catch (e: any) {
       if (!e.message.includes("already exists")) throw e;
     }
   }
   
   await prisma.$disconnect();
   ```

**Checklist Fase 1:**
- [ ] Backup completado y verificado
- [ ] Baseline SQL guardado
- [ ] DIRECT_URL configurado
- [ ] Script apply-td018 creado

---

### Fase 2: Migración SQL (Sesión 2, ~1 hora, ventana mantenimiento)

**Ejecución en ventana low-traffic (02:00-03:00 UTC):**

1. **Crear migración Prisma vacía**
   ```bash
   npx prisma migrate dev --create-only --name td018-float-to-decimal
   ```

2. **Editar migration.sql con casts explícitos**
   ```sql
   -- Patrón para CADA campo:
   ALTER TABLE "Product" 
     ALTER COLUMN "price" TYPE DECIMAL(12,2) 
     USING (price::DECIMAL(12,2));
   
   ALTER TABLE "Product" 
     ALTER COLUMN "costPrice" TYPE DECIMAL(12,2) 
     USING (costPrice::DECIMAL(12,2));
   
   -- Para nullable fields:
   ALTER TABLE "Order"
     ALTER COLUMN "discountAmount" TYPE DECIMAL(12,2)
     USING (discountAmount::DECIMAL(12,2));
   ```

3. **Aplicar SQL via workaround script** (porque pgbouncer cuelga Prisma CLI)
   ```bash
   node --env-file=.env.local --import tsx scripts/apply-td018-migration.ts
   ```

4. **Verificación post-SQL**
   ```sql
   SELECT COUNT(*) FROM "Product" WHERE price > 0;
   SELECT SUM(price) FROM "Product" WHERE price > 0;
   -- Comparar vs baseline (deben ser iguales, centavo a centavo)
   ```

**Checklist Fase 2:**
- [ ] Migration SQL creada con casts exactos
- [ ] Script ejecutado sin errores
- [ ] Datos verificados vs baseline (SUM iguales)
- [ ] Tipos confirmados en información_schema

---

### Fase 3: Cambios TypeScript (Sesión 3, 3-4 horas)

**Concepto:** Prisma 7 devuelve `Decimal` como objeto decimal.js, no número primitivo.

**Cambios en schema.prisma:**
```prisma
// ANTES
model Product {
  price Float
  costPrice Float?
}

// DESPUÉS
model Product {
  price Decimal @db.Decimal(12, 2)
  costPrice Decimal? @db.Decimal(12, 2)
}
```

**Cambios en TypeScript - Reglas clave:**

1. **`.toFixed(2)`** — Para UI/logs/respuestas JSON
   ```typescript
   const priceUI = product.price.toFixed(2);  // "19.99"
   ```

2. **`.toNumber()`** — Solo si es seguro (pequeños montos)
   ```typescript
   const asNumber = product.price.toNumber();  // Evitar si es posible
   ```

3. **JSON responses — Convertir antes de serializar**
   ```typescript
   return NextResponse.json({
     price: product.price.toFixed(2),  // "19.99" no [object object]
     total: order.total.toFixed(2),
   });
   ```

4. **Operaciones Decimal.js**
   ```typescript
   const p1 = new Decimal("19.99");
   const p2 = new Decimal("5.00");
   const total = p1.plus(p2);  // Decimal(24.99)
   ```

**Archivos clave a revisar:**
- `lib/db/*.db.ts` — Tipos `Db*` para Decimal
- `app/api/*/route.ts` — Convertir dinero a string antes de JSON
- `lib/calculations/*.ts` — Usar Decimal para operaciones
- `prisma/seed.ts` — Valores seeding: `price: "19.99"`
- `components/checkout/*` — Usar `.toFixed(2)` en render

**Checklist Fase 3:**
- [ ] schema.prisma actualizado (87 campos)
- [ ] `npx prisma generate` exitoso
- [ ] Tipos DB actualizados para Decimal
- [ ] API routes convertidas a `.toFixed(2)`
- [ ] `npm run build` verde (sin TS errors)
- [ ] `npm run test` verde

---

### Fase 4: Validación + Monitoreo (Sesión 4, 1-2 horas)

**Validación exhaustiva:**

```sql
-- Comparar sumas vs baseline (ambas deben coincidir exactamente)
SELECT SUM(price), AVG(price), COUNT(*) FROM "Product" WHERE price > 0;
SELECT SUM(total) FROM "Order" WHERE total > 0;
SELECT SUM(subtotal), SUM(igv), SUM(total) FROM "Invoice";
```

**Smoke tests post-deploy:**
- Crear una orden (checkout con pago)
- Generar factura (subtotal + IGV = total exacto)
- Cuadre de caja (apertura + ingresos - egresos = cierre, sin huérfanos)

**Plan de rollback (si falla):**
- Restaurar backup pre-migración de Supabase
- Revert schema.prisma a Float
- Redeploy aplicación

---

## Riesgos identificados

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| pgbouncer cuelga Prisma CLI | **ALTA (80%)** | Usar script bypass (workaround documetado) |
| Cálculo USING incorrecto en SQL | **MEDIA (40%)** | Testing en staging. Validar SUM post-migración. |
| TS compilation falla por tipos Decimal | **MEDIA (50%)** | Grep systemático de `.price`, `.total`, `.amount` |
| JSON incompatibility (Decimal no serializa) | **MEDIA (50%)** | Usar `.toFixed(2)` antes de JSON response |
| NULL handling en cálculos | **BAJA (30%)** | Decimal? es válido, validar antes de operaciones |
| Downtime durante Fase 2 > 1 hora | **BAJA (20%)** | ALTER es fast. Hacer en ventana 02:00 UTC. |

---

## Pre-requisitos finales

Antes de iniciar **Fase 2:**

- [ ] DIRECT_URL confirmado y funcional
- [ ] Backup tomado y tamaño verificado (> 50 MB)
- [ ] Baseline SQL ejecutado y guardado
- [ ] Script apply-td018-migration.ts creado
- [ ] Branch feature/td018-float-to-decimal creada
- [ ] Ventana mantenimiento 02:00-03:00 UTC confirmada

---

## Estimación por sesión

| Sesión | Fase | Duración | Deliverable |
|--------|------|----------|------------|
| 1 | Fase 1 | 2-4 horas | Backup + Baseline + Script |
| 2 | Fase 2 | ~1 hora | DB migrado Float→Decimal |
| 3 | Fase 3 | 3-4 horas | schema.prisma + TS fixes |
| 4 | Fase 4 | 1-2 horas | Validación + Monitoreo |

**Total: 7-11 horas en 4 sesiones**

---

## Decisión técnica final

**Decimal(12, 2)** para dinero, **Decimal(5, 4)** para porcentajes/tasas.

Justificación: Máximo PEN esperado S/. 9.999.999.99 cabe cómodamente. 2 decimales = precisión exacta de centavos. Escalable a marketplace nacional sin re-migración.

---

## Referencias

- TECH-DEBT.md (línea 44-52) — TD-018 + plan Sprint
- reference_prisma_pgbouncer_workaround.md — Bypass CLI
- [Prisma Decimal docs](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#decimal)
- [Decimal.js docs](https://mikemcl.github.io/decimal.js/)

---

**Próximos pasos post-TD-018:** TD-019 (FK indexes), TD-020 (compound indexes), TD-021 (userId index)

**Estado:** ✅ Plan completado 2026-04-07 · Listo para ejecución
