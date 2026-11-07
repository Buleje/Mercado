# ADR-441 — Lote mixto: la pila escaneada vive en el servidor, se reparte por especie+permiso y la producción del día se vincula desde el mixto

- **Fecha:** 2026-09-26
- **Estado:** Aceptado (decisiones de Brandon del 26-09 incluidas)
- **Ámbito:** Libro CTP → Consumos (patio), lotes de aserrío, Producir sin lote / Declarar producción (ADR-429), vinculación día → lote (ADR-408).

## Contexto

Brandon (26-09): «en Consumos quiero activar la cámara para escanear el QR de las trozas creadas en Ingresos; se almacenarán en un lote mixto con varias especies; al terminar, de ese lote mixto se crearán lotes de especies individuales como se trabaja normalmente, y ya se podrán poner en producción. Y lo que salió del lote mixto se cubica pieza por pieza en "Producir sin lote" y luego se vincula a la producción oficial con lote».

Qué había (26-09):

| Pieza | Dónde | Límite |
|---|---|---|
| Armar lotes escaneando | `lib/forestal/lote-por-escaneo.ts` (`gruposDeLaPila`, `lotesQueAceptan`, `motivoFueraDeLaPila`), `CtpArmarLoteEscaneando.tsx` | La pila vive en el `localStorage` de UN equipo; crea los lotes de a uno, no todo-o-nada |
| Lotes de aserrío | `lib/db/forest-lote-aserrio.db.ts` (`agregarTrozas`, `consumirEnPatio`, `sumarACorrida`) | Una especie (L-A1) y un permiso (ADR-393) por lote |
| Consumos | `CtpConsumosView.tsx`, `CtpConsumosPatio.tsx`, `CtpConsumosPatioAccion.tsx` | «Consumir en un lote…» y cubicar lo aserrado (ADR-370) |
| Producir sin lote + Declarar | `CtpProducirSinLoteModal.tsx`, `lib/db/forest-ctp-sin-lote.db.ts` (ADR-429) | Crea una corrida POR ESPECIE con sus paquetes; no tiene origen |
| Vincular día → lote | ADR-408: `sumarACorrida` (:1421), `revisarVinculacion`, `repartirEnTanda`, `planDescontar` | Un lote y una pasada por corrida; `sumarACorrida` bloquea la corrida pero no las trozas, y marca las piezas en otra transacción |

Blas (26-09, sólo lectura): 84 trozas en el patio de 13 especies (14 grupos especie+permiso; Mashonaste en 2 permisos); las 38 etiquetadas son de guías SIN recibir y las 46 recibidas no tienen etiqueta → hoy se podrían escanear 0 trozas al mixto. 44 de 44 corridas sin origen; 31 corridas de «Producir sin lote» en 8 días (07 al 22/09).

## Decisión

### Modelo (aditivo)

```prisma
model ForestLoteMixto {
  id String @id @default(cuid())
  tenantId String
  code String            // LM-2026-001 (correlativo por negocio, advisory lock)
  status String @default("abierto")  // abierto | repartido | anulado
  notes String?
  contratoId String?
  abiertoEn DateTime @default(now())
  repartidoEn DateTime?
  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  trozas WoodEntryTroza[] @relation("TrozasDelMixto")
  lotes ForestLoteAserrio[] @relation("LotesDelMixto")
  @@index([tenantId, status])
  @@index([tenantId, code])
}
// WoodEntryTroza    + loteMixtoId String? (onDelete SetNull) + reservadaMixtoEn DateTime? + @@index([tenantId, loteMixtoId])
// ForestLoteAserrio + loteMixtoId String? (onDelete SetNull)  — de qué mixto salió cada lote hijo
```

Migración `prisma/migrations/20260927_lote_mixto_adr441/migration.sql` (sin `DO $$`; índice único parcial del código vivo `WHERE "deletedAt" IS NULL`), aplicada por `:5432` y registrada con `scripts/prisma-session.mjs migrate resolve --applied`.

### Reglas

- **LM1**: una troza está en un solo mixto (columna `loteMixtoId`).
- **LM2**: una troza está en el mixto O en un lote de aserrío, nunca en los dos. Al repartir se mueve en la misma transacción: `loteAserrioId` = lote hijo, `loteMixtoId` = NULL.
- **LM3**: apartar en el mixto sigue las reglas de un lote (`motivoNoElegible`: sin consumir, recibida, no descarte, no madre retrozada, no despachada) y bloquea las trozas `FOR UPDATE ORDER BY id`.
- **LM4**: una troza apartada en un mixto no entra a `agregarTrozas` ni a `consumirEnPatio`: «está en LM-…: repártelo».
- Apartar y repartir son movimientos del patio (como `agregarTrozas`): el cierre de mes no los frena. Vincular sí respeta cierre y congelado.
- Anular/rechazar/borrar un ingreso suelta la reserva de sus trozas.

### Decisiones de Brandon (26-09)

1. **Al vincular, se da por aserrada TODA la madera de esa especie** del mixto (y sus lotes hijos), con opción de destildar las trozas que no entraron.
2. **Vincular: sólo dueño o administrador** (`admin`, `owner`), como Declarar: cambia un asiento que se presenta ante SERFOR.
3. **El mixto puede ir a la sierra sin repartirse**: si al vincular sigue abierto, se reparte primero y después se vincula. Son **dos actos atómicos**, no uno: si la vinculación se rechaza (T3, mes cerrado, producido > trozas…), el mixto queda repartido en lotes hijos válidos y se puede reintentar la vinculación; no se pierde nada. `vincularCorridaEnTx` existe para poder componerlos en una sola transacción si más adelante hace falta (auditoría 26-09).

### Flujo

1. Consumos → Patio → «Lote mixto»: abre el mixto abierto o crea uno (LM-2026-00N).
2. Escanear con cámara o pistola (`EscanerTrozas`): cada lectura aparta la troza en el servidor (sin señal: cola del patio). Varios equipos y días suman al mismo mixto. Tarjetas por especie+permiso con PT (Oxapampa si está medida, si no ≈ aserrable), m³ y piezas.
3. «Terminar y repartir»: vista previa de los lotes; al confirmar, en UNA transacción, un lote por especie+permiso (o suma a uno abierto que lo acepte) y el mixto queda `repartido`.
4. Lotes normales: consumir, cargar sierra, cubicar lo aserrado — sin cambios.
5. Producir sin lote (ADR-429): cubicar lo que salió pieza por pieza, con especie.
6. Declarar: selector opcional «¿De qué lote mixto salió?» → abre el paso 7 armado.
7. «Vincular con el lote mixto» (también desde el día y desde la tarjeta del mixto): por cada corrida del día (una por especie) propone TODAS las trozas de esa especie libres en el mixto o sus lotes hijos (decisión 1); por fila: PT y m³ producidos, m³ de trozas, rendimiento y las 5 reglas de `revisarVinculacion`.
8. Firmar: cada corrida se vincula con UNO O MÁS lotes (Mashonaste: 2 lotes hijos, uno por permiso) vía `vincularCorrida`.

Controles al vincular: producido ≤ trozas (422, tolerancia 0,01 m³); tope 56 % (ADR-358) avisa y guarda el rendimiento real; I2 por guía (`setConsumos`, bloqueo de ingresos); T3 (la troza llegó antes de la corrida); mes cerrado y congelado bloquean; corrida con origen previo se rechaza (ADR-364/408); misma especie en lote y corrida; trozas destildadas quedan en su lote hijo como saldo.

### Contrato

- `lib/forestal/lote-mixto.ts` (puro): `EstadoLoteMixto`, `LoteMixto {id, code, status, trozaIds, lotes[], resumen}`, Zod `discriminatedUnion("accion")`: `agregar | quitar {trozaIds 1..500}`, `repartir {destinos?: Record<clave, loteId>, notas?}`, `anular {motivo ≥3}`; `RespuestaReserva {agregadas, rechazadas[{id,codigo,motivo}]}`; `RespuestaReparto {lotes[{clave, loteId, code, nuevo, piezas, m3}]}`.
- `GET/POST/PATCH /api/admin/forestal/lotes-mixtos` (admin, almacenero, owner; `anular` sólo admin/owner; guard de especialización como `lotes-aserrio/route.ts`).
- `PATCH /api/admin/forestal/lotes-aserrio` `accion:"vincular-corrida"` `{corridaId, partes:[{loteId, trozaIds}] 1..6, fecha?}` → `{piezas, volumenM3, volumenTotalM3, rendimientoPct, sobreElTope, lotesConsumidos[]}` (sólo admin/owner).
- `ForestLoteMixtoDB` (`lib/db/forest-lote-mixto.db.ts`): `list`, `crear`, `reservar`, `quitar`, `repartir` (una transacción), `anular`.
- `ForestLoteAserrioDB.crearEnTx(tx, …)`; `vincularCorrida` en `lib/db/forest-vincular-corrida.db.ts` (bloquea corrida y trozas `ORDER BY id`; escribe volumen, consumos vía `setConsumosEnTx` extraído de `forest-ctp-consumo.db.ts` sin cambiar reglas, y piezas, todo en una transacción).
- Pura `lib/forestal/vincular-desde-mixto.ts`: `planDelMixto` (propuesta por corrida con todas las trozas de su especie; modo 56 % como alternativa manual).
- Lecturas de la troza (`trozasDelPatio`, `trozasDe`, `buscarTrozas`) + `serializar()` de `trozas/route.ts` + `TrozaConsumible` traen `loteMixtoId`/`loteMixtoCode`.

## Alternativas descartadas

- **Flag `mixto` en `ForestLoteAserrio`**: rompe L-A1; 174 referencias en 11 archivos del servidor y 34 del cliente suponen una especie; consumir un mixto crearía una corrida multi-especie y el Cuadro Resumen por especie dejaría de armarse.
- **Sólo cliente (lo de antes)**: no pasa de la tablet a la oficina, no tiene código que el día pueda citar, no aparta las trozas.

## Consecuencias

- Migración aditiva: la versión de producción (vieja) ignora las columnas nuevas.
- `vincularCorrida` cierra una carrera que ya existía en `sumarACorrida` (dos vinculaciones simultáneas de la misma troza).
- Las 31 corridas viejas de Blas (07-22/09) chocan con T3 (trozas recibidas del 11 al 23/09): el mixto sirve para producción nueva, no para arreglar esas.
- Para usarlo en Blas hay que recibir las guías de las 38 trozas etiquetadas o etiquetar las 46 recibidas.
