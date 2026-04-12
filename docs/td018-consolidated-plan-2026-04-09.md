# TD-018 Plan Consolidado — Ejecutable con SQL listo

**Fecha:** 2026-04-09
**Rama:** `feature/td018-float-to-decimal`
**Estado:** Listo para ejecutar Fase 2 bajo confirmación explícita de Brandon
**Autor:** Consolidación de 3 Agent Teams + baseline real de producción

---

## 1. Números consolidados

| Métrica | Plan original | Realidad 2026-04-09 | Fuente |
|---|---|---|---|
| Campos Float en schema | 87 estimados | **114 reales** | grep `Float` |
| Campos MONETARIO a migrar | 87 | **76** (11 ya en Decimal) | `docs/td018-inventory-2026-04-09.md` |
| Campos GPS/COORD (no migrar) | — | **12** | inventory |
| Campos RATIO/SCORE (no migrar) | — | **26** | inventory |
| Archivos TS a tocar | 22 | **22** confirmados | `docs/td018-db-classes-impact.md` |
| Filas con datos reales en prod | Desconocido | **~178** (84+82+12) | `docs/td018-baseline-2026-04-09T06-23-57-255Z.json` |
| Ventana de mantenimiento estimada | 1 hora | **<2 minutos** | cruce inventory × baseline |
| Modelos con schema drift | — | **4** (Invoice, CashierSession, SaleItem.total, SaleItem.amountPaid) | baseline |

## 2. Estrategia elegida — Opción B Gradual (ADR-018)

1. **Sesión A — Preparación (hoy, ya hecho ✅):** baseline real, branch, agent team, docs
2. **Sesión B — SQL en staging:** aplicar los 76 `ALTER COLUMN TYPE` contra Supabase vía pooler session mode (mismo patrón ADR-017). Verificar con baseline comparativo.
3. **Sesión C — Fase TS:** actualizar schema.prisma + regenerar cliente + fix de 22 archivos `lib/db/*.db.ts` + centralizar `toNum()` en `lib/decimal-utils.ts`
4. **Sesión D — Gate final:** `npm run lint + tsc + test + build`, smoke test manual, merge de feature branch a master

Descartadas: Opción A Big Bang (innecesario con <200 filas), Opción C Dual-write (scope creep para 76 campos).

## 3. Top 5 modelos de mayor riesgo (para monitorear post-migración)

| # | Modelo | Campos | Por qué |
|---|---|---|---|
| 1 | `Order` | 4 (total, couponDiscount, discountAmount, totalCogs) | Tabla más consultada + idempotency keys activos |
| 2 | `Product` | 2 (price, costPrice) | Base de cálculo de todas las órdenes — 84 filas reales |
| 3 | `SunatInvoice` | 3 (subtotal, igv, total) | SUNAT exige precisión exacta, multa por discrepancia — **verificar si la tabla existe en prod** |
| 4 | `CreditProfile` + `CreditInstallment` | 7 combinados | Motor BNPL — errores de redondeo rompen cronograma de cuotas |
| 5 | `Sale.change` | 1 (vuelto de caja) | Cuadre de caja — 1 centavo dispara alerta de fraude |

## 4. Gotchas a vigilar durante la ejecución

| # | Gotcha | Mitigación |
|---|---|---|
| 1 | `@default(0.0)` en schema → Prisma lo normaliza a `@default(0)` post-generate | `prisma format` después de editar schema |
| 2 | `Sale.change` debe redondear half-up (no truncar) | PostgreSQL `USING col::DECIMAL(12,2)` usa ROUND_HALF_UP por default ✓ |
| 3 | `SalesAnomaly.expected/actual` es polimórfico (revenue vs orders vs units) | Código UI debe usar `.toFixed(0)` para enteros no monetarios |
| 4 | 4 nombres distintos del helper: `toNum`, `dec`, `toDecimalNum`, `toNum(unknown)` | Centralizar en `lib/decimal-utils.ts` durante Fase TS |
| 5 | 4 archivos necesitan refactor estructural (no solo `toNum()`): `recetas`, `prestamos`, `orders`, `credit` | Fase TS debe incluir revisión manual de esos 4 |

## 5. Archivos entregables de los 3 Agent Teams (Fase 1)

| Archivo | Líneas | Propósito | Agente |
|---|---|---|---|
| `docs/td018-inventory-2026-04-09.md` | 188 | Tabla maestra 114 campos clasificados | database-engineer |
| `docs/td018-baseline-queries.sql` | 449 | 37 SELECT + 4 verificaciones integridad cruzada | database-engineer |
| `docs/td018-alter-statements.sql` | 468 | 76 ALTER TABLE en 15 grupos ordenados por riesgo | database-engineer |
| `docs/td018-db-classes-impact.md` | 245 | Mapeo 22 archivos + patrón toNum | backend-platform-engineer |
| `docs/adr/018-td018-float-to-decimal-strategy.md` | 325+ | Decisión arquitectural (Opción B) | migration-planner |
| `docs/td018-execution-checklist.md` | 649 | Checklist paso a paso de ejecución | migration-planner |
| `scripts/td018-baseline.ts` | 180 | Script de baseline read-only | yo (Claude) |
| `docs/td018-baseline-2026-04-09T06-23-57-255Z.json` | — | Snapshot de datos reales en prod | ejecución del script |

**Total: 2504+ líneas de análisis y SQL listo para copiar.**

## 6. Lo que falta antes de ejecutar Fase 2

| # | Tarea | Quién |
|---|---|---|
| 1 | **Confirmación explícita de Brandon** — "sí, ejecuta los 76 ALTER contra prod" | Brandon (destructivo irreversible) |
| 2 | Crear `lib/decimal-utils.ts` con el helper canónico | Claude (antes de Fase TS) |
| 3 | Opcional: aplicar los ALTER primero en un branch de staging de Supabase si existe | Brandon si tiene staging |
| 4 | Feature flag `td018-migration-in-progress` para bloquear writes durante la ventana | Claude al ejecutar Fase 2 |

## 7. Plan de rollback (si algo falla)

1. **Pre-Fase 2:** backup manual de Supabase (Settings → Backups → Manual)
2. **Durante Fase 2:** si un `ALTER` falla, parar. Los anteriores quedan aplicados pero son reversibles individualmente.
3. **Post-Fase 2 si JSON rompe:** desplegar hotfix que aplique `.toFixed(2)` en los endpoints afectados. No se revierte el SQL.
4. **Catástrofe:** restaurar backup (15 min SLO). Revertir branch `feature/td018-float-to-decimal`. `git push -f` a origin (requiere confirmación de Brandon).

## 8. Criterios de éxito

- [ ] `scripts/td018-baseline.ts` post-migración devuelve valores idénticos centavo a centavo
- [ ] `npx tsc --noEmit` — 0 errores
- [ ] `npx eslint` — 0 errores
- [ ] `npm run test` — 2172+ verdes (sin regresión)
- [ ] `npm run build` — verde
- [ ] 3 smoke tests manuales: crear orden → aplicar cupón → cerrar caja del día
- [ ] ADR-018 cambia estado de "Propuesta" a "Aceptada"

---

## 9. Decodificador de "siguiente turno"

| Brandon escribe | Claude ejecuta |
|---|---|
| `sí` / `ejecuta` / `dale` | Fase 2 SQL: aplicar los 76 ALTER contra prod vía `scripts/apply-td018-alters.ts` (a crear), ejecutar baseline post, verificar integridad |
| `solo staging` | Buscar si hay proyecto de staging en Supabase, aplicar allí primero |
| `paso a paso` | Aplicar 1 grupo de ALTER (empezar por tablas vacías), verificar, reportar, esperar siguiente confirmación |
| `no` | Parar aquí, dejar el plan listo para otra sesión |
