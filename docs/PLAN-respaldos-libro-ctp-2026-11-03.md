# Plan — Respaldos del Libro CTP (ADR-530) · 2026-11-03

> Diseño de un ayudante `architect` (opus), medido en la base el 03-11. **Brandon eligió las partes 1 + 2 + 3** (no la 4 «copia semanal a la PC»).
> Pedido textual: «quiero función que permita tipo guardar un respaldo de todo de libro ctp todo, ingresos, consumos, lotes, salidas, producción todo en general y guardar eso en alguna pestaña para usar o tener eso de respaldo para cuando se elimine usar esa versión, eso impleméntalo bien».

## Lo que eligió

| # | Parte | Qué hace |
|---|---|---|
| 1 | Pestaña + guardar ahora + descargar | «Respaldos» junto a «Cierre del mes»: lista (fecha, quién, filas), botón Guardar, Descargar .json.gz |
| 2 | Comparar y recuperar lo borrado | Diff por corrida/ingreso/lote; recuperar sin pisar; meses cerrados bloqueados |
| 3 | Automáticos | Diario (si cambió) + antes de vaciar / anular día / cerrar mes; 30 diarios, 90 días los «antes de», 20 manuales |

**Fuera (decidido y explicado a Brandon):** «volver todo atrás» — borraría trabajo posterior, desharía guías ante SERFOR, rompería huellas de meses cerrados y es el patrón que vació el libro de main el 02-10 (memoria `ensayo-rollback-parcheado-vacio-main`).

## Hallazgos

- Hoy NO existe respaldo: `app/api/cron/auto-backup/route.ts` solo cuenta ventas del día.
- `ForestCtpDB.softDelete` (`forest-ctp.db.ts:4133`) suelta las trozas (`consumidaEnId`/`despachadaEnId` = null): quitar el `deletedAt` no alcanza.
- Consumo (`forest-ctp-consumo.db.ts:592`), despacho-origen (`forest-ctp-despacho.db.ts:510`) y reproceso (`forest-ctp-reproceso.db.ts:166`) se reescriben de verdad al editar, sin rastro.

## 1. Tablas del libro (orden de inserción, padres primero)

`WoodEntry` → `ForestLoteMixto` → `ForestLoteAserrio` → `ForestCtpEntry` → `WoodEntryTroza` (madres y luego retrozos: `trozaOrigenId` borra en cascada) → `ForestCtpPaquete` → `ForestCtpApartado` → `ForestCtpConsumo` → `ForestCtpDespachoOrigen` → `ForestCtpReproceso` → `ForestProdLote` → `ForestProdLoteMiembro` → satélites sin FK: `ForestCuentaMov` (con `ctpEntryId`), `CampoPersonalizadoValor` (por `registroId`), `ForestGuiaGuardada`.

- Baja lógica (`deletedAt`): WoodEntry, ForestCtpEntry (+`status=anulado`), ForestCtpPaquete, ForestLoteAserrio, ForestLoteMixto, ForestProdLote, ForestGuiaGuardada, ForestCuentaMov.
- Borrado real: troza, consumo, despacho-origen, reproceso, apartado, miembro.
- Fuera del respaldo: `ForestCtpComplianceSnapshot` (cálculo), `ForestGtf` (Libro TH), `ProduccionLote` y `GuiaRemision` (parecen de bodega, sin verificar).

Caminos que borran hoy: `ForestCtpPurgaDB.vaciar` (`forest-ctp-purga.db.ts:604`, todo en `:649`, por `POST /api/admin/forestal/ctp-purga`) · `ForestCtpAnularDiaDB.anular` (`forest-ctp-anular-dia.db.ts:180`) · `ForestCtpDB.softDelete` (`:4133`) · `ForestCtpDB.anularLineaEn` (`:2881`) · `WoodEntriesDB.softDelete` (`wood-entries.db.ts:6968`) · `ForestLoteAserrioDB.softDelete` (`:3174`) · `ForestLoteMixtoDB.anular` (`:757`) · `ForestLoteDB.softDelete` (`:807`, borra de verdad sus miembros en `:534`).

## 2. Medido (filas · JSON · dados de baja)

| Tabla | Blas | main | QA forestal |
|---|---|---|---|
| WoodEntry + WoodEntryTroza | 14+71 · 91 kB · 0 | 9+34 · 50 kB · 6 | 14+26 · 43 kB · 13 |
| ForestCtpEntry + Paquete | 17+17 · 31 kB · 1 | 13+8 · 17 kB · 11 | 70+54 · 125 kB · 33 |
| Consumo + DespachoOrigen + Reproceso + Apartado | 12 · 4 kB | 7 · 2 kB | 21 · 7 kB |
| Lote aserrío + GuiaGuardada + CuentaMov(ctp) | 9+2+32 · 27 kB | 5+24+2 · 79 kB | 12+0+37 · 30 kB |
| **Total** | **174 ≈ 153 kB** | **102 ≈ 148 kB** | **234 ≈ 205 kB** |

LoteMixto, ProdLote y miembros: 0 filas en los tres. `CampoPersonalizadoValor` sin medir. Comprimido ≈ 25-35 kB por respaldo (estimado).

## 3. Dónde: tabla nueva `ForestCtpRespaldo` (no Documentos)

Documentos = archivo en bucket + ficha en otra tabla, borrable desde la carpeta, y comparar obliga a bajar todo. Tabla nueva: foto en la misma transacción `RepeatableRead`, listado solo cabecera (<1 kB), diff en servidor. 60 respaldos de Blas ≈ 2 MB.

SQL aditivo (`prisma/migrations/20261103a_ctp_respaldos_adr530`; skill `migrar-esquema`: `aplicar-migracion-sesion.mjs --ensayo` → aplicar → `migraciones-cruce.mjs --verificar` → `prisma-session.mjs migrate resolve --applied`):

```sql
CREATE TABLE "ForestCtpRespaldo" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "tipo" TEXT NOT NULL,           -- manual | diario | antes_vaciar | antes_anular_dia | antes_cierre
  "nota" TEXT, "conteos" JSONB NOT NULL, "huella" TEXT NOT NULL, "version" INT NOT NULL DEFAULT 1,
  "bytes" INT NOT NULL, "datos" BYTEA NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now());
CREATE INDEX "ForestCtpRespaldo_tenantId_createdAt_idx" ON "ForestCtpRespaldo"("tenantId","createdAt" DESC);
```

`datos` = gzip de `{version, columnas por tabla, tablas{...}}` (incluye filas dadas de baja). `huella` evita un diario idéntico al anterior.

## 4. Comparar y recuperar

**Comparar** (función pura `lib/forestal/ctp-respaldo-diff.ts`): por tabla y por id → borrada · dada de baja · cambiada (sin `updatedAt`) · nueva. La pantalla agrupa por corrida / ingreso / lote con PT, m³ y piezas.

**Recuperar lo borrado** (una transacción):
1. Candado de cierres con `listBajoCandado` (como `frenarSiHayCierre`, `forest-ctp-purga.db.ts:567`).
2. Fila en mes cerrado (`mesCerradoParaVaciar`, `lib/forestal/ctp-purga-plan.ts:159`) → bloqueada con motivo; nunca reabrir el mes (la huella `huellaDelLibroHasta` cambiaría).
3. Insertar con id original en el orden de §1, `createMany({skipDuplicates})`: no se pisa nada.
4. Referencias a otros módulos que ya no existen (proveedor, contrato, parte, titular) → null + aviso.
5. Hija sin padre (ni hoy ni en el respaldo) → se salta y se reporta.
6. Re-enganchar troza a su corrida solo si hoy está libre; si otra corrida la usó → esa corrida no se recupera: «la troza X ya entró en la corrida Y».
7. Deshacer baja (`deletedAt` → null, `status` → `registrado`) choca con el código único de lote aserrío entre vivos (ADR-396) → bloquear y avisar.
8. Recalcular saldos de las corridas recuperadas (`forest-ctp-saldo-corrida.ts`): si alguno queda negativo, se cancela todo.
9. `invalidarTodo(tenantId)` (`forest-ctp-purga.db.ts:450`) + `ForestCuentaDB.invalidar` + auditoría `ctp_respaldo_recuperar` con conteos.

Versiones: insertar solo columnas que existen hoy; columna obligatoria nueva sin default → bloquear.

## 5. Automáticos

Diario dentro del cron `auto-backup` existente (`0 2 * * *` = 21:00 Lima), se salta si la huella es igual. Antes de `vaciar`, `anular` (día) y `save` (cierre): si el respaldo falla, la acción no corre. Poda en el mismo cron: 30 diarios · «antes de» 90 días (mínimo los últimos 10) · manuales tope 20, nunca se podan solos.

## 6. Contrato

`lib/db/forest-ctp-respaldo.db.ts` (tenantId primero): `crear(tenantId, tipo, user, nota?)` · `listar(tenantId)` (sin `datos`; caché `forest-ctp-respaldo:<t>`) · `comparar(tenantId, id)` · `recuperar(tenantId, id, seleccion | "todo_lo_borrado", user, esperado)` · `descargar(tenantId, id)` · `podar(tenantId)`.

| Ruta | Roles |
|---|---|
| `GET /api/admin/forestal/ctp/respaldos` | admin, almacenero, owner |
| `POST /api/admin/forestal/ctp/respaldos` (`{nota?: ≤200}`) | admin, owner |
| `GET …/respaldos/[id]/comparar` | admin, owner |
| `POST …/respaldos/[id]/recuperar` (`{seleccion, esperado}`) | admin, owner |
| `GET …/respaldos/[id]/descargar` (.json.gz) | admin, owner |

`safeParse` con esquemas en `…/respaldos/esquemas.ts`; registrar las 5 en `lib/auth/roles-rutas-panel.ts:27`. Pestaña: `lib/admin/subvistas-modulos.ts:543` → `{ vista:"cumplimiento", key:"respaldos", label:"Respaldos", hint:"Fotos del libro y recuperar lo borrado" }`. UI: `components/admin/forestal/CtpRespaldosView.tsx` + modal de comparación con casillas. Modificar: `forest-ctp-purga.db.ts` (respaldo previo + exportar `invalidarTodo`), `forest-ctp-anular-dia.db.ts`, `forest-ctp-cierre.db.ts`, `app/api/cron/auto-backup/route.ts`, `prisma/schema.prisma`.

Tests `__tests__/ctp-respaldo-*.test.ts`: diff separa las 4 listas · orden FK (retrozos después de madres) · mes cerrado bloquea · troza usada por otra corrida bloquea · nunca pisa · columna nueva sin default bloquea · conteos cierran (respaldo = hoy + borradas − nuevas).

ADR-530 «Respaldos del Libro CTP: foto comprimida en la base y recuperar sin pisar» (skill `adr`).

## 7. Riesgos y prueba

Zona de peligro (`schema.prisma`, escritura masiva con cargos de aserrío) → `reviewer` y `security` en opus antes de guardar. Cifras declaradas a SERFOR de un mes cerrado no se mueven.
**QA solo en `inversiones-agroforestales-blas-sociedad-op-qa-ui`, nunca contra Blas ni con ensayos parcheados:** crear respaldo → vaciado parcial de consumos → comparar (salen los consumos) → recuperar (saldo del patio vuelve, en PT) → baja de corrida + reusar su troza + recuperar (bloquea con aviso) → cerrar mes + recuperar fila de ese mes (bloquea).

## Cómo construir (sesión nueva)

1. `database` (opus): modelo + SQL + migrar-esquema (aditivo) — primero, solo.
2. En una tanda, archivos disjuntos: `backend` (opus, effort high): DB class + diff + rutas + automáticos + tests · `frontend` (sonnet): pestaña + modal (leer `bsm-design-system`, TODO PAREJO ADR-489).
3. `reviewer` + `security` (opus) sobre recuperar. Prueba por el camino del usuario en QA (`qa-capturas`). ADR-530. Guardado con `git commit -F <msg> -- <archivos>` (hay 140+ archivos ajenos sin guardar: no mezclarlos).
