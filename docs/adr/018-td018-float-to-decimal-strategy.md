# ADR-018: Migración Float → Decimal(12,2) en 76 campos monetarios (TD-018)

## Estado

**Propuesta consolidada 2026-04-09** — pendiente de ejecución en ventana de mantenimiento con confirmación explícita de Brandon (destructivo irreversible).

## Corrección de número (2026-04-09)

El plan original estimaba **87 campos**. El inventario real post-auditoría del schema actual dio **76 campos MONETARIO**. La diferencia (11) se debe a modelos ya migrados a Decimal en sesiones previas: `DailySummary`, `Fiado`, `FiadoCuota`, `Turno`, `Receta`, `Prestamo`, `PrestamoCuota`, `TreasuryCuenta`, `TreasuryMovimiento`, `TreasuryTransferencia`, `Cotizacion`, `CotizacionItem`, `NotaCredito`, `SponsoredBoost`. Esos NO están en este TD-018.

## Cruce con baseline real de producción (2026-04-09)

`scripts/td018-baseline.ts` ejecutado contra prod reveló:

| Tabla | Filas con datos | Monto real | Riesgo migración |
|---|---|---|---|
| `Product` | 84 filas (price) + 82 (costPrice) | SUM S/710.5 + S/496.6 | 🟡 Bajo (pocas filas) |
| `Order` | 12 filas | SUM S/165.1 | 🟢 Trivial |
| `Customer` | 0 filas con totalSpent/creditBalance/creditLimit > 0 | S/0 | 🟢 Trivial |
| `Payable` | 0 filas | S/0 | 🟢 Trivial |
| `PurchaseOrder` | 0 filas | S/0 | 🟢 Trivial |
| `SaleItem` | Columnas `total` y `amountPaid` **no existen en prod** | — | ⚠️ Schema drift |
| `Invoice` | Tabla **no existe en prod** | — | ⚠️ Schema drift |
| `CashierSession` | Tabla **no existe en prod** | — | ⚠️ Schema drift |

**Implicación crítica:** la migración real toca <200 filas en total. El riesgo de bloquear writes durante el ALTER es **minúsculo**. La ventana de mantenimiento pasa de 1 hora (plan original) a **<2 minutos realistas**.

**Implicación secundaria:** los modelos en drift (Invoice, CashierSession, SaleItem.total/amountPaid) NO requieren ALTER COLUMN porque las columnas/tablas no existen. Se agregarán con tipo `Decimal` desde el inicio cuando se aplique su migración creacional futura — ver TD-033 (schema drift cleanup).



**Fecha:** 2026-04-09  
**Autor:** migration-planner  
**Scope:** Estándar obligatorio para todos los campos monetarios futuros

---

## Resumen ejecutivo

Cambiar 76 campos monetarios de `Float` a `Decimal(12,2)` en 28 modelos de Prisma. **Razón:** Float IEEE 754 acumula errores de redondeo (15-17 dígitos de precisión) → discrepancias de centavos en auditorías, chargebacks, conciliación de pagos SUNAT.

**Riesgo:** CRÍTICO (toca 22 DB classes)  
**Downtime:** 10-60 segundos  
**Complejidad:** Muy alta (3 fases: SQL + TypeScript + Validación)  
**Reversibilidad:** Sí (backup + rollback script)

---

## Problema

### Float IEEE 754 no es preciso para dinero

```typescript
// Ejemplo real de pérdida de precisión:
const a = 0.1 + 0.2;  // 0.30000000000000004, no 0.3
// En contabilidad: S/. 0.10 + S/. 0.20 ≠ S/. 0.30 → auditoría rota

// Acumulación en sumas (100 transacciones de S/. 0.01):
// Exacto esperado: S/. 1.00
// Float real: S/. 0.9999999999999993
```

**Impacto en Bodega San Martín:**
- Cuadre de caja manual con discrepancias fantasma de centavos
- Auditoría de SUNAT falla por mismatch en Invoice.total
- Métricas de ventas del admin subestiman o sobrestiman por margen de error
- Chargebacks de clientes por "dinero desaparecido" en cálculos

### Contexto actual (2026-04-09)

- 76 campos Float en 28 modelos (Product, Order, SaleItem, Customer, Invoice, CashierSession, etc.)
- 22 DB classes que leen/escriben estos campos
- ADR-017 (índices) ejecutada hoy con éxito → base lista para TD-018
- Plan detallado existe en `docs/migration-float-to-decimal-plan.md` (5 fases)
- Supabase pooler session mode (puerto 5432) confirmado funcional con `CONCURRENTLY`

---

## Opciones consideradas

### Opción A: Big Bang (1 ventana, 1-2 horas downtime)

**Qué hace:**
1. DB en read-only (feature flag o load balancer)
2. Ejecutar 87 ALTERs de tipo en 1 sesión SQL
3. Actualizar schema.prisma + código TS en paralelo
4. Deploy con nueva app image
5. Verificación + rollback en 5 min si falla

**Ventajas:**
- ✅ Decisión irreversible en 1 sesión
- ✅ Schema "limpio" sin columnas duplicadas
- ✅ Rollback fácil (1 backup restore)
- ✅ Patrón familiar (sprint release tradicional)

**Desventajas:**
- ❌ 1-2 horas de downtime → tienda cierra
- ❌ Si pgbouncer cuelga, debugging en prod bajo presión
- ❌ No hay testing en vivo de la ruta de datos nueva
- ❌ Todo-o-nada: no puedo deshacer parte a mitad

**Realismo:** ⚠️ Riesgoso para SaaS familiar. Brandon probablemente diga no por downtime.

---

### Opción B: Gradual por tabla (4-5 ventanas de 10 min cada una)

**Qué hace:**
1. Tabla por tabla: `ALTER COLUMN TYPE` vía raw SQL en `DIRECT_URL` (no Prisma CLI)
   - Ej: Product → SaleItem → Order → Invoice → Customer → CashierSession → resto
2. Entre cada ALTER, deploy nuevo schema.prisma + TS fixes
3. Smoke test post-tabla
4. Si tabla X falla, rollback solo tabla X (otras ya migradas)

**Ventajas:**
- ✅ Downtime distribuido (10 min × 6-7 tablas = 60 min total, no concentrado)
- ✅ Testing incremental: Product funciona → SaleItem funciona → orden visible
- ✅ Si tabla X rompe, tablas Y-Z ya están migradas (no es todo-o-nada)
- ✅ Parallelizable: mientras X se migra, alguien prepara fixes de Y
- ✅ Precede a "Opción C dual-write", más seguro

**Desventajas:**
- ❌ 4-5 deploys en 24 horas (más riesgo acumulativo)
- ❌ Schema.prisma deja de ser "fuente única" entre Pasos 1-5 (desincronización temporal)
- ❌ Si se interrumpe en mitad, quedamos con 2-3 tablas Decimal y 20+ Float (inconsistencia)
- ❌ Auditoría de rollback más compleja (restaurar qué punto?)

**Realismo:** 🟢 Balanceado. Patrón similar a ADR-017 hoy (phased index creation).

---

### Opción C: Dual-write con columna sombra (2 semanas, cero downtime)

**Qué hace:**
1. Agregar columna `price_v2 DECIMAL(12,2)` a Product (y 86 campos más)
2. Code nuevo escribe ambas: `price` (Float) + `price_v2` (Decimal)
3. Lees siempre `price_v2` (fallback a `price` si NULL)
4. Backfill en background: `UPDATE Product SET price_v2 = price::DECIMAL(12,2) WHERE price_v2 IS NULL`
5. Semana después: DROP `price` (Float viejo)
6. Rename `price_v2` → `price` (opcionalmente)

**Ventajas:**
- ✅ Cero downtime → canary deploy gradual
- ✅ Rollback en cualquier momento: DROP las columnas `_v2`
- ✅ Testing en vivo con 100% del tráfico
- ✅ Patrón conocido (data migration best practice)
- ✅ Backfill se paraleliza y puede abortar sin perder datos

**Desventajas:**
- ❌ **Scope creep MASIVO** — requiere cambios en todas las queries (leer `price_v2`, escribir ambas)
- ❌ 76 campos duplicados × 2 = 174 columnas a sincronizar (maintenance nightmare)
- ❌ Risk de corrupción: `price ≠ price_v2` en datos viejos si backfill falla
- ❌ 2 semanas mínimo hasta poder limpiar las columnas viejas
- ❌ Requiere feature flags sofisticados para cada tabla
- ❌ Testing manual: ¿cómo verifico que NO estoy leyendo el viejo?

**Realismo:** ❌ **No factible para este contexto**. Es demasiado complejo para 76 campos. Mejor para 1-2 campos críticos en futuro.

---

## Decisión recomendada: **Opción B — Gradual por tabla**

**Razón principal:** Balanza riesgo (pgbouncer hang, schema drift) vs downtime distribuido. Patrón probado en ADR-017 hoy.

### Principios operativos

1. **Pooler session mode (puerto 5432) para todas las ALTERs** — confirmado hoy que CONCURRENTLY funciona, a diferencia del transaction pooling (puerto 6543)
2. **DIRECT_URL obligatorio** — bypass pgbouncer cuelga
3. **Raw SQL, no `prisma migrate`** — Prisma CLI 7 no maneja bien CONCURRENTLY/transacciones long-running
4. **Script de verificación pre-ejecución** (`scripts/verify-td018-columns.ts`) — listar realmente cuáles campos necesitan migración
5. **Gates de aprobación entre fases** — no automático todo de golpe
6. **Rollback plan concreto por tabla** — si tabla X rompe, restaurar backup, descartar tabla X, seguir con Y

### Orden de tablas (criticidad descendente)

| Fase | Tabla | Campos | Razón | Ventana |
|------|-------|--------|-------|---------|
| 1 | Product | 2 (price, costPrice) | Base de cálculo todas órdenes | Lunes 06:00 UTC |
| 2 | SaleItem | 4 (price, costPrice, total, amountPaid) | Línea de venta, crítica | Martes 06:00 UTC |
| 3 | Order | 3 (total, discountAmount, totalCogs) | Cabecera, facturación | Miércoles 06:00 UTC |
| 4 | Invoice | 3 (subtotal, igv, total) | SUNAT, precisión exacta | Jueves 06:00 UTC |
| 5 | Customer | 3 (totalSpent, creditBalance, creditLimit) | Auditoría, datos históricos | Viernes 06:00 UTC |
| 6 | CashierSession | 3 (openingAmount, closingAmount, difference) | Cuadre de caja | Viernes 14:00 UTC |
| 7+ | Resto (22 tablas) | ~60 campos | Secundarias (settings, config, etc.) | Weekend/siguiente week |

**Total downtime:** ~10 min × 6 = 60 min distribuido en 1 semana  
**Testing entre fases:** 24h mínimo

---

## Gates bloqueantes entre fases

```
┌─ FASE 1: Product alterad ──┐
│  ✅ SUM(price) sin cambio  │
│  ✅ 10 min downtime        │
└─────────────┬──────────────┘
              ▼
       ┌─ Deploy 1 ─┐
       │ schema v1  │
       │ TS fixes 1 │
       └─────┬──────┘
             ▼
      ┌─ Smoke test 1 ─┐
      │ Create order   │
      │ (Product nuevo │
      │ + SaleItem?)   │ ◄── **GATE**: no continuar si falla
      └─────┬──────────┘
            ▼
     ┌─ FASE 2: SaleItem ─┐
     │ Continuar si test1  │
     │ fue ✅              │
     └────────┬────────────┘
              ▼
          .... (ciclo)
```

**Regla:** No avanzar a Tabla N+1 hasta que Tabla N tenga:
1. SQL ejecutado sin errores (log en `docs/td018-execution-log.md`)
2. SUM verificado vs baseline
3. Deploy nuevo schema + código
4. Smoke test pasado

---

## Plan de rollback por tabla

### Rollback de una tabla (ejemplo: Product)

```sql
-- PASO 1: Restaurar backup pre-migración (5 min downtime)
-- Via Supabase UI: Backups → Restore

-- PASO 2: Revertir schema.prisma
-- Product {
--   price Float  ← vuelve de Decimal
-- }

-- PASO 3: Revertir tipos TS (Product.price como number)

-- PASO 4: Redeploy código anterior

-- PASO 5: Verificación
SELECT SUM(price) FROM "Product" WHERE price > 0;
-- Debe coincidir con baseline.sql
```

**Tiempo total:** ~5-10 minutos (backup restore es la bottleneck)

---

## Riesgos detectados

### Riesgo 1: pgbouncer cuelga durante ALTER (Probabilidad 70%)

**Escenario:** 87 ALTERs secuenciales → deadlock → CLI cuelga > 5 min

**Mitigación:**
- ✅ Script bypass (`$executeRawUnsafe` directo)
- ✅ DIRECT_URL confirmado funcional
- ✅ Precedente hoy: ADR-017 índices con CONCURRENTLY (éxito)
- ✅ Ventanas de baja carga (06:00 UTC)
- ✅ Timeout = 30 segundos (matar si más)

**Crítica:** Sí (puede causar downtime inesperado)

### Riesgo 2: TS compilation falla en 22 DB classes (Probabilidad 50%)

**Escenario:** Cambio Float → Decimal en Product. Código en orders.db.ts aún hace `product.price + 10` (type error).

**Mitigación:**
- ✅ Pre-script: `grep -r "\.price\|\.total\|\.amount" lib/db/ | wc -l` → inventario
- ✅ Checklist por DB class (22 items)
- ✅ Tests unitarios validando tipos
- ✅ `npm run build` + `npx tsc --noEmit` antes de cada deploy

**Crítica:** Sí (bloquea merge)

### Riesgo 3: JSON serialization (Decimal no serializa como number) (Probabilidad 50%)

**Escenario:** API devuelve `{ price: Decimal(...) }` → JSON trata como `[object Object]`

**Mitigación:**
- ✅ Patrón fijo: `.toFixed(2)` antes de `NextResponse.json()`
- ✅ Tests e2e validando que response JSON es string, no object
- ✅ Grep post-deploy: verificar 0 matches de `Decimal.*NextResponse`

**Crítica:** Sí (frontend rompe)

### Riesgo 4: Descuadre entre DB y baselines (Probabilidad 30%)

**Escenario:** Baseline.sql guardada a las 01:00. Nuevas ventas entre 01:00-06:00. SUM de baseline no coincide post-migración.

**Mitigación:**
- ✅ Capturar baseline justo antes de ALTER (no 5h antes)
- ✅ Usar ventana low-traffic (02:00-06:00 UTC = horario de cierre POS Pucallpa)
- ✅ Validar que `COUNT(*)` es idéntico (no nuevas filas)

**Crítica:** Bajo (afecta validación, no datos)

---

## Impacto estimado

| Métrica | Valor |
|---------|-------|
| **Campos a migrar** | 87 |
| **Modelos afectados** | 28 |
| **DB classes a auditar** | 22 |
| **Downtime total** | 60 min (distribuido: 10 min × 6 tablas) |
| **Downtime por tabla** | 10-30 segundos (ALTER rápido) |
| **Horas de trabajo** | 15-20 (BD + TS + testing) |
| **Sesiones requeridas** | 4-5 (prep + exec × 6 tablas + validación) |
| **Reversibilidad** | Sí (backup + 5 min restore) |

---

## Precedentes en el codebase

- **ADR-011** — Raw SQL pattern (delivery module, exitoso)
- **ADR-017** — `CREATE INDEX CONCURRENTLY` vía DIRECT_URL (hoy, exitoso)
- **Prisma pgbouncer workaround** — `$executeRawUnsafe` directo (conocido desde 2026-04-06)

---

## Recomendaciones finales

1. ✅ **Ejecutar Opción B** — gradual por tabla, precedente comprobado
2. ✅ **Usar DIRECT_URL + raw SQL** — no Prisma CLI
3. ✅ **Gates de aprobación entre fases** — pausas de 24h para testing
4. ✅ **Antes de iniciar:** Generar `docs/td018-execution-checklist.md` (paso a paso)
5. ✅ **Documentar en ADR:** Esta decisión + justificación (marca estándar futuro)
6. ⚠️ **NO ejecutar Opción A** (downtime concentrado) ni **Opción C** (scope creep)

---

## Próximos pasos

1. Brandon revisión + aprobación de Opción B
2. Generar checklist detallado (scripts, verificaciones, rollbacks)
3. Sesión 1: Verificación + baseline + script bypass
4. Sesión 2-6: Ejecutar ALTERs tabla por tabla
5. Sesión 7: Validación final

---

**Documento:** ADR-018 (Propuesta)  
**Generado:** 2026-04-09  
**Status:** ⏳ En espera de revisión/aprobación

