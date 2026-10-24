# ADR-139 — Cierre de período fiscal del Libro de Operaciones CTP

- **Estado:** Aceptado
- **Fecha:** 2026-07-18
- **Contexto:** ADR-124 (WoodEntry), ADR-127 (ForestCtpEntry), ADR-134/135 (invariantes I1–I5 + costeo/congelamiento), ADR-138 (importador LO-CTP).

## Contexto

El Libro de Operaciones CTP tiene ingresos, producción, despacho, saldos, cadena
de custodia (I1–I5), costeo on-read y congelamiento de costo **por corrida**
(`ForestCtpConsumo.congeladoAt`). Pero **no se puede CERRAR**: hasta hoy toda
línea es mutable sin límite de tiempo. Una auditoría con contexto fresco encontró
dos consecuencias directas:

1. **El acta es mutable a perpetuidad.** `ForestCtpDB.create/annul/softDelete`,
   `WoodEntriesDB.create/validate/annul/softDelete`, `setConsumos` y `setOrigenes`
   no chequean período. Peor: `annul()` no miraba `congeladoAt` — una línea con
   costo ya congelado se podía anular igual. Un libro fiscalizable cuyas líneas
   pasadas se editan sin fricción es lo primero que desconfía OSINFOR.
2. **Saldo mensual sin apertura.** `saldos()` filtra `entryDate` en ingresos Y en
   producción; un saldo de "mayo" ignora el stock heredado de abril. Un libro
   mensual que no arranca de un saldo de apertura no cuadra.

## Decisión

Introducir el **cierre de período fiscal por mes**. Cerrar un mes:

1. **Congela** el costo de las corridas del mes reusando
   `ForestCtpConsumoDB.congelarCosto` (irreversible, ya probado). Best-effort: una
   corrida sin factura o sin materia prima no aborta el cierre — el libro admite
   huecos, se reporta `corridasSinCostear`.
2. **Snapshotea** la existencia de cierre acumulada hasta fin de mes
   (`saldos({toDate})`), que pasa a ser la **existencia de apertura** del mes
   siguiente (continuidad rollforward — cierra el bug #2).
3. **Bloquea** el período: todo write cuya `entryDate` caiga en un mes cerrado y
   no reabierto es rechazado con `CtpInvariantError("PERIODO_CERRADO")` (cierra el
   bug #1). Guard `ForestCtpCierreDB.closedPeriodOf` en los 5 write-paths.
4. **Audita** el cierre (`ctp_periodo_cerrar`) y la reapertura (`ctp_periodo_reabrir`).

### Storage (sin migración)

KV global `PlatformSetting`, key `ctp-cierre:{tenantId}` → `CtpCierrePeriodo[]`
(mismo patrón que `ForestCtpFichaDB`/`rum-history`). La **inmutabilidad no la da el
storage** sino los guards en las DB classes — el KV solo dice qué meses están
cerrados. Si el módulo crece (varios CTP/tenant, foliado por período), promover a
tabla `ForestCtpPeriod` con `migration-planner`.

### Anti-ciclo

`ForestCtpCierreDB` expone solo `isClosedOn`/`closedPeriodOf` (booleano/lectura) +
persistencia; **no importa** `forest-ctp.db` ni la clase de error. Así las DB
classes de escritura la importan sin ciclo, y cada una tira su propio
`CtpInvariantError`. La **orquestación** del cierre (calcular saldos + congelar)
vive en el endpoint `/api/admin/forestal/ctp/cierre`, que compone
`ForestCtpDB.saldos` + `ForestCtpConsumoDB.congelarCosto` + `ForestCtpCierreDB.save`.

### Reversibilidad

**Reabrir** (owner, motivo obligatorio, auditado) marca el cierre `reabierto` para
que deje de bloquear — NO borra el cierre (queda en el historial) ni descongela
los costos (congelar es irreversible por ADR-134). Reabrir habilita ediciones, no
deshace el congelamiento.

## Invariante

**P1 · una línea con `entryDate` en un mes cerrado (no reabierto) es inmutable.**
Se aplica app-level en los 5 write-paths (crear/validar/anular/eliminar ingreso;
crear/anular/eliminar línea; reatribuir consumos; reatribuir orígenes). Como I1–I5,
es agregada y no expresable en un CHECK de Postgres.

## Consecuencias

- **+** El LO-CTP pasa de query viva a **libro cerrable, foliado e inmutable**; el
  COGS congelado se vuelve confiable; hay continuidad mes a mes.
- **+** Cero migración; reusa el freeze y `saldos()` existentes.
- **−** Un import/alta con fecha de un mes cerrado ahora falla (correcto: no se
  backdatea a un acta cerrada) — el operador reabre si necesita corregir.
- **−** El guard agrega 1 lectura KV por write (aceptable; no-op si nada cerrado).

## Roles

- **Cerrar:** `admin` / `owner` (gestión).
- **Reabrir:** `owner` (más sensible; motivo auditado).

## Rollforward — conciliación de período (2026-07-18)

El snapshot de cierre no es solo un registro: es la **existencia de apertura** del
período siguiente. `ForestCtpDB.conciliacionPeriodo(period)` compone
**apertura + movimientos = existencia final** por especie y por producto:

- **Apertura** = el cierre inmediatamente anterior a `from` (snapshot congelado,
  `fuenteApertura: "cierre"`); si no hay cierre previo, se calcula acumulada hasta
  el inicio (`"calculada"`); histórico sin `from` → `"sin_apertura"`.
- Cierra el bug de que `saldos()` con filtro de período ignoraba el stock heredado
  — un libro mensual que no arrancaba de una apertura no cuadraba ante OSINFOR.

Endpoint `GET ?conciliacion=1`; UI en la vista Saldos (tabla apertura → ingreso −
consumido → final). Verificado E2E: cerrar junio → conciliación de julio toma la
apertura del cierre de junio y `final = apertura + ingreso − consumido` cuadra.
