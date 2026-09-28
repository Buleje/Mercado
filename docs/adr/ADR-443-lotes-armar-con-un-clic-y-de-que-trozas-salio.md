# ADR-443 — Lotes: armar con un clic, estados coherentes y «de qué trozas salió»

- **Fecha:** 2026-09-27
- **Estado:** aceptado (implementado)
- **Pedido por:** Brandon (27-09), en la vista Lotes: «dame ideas para mejorar lotes… fáciles de leer». Eligió las cuatro: armar lotes con un clic, tarjetas fáciles de leer, arreglar 3 lotes mal marcados, saber de qué trozas salió cada producción.
- **Depende de:** ADR-334/393 (lote de aserrío: una especie, un permiso) · ADR-429 (producir sin lote) · ADR-432/434/435 (descontar madera, fecha de llegada, acomodar trozas) · ADR-441 (lote mixto, vincular en dos actos).

## Contexto (medido en Blas, tenant `cmpxiv6p4000bohvzwl6bnfpv`)

- 84 trozas en el patio (178,82 m³) y **0 dentro de un lote**; 5 lotes, todos Tornillo, sin trozas, importados como inventario.
- 3 de esos lotes figuraban `abierto` con su corrida ya declarada: se reabrieron sin querer el 12/09 desde el menú de lotes de Consumos (3 toques en 3,5 s; reabrir era un solo clic). Los 5 tenían la apertura (08/09) **posterior** al consumo (01/08): `crearInventario` y `sumarACorrida` fechaban la apertura con el día de la carga.
- **44 de 44** corridas vivas sin origen (sin consumos ni reprocesos). La pantalla decía 39: su filtro miraba el volumen de entrada y escondía las 5 del 01/08. Cinco vinculadores construidos, **0 usos**; «¿De qué lote mixto salió?» se ocultaba sin mixtos. «Producir sin lote» no escribe consumo.
- La vista: 602 palabras y 2,6 pantallas a 1280; 4,6 a 400 px; 5 botones sueltos arriba; jerga («Cupo amplio 25,6 %», «41,7 % de 56 %»).

## Decisión

1. **Propuesta de lotes** (`lib/forestal/propuesta-de-lotes.ts`, `lib/db/forest-lote-propuesta.db.ts`, `GET/POST …/lotes-aserrio/propuestas`, `CtpPropuestaLotes`): agrupa las trozas ELEGIBLES (regla existente `motivoNoElegible`) por especie + permiso y crea el lote por el mismo camino que «Armar lote» (`create` + `agregarTrozas`). El servidor recalcula la elegibilidad: los ids del navegador sólo acotan. Las trozas de guías sin recepcionar se cuentan aparte. Blas: 11 lotes posibles (46 trozas, 135,59 m³); 38 trozas esperan 2 guías.
2. **Tarjetas y vista**: una línea grande por lote («Quedan 3,75 m³ por aserrar» / «Rinde 42 % · bien»); jerga, nota, nombre científico y el tope del 56 % al ⓘ; arriba sólo «Armar lote» (lo demás en «Opciones»); filtros detrás de «Filtros». `CtpLotesView` 844 → ~255 líneas, `CtpLoteCard` 517 → 253 (partes a archivos). Medido: 602 → 335 palabras; 2,63 → 1,88 pantallas a 1280; 4,61 → 3,53 a 400 px (la meta de 2,5 en celular pide una lista compacta, pendiente).
3. **Coherencia de estados** (`lib/forestal/lote-aserrio-coherencia.ts`): la apertura nunca es posterior al consumo (`crearInventario`, `consumir`, `sumarACorrida`); `reabrir` rechaza los lotes de inventario (atados a su corrida sólo por `produccionEntryId`: cargarlos y producirlos la soltaba); `repararEstadosIncoherentes` idempotente, auditado (`ctp_lote_aserrio_reparar`), respeta mes cerrado. Aplicado: 5 lotes en Blas, 5 en `main`. El menú de Consumos pide confirmación para reabrir (tono de advertencia) y no ofrece reabrir lotes de inventario.
4. **De qué trozas salió** (`lib/forestal/vincular-trozas.ts`, `lib/db/forest-vincular-trozas.db.ts`, `…/ctp/vincular-trozas`, `CtpDeQueTrozasSalio`, `CtpSinOrigenBandeja`, `CtpRevisarVinculosModal`):
   - Al declarar, el bloque «¿De qué trozas salió?» propone trozas de la misma especie y permiso (lote abierto/mixto primero, después el patio), pre-marcadas hasta cubrir lo producido ÷ 0,56; la persona desmarca. **Dos actos**: declarar (endpoint de siempre, sin tocar el cobro) y después vincular. Si el segundo falla, la corrida queda declarada sin origen y se dice por qué.
   - Las ya declaradas: bandeja en Producción agrupada por motivo (lista · llegada posterior · fila de otra especie · guía sin recibir · apertura · sin trozas de la especie), con la regla verdadera de sin origen. **Nunca se vincula sin confirmación**.
   - `vincularTrozas`: una transacción, locks corrida → lotes → trozas (`ORDER BY id`), `crearEnTx` para las sueltas y `vincularCorridaEnTx` (T1, T3, I1/I2, mes cerrado). **Regla nueva: el permiso de la guía de la troza debe ser el de la corrida.** Leer: admin/almacenero/owner; vincular: sólo admin/owner.
   - Blas hoy: 0 listas (20 llegada posterior, 1 fila de otra especie, 1 guía sin recibir, 5 apertura, 17 sin trozas de su especie/permiso). Se destraban corrigiendo Ingresos (fecha de llegada, acomodar trozas).

## Consecuencias

- Vincular cambia el consumo, el rendimiento y el saldo del permiso. Blas **no tiene meses cerrados**: conviene cerrar agosto antes de vincular en masa.
- Cada vínculo hace ~40 consultas (~7,5 s desde la PC de desarrollo).
- Se quitaron de Producción los chips «sin origen» y «en tanda» y `CtpMixtoDelAsiento`: la bandeja y el bloque nuevo los reemplazan (elegir a mano sigue dentro de «Revisar y vincular»; el lote mixto es una opción del bloque).

## Alternativas descartadas

- **Declarar y vincular en una sola transacción:** mezcla el camino de la plata (cobro de aserrío) con el del consumo.
- **Auto-vincular por especie:** es una declaración ante SERFOR; sin confirmación humana fabrica la trazabilidad que el libro debe probar.
- **Guardar el estado del lote en la pantalla:** el arreglo va en la DB class para que ningún camino vuelva a dejar un lote abierto con corrida.

## Referencias

Tests: `__tests__/forestal-propuesta-de-lotes.test.ts`, `forestal-lote-propuesta-db.test.ts`, `forestal-vincular-trozas{,-route,-db}.test.ts`, `forestal-de-que-trozas-salio.test.tsx`, y los de `lote-aserrio-coherencia`. Memorias: `produccion-sin-origen-44-de-44`, `blas-tenant-id-exacto`.
