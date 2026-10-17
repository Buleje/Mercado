# ADR-498 — ForestInspeccionPlanta: inspecciones del superadmin con el libro congelado

- **Estado:** aceptado (2026-10-17). Brandon aprobó crear la tabla en la base compartida: «Crear la tabla (Recomendado)».
- **Pedido por:** Brandon (17-10): «en superadmin administrar los negocios que son aserradero … para llevar el control, el pietaje, reportes de incoherencias de volumen … inspeccionar, cuántas trozas y aserrada tienen, y demás para la inspección de plantas y su control».
- **Contrato:** `.claude/autonomo/plantas-forestales/contrato.md` (fase 3) · tipos: `lib/superadmin/plantas-forestales/tipos.ts` (`InspeccionPlanta`, `InspeccionResumen`, `HallazgoInspeccion`, `ConteoAserrada`, `FotoDelLibro`) · Zod: `lib/superadmin/plantas-forestales/schemas.ts` (`crearInspeccionSchema`, `editarInspeccionSchema`).
- **Schema:** tabla nueva `ForestInspeccionPlanta` (migración `20261017_forest_inspeccion_planta`, aditiva, aplicada y registrada el 17-10).
- **DB class:** `lib/db/forest-inspeccion-planta.db.ts`.

## Contexto

El superadmin ya ve cada planta (fases 1-2: trozas, aserrada, movimiento, incoherencias), pero «inspeccionar» es ir a la planta, contar y dejar un acta firmada que diga qué se encontró. Eso necesita: quién inspeccionó, un estado (abierta mientras se cuenta, cerrada al firmar, anulada si se abrió por error), los hallazgos con su gravedad y m³, lo contado de la aserrada contra el libro y la foto del libro contra la que se contó.

`ForestPatioConteo` (ADR-440) ya guarda el conteo físico de trozas del patio, pero no tiene inspector, estado, hallazgos, aserrada ni foto del libro: es el acta del conteo de la planta, no de una inspección.

## Decisión

1. **Una tabla nueva** `ForestInspeccionPlanta`, con la convención de los `Forest*` vecinos: `tenantId` = la planta inspeccionada (no el superadmin), sin FK a `Tenant`, `updatedAt` con `@updatedAt`, un solo índice `(tenantId, fecha)` que sirve la lista por planta y la última por planta. Sin índice suelto por `estado` (toda lectura va por planta).
2. **El libro se congela al abrir** (`libro` = `FotoDelLibro`): el acta compara contra lo que el libro decía ese día, no contra el libro de hoy. Una inspección no recalcula nada: los números salen de las mismas funciones que la ficha de la planta.
3. **El conteo de trozas se guarda IGUAL que el de la planta** (`ForestPatioConteoDB.guardar`, idempotente por `iniciadoEn`): la planta lo ve en su historial de conteos. La inspección guarda `conteoPatioId` y una copia de su resumen en `trozas` (`esperadas, contadas, m3Esperado, m3Contado, faltantes, sobrantes`). Así la lista no relee el acta y el acta cerrada no cambia si la tablet re-sube el conteo después.
4. **Máquina de estados**: `abierta → cerrada → anulada` o `abierta → anulada`. Sólo «abierta» se edita o se cierra; anular vale desde abierta o cerrada (el acta firmada no se borra: queda anulada con `motivoAnulacion` y `anuladaAt`). La guardia va en el mismo `UPDATE … WHERE estado IN (…)`: si otra pestaña la cerró entre la lectura y la escritura, cuenta 0 y la DB class responde `InspeccionError` 409 con el estado de ahora. Editar una cerrada no guarda el conteo en el patio (la guardia corre antes).
5. **Red en la base**: dos CHECK que Prisma no declara (viven sólo en el `.sql`): `estado IN ('abierta','cerrada','anulada')` y `anulada ⇒ motivoAnulacion NOT NULL`.
6. **Los JSON se validan al leer** (`safeParse`): `hallazgos` y `aserrada` elemento por elemento con el mismo Zod de la ruta (lo roto se omite y se cuenta en `rotos`); `libro` por su forma de arriba; `trozas` entero. Una fila con estado ilegible se reporta en el log y la lista sigue; el detalle con el libro ilegible responde `InspeccionError` 500 (no inventa una foto).
7. **Auditoría en los dos lados**: la DB class anota `inspeccion.crear/editar/cerrar/anular` en el registro de actividad de la PLANTA (`logActivity`, entidad `ForestInspeccionPlanta`); la ruta anota lo suyo con `logSuperadminAction` (contrato).
8. **`ultimaPorPlanta(tenantIds[])`** es la única lectura que cruza negocios: una consulta `DISTINCT ON ("tenantId")` sin anuladas, para la lista de plantas. Caché 60 s; toda escritura la invalida.

## Consecuencias

- Agregar un campo a un hallazgo o a la aserrada es tocar el Zod de `schemas.ts`: sin migración.
- `tipos.ts` no declara `notas`, `motivoAnulacion` ni `anuladaAt`: la DB class devuelve `InspeccionDetalle = InspeccionPlanta & { notas, motivoAnulacion, anuladaAt, rotos }`. Cuando la pantalla los muestre, conviene subirlos a `InspeccionPlanta`.
- Si alguien cierra la inspección mientras otro sube un conteo, el acta del conteo queda en el patio de la planta (es un conteo real) y la edición responde 409.
- El borrado/export por negocio (Ley 29733) ve la tabla por `tenantId` como cualquier `Forest*`. Como los demás `Forest*`, no está en `TENANT_MODELS` (`lib/tenant.ts`): el aislamiento es el `tenantId` explícito en cada WHERE.
- Contract: no hay. Es una tabla nueva; volver atrás es dejar de leerla.

## Alternativas descartadas

- **Columnas nuevas en `ForestPatioConteo`** (inspector, estado, hallazgos…): mezcla el conteo diario de la planta con el acta del superadmin; la planta vería campos que no son suyos y su guardado idempotente pisaría el estado de la inspección.
- **`PlatformSetting` (clave-valor por planta)**: sin estado consultable, sin historial por planta y fuera del alcance del export/borrado por negocio.
- **Leer el libro en vivo en el acta**: el acta firmada cambiaría sola cada vez que la planta corrige su libro; lo que se inspeccionó dejaría de poder mostrarse.
- **Índice suelto por `estado`** (propuesta inicial): ninguna lectura busca por estado sin planta; violaba la regla del índice que empieza por `tenantId`.
