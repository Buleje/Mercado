# ADR-303 — Cierre de campaña del acopio de cacao (acta inmutable)

- **Estado:** Aceptado
- **Fecha:** 2026-07-18
- **Contexto:** ADR-128 (acopio+beneficio), ADR-302 (estado de cuenta del productor). Espeja **ADR-139** (cierre forestal del CTP).

## Contexto

El acopio de cacao registra lotes, beneficios, ventas y ajustes, pero `inventory()`
**recomputa el stock en vivo** y **cualquier edición retroactiva altera el histórico
en silencio** — inaceptable para banco, comprador o auditoría. No había cierre de
período, acta inmutable ni lock: editar un lote de un mes pasado cambiaba números ya
reportados. Es el mismo gap que el forestal tenía antes de ADR-139.

## Decisión

Traer el cierre fiscal del CTP al cacao (patrón directo).

1. **Cerrar un mes** (admin/owner): congela el acta (KPIs del mes: lotes, kg
   acopiado, ventas, mermas) y snapshotea la **existencia de cierre acumulada**
   (`stockKg = acopio − ventas − mermas` hasta fin de mes) = apertura del mes
   siguiente.
2. **Bloquea el período**: `createLote`, `createVenta`, `createAjuste` y
   `annulLote`/`annulVenta` rechazan operar sobre `fecha` dentro de un mes cerrado
   (guard `CacaoCierreDB.closedPeriodOf`). El route mapea el error a **422**.
3. **Reabrir** (owner, motivo auditado): deja de bloquear; no borra el acta.

### Storage (sin migración)

KV `PlatformSetting` key `cacao-cierre:{tenantId}` → `CacaoCierrePeriodo[]` (patrón
ADR-302 / ForestCtpFicha). `CacaoCierreDB` (list/isClosedOn/closedPeriodOf/save/
reabrir). `CacaoDB.movimientosPeriodo(range)` computa el snapshot (acumulado con
`{to}`) y el acta del mes (con `{from,to}`). Auditado vía `logActivity`
(`cacao_periodo_cerrar`/`cacao_periodo_reabrir`).

### Anti-ciclo

`CacaoCierreDB` expone solo lecturas + persistencia; NO importa `cacao.db` → cacao.db
la importa sin ciclo. Snapshot orquestado en el endpoint.

## Consecuencias

- **+** El acopio pasa de agregado recomputable a **libro cerrable e inmutable** con
  números firmados por campaña — apto para banco/comprador/auditoría.
- **+** Cimiento para P&L (COGS lote-matched) y EUDR (dossier), que valen más
  snapshoteados al cierre.
- **+** Cero migración (KV).
- **−** El guard agrega 1 lectura KV por write (no-op si nada cerrado).

## Verificación

Server E2E (harness node): cerrar junio 2026 → snapshot real (stock 1930 kg = acopio
2430 − ventas 500; mes: 6 lotes/1950 kg); crear un lote fechado en junio → **422 "El
período junio de 2026 está cerrado"**. Tests: 6/6 de los helpers de bloqueo. UI:
sub-tab «Cierre» en el grupo Gestión (cerrar mes + campañas cerradas con acta +
reabrir).

## Follow-up

Rollforward visible (apertura→final en el Resumen, como el forestal), P&L con COGS
lote-matched (requiere resolver el `CacaoVenta.loteId` single/lossy), y dossier EUDR
real (polígono de parcela + gating de riesgo).
