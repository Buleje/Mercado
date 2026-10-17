# ADR-436 — Etiquetas QR de las trozas del Libro CTP

- **Fecha:** 2026-09-26
- **Estado:** Aceptado · índice único aplicado el 2026-09-26 (ver Consecuencias)
- **Ámbito:** Libro CTP → Trozas: imprimir la etiqueta de cada pieza del patio, dejar constancia de que se imprimió y darle su código de planta si no lo tiene.
- **Contrato:** `lib/forestal/ctp-troza-etiquetas.ts` (formatos e impresión), `lib/forestal/ctp-troza-url.ts` (ruta corta), `lib/forestal/etiquetado-trozas.ts` (`planearEtiquetado`, `asignarCorrelativos`), `WoodEntriesDB.marcarEtiquetadas`, `POST /api/admin/forestal/trozas/etiquetas`, columnas `WoodEntryTroza.etiquetadaEn` / `etiquetasImpresas`, auditoría `ctp_trozas_etiquetadas`, migraciones `prisma/migrations/adr-436-etiquetas-de-trozas.sql` y `prisma/migrations/adr-436-codigo-planta-unico.sql`

## Contexto

El Libro de Títulos Habilitantes ya imprimía etiquetas con QR para sus árboles (`loth-labels.ts`); el Libro CTP —donde vive el código de planta, la marca que el centro pinta en cada palo— no. Para encontrar una troza en la pila había que buscarla a mano en la lista.

La primera versión (sólo cliente) armaba la etiqueta con `GET /api/admin/forestal/trozas/patio` y tenía dos huecos:

1. **No quedaba registro de que se imprimió.** El patio no podía decir qué palos ya llevaban su chapa, ni cuáles se reimprimieron.
2. **La pieza sin `codigoPlanta` salía con el código del bosque.** Medido el 26-09: en `main` 130 de 298 trozas sin código de planta; en Blas 7 de 84. Una etiqueta con el código del bosque no coincide con la marca pintada, que es lo que se busca en la pila.

Además, al medir: el índice único parcial `(tenantId, codigoPlanta)` que el schema daba por aplicado desde el ADR-336 **no existe en la base** (`pg_indexes` sólo tiene el btree no único). Lo bloquea un repetido en `main`: el código «118» está en dos piezas (Sapotillo libre, Tornillo consumida). Blas no tiene repetidos.

Brandon eligió (26-09): «ya etiquetada» + «etiqueta confiable» (número correlativo al imprimir).

## Decisión

1. **Qué lleva la etiqueta** (lado cliente, `ctp-troza-etiquetas.ts`): un QR a la ruta corta `/admin/q/<id>` (33×33 módulos en vez de 41×41: se lee de más lejos y con la etiqueta sucia; pide sesión, así que escanearla sin cuenta no expone datos) y un **código de barras Code128 del código de planta**, para lectores de pistola. Formatos: A4 de stickers 3×7, rollo térmico 50×30 y 100×50, y testa A6 para leer de lejos. Todo en negro.
2. **Qué pieza se etiqueta**: la misma regla que decide si se puede consumir (`motivoBloqueo`, T1). La consumida, despachada, no recepcionada, descarte, madre retrozada o sin volumen no está en el patio para pegarle un papel: vuelve en `omitidas` con el rótulo de `LABEL_BLOQUEO`. La pantalla y el servidor usan la misma función; un test lo compara.
3. **Sello de impresión**: `etiquetadaEn` (última impresión, NULL = nunca) y `etiquetasImpresas` (cuántas; >1 = reimpresión). Se sellan en **una** query para las N piezas. El sello es un dato operativo, no del libro: se pone aunque el mes esté cerrado.
4. **Correlativo al imprimir** (`asignarCodigo: true`): la pieza del patio sin código de planta recibe `MAX(código numérico del negocio) + 1`, el criterio de `siguienteCodigoPlanta` y `renumerarCodigosPlanta`. Los códigos no numéricos (`115-A`) se ignoran para el máximo. Reglas:
   - Bajo `pg_advisory_xact_lock` por negocio: sin él, dos tablets imprimiendo a la vez leerían el mismo MAX (y con el índice único puesto, la segunda tanda chocaría entera en vez de tomar el número siguiente).
   - El UPDATE lleva «sigue sin código» en el WHERE: si otra pantalla le puso uno mientras tanto, no se pisa.
   - **Mes cerrado**: el código de planta es un dato del libro, así que no se escribe. La pieza se etiqueta igual, con el código del bosque, y vuelve en `sinCodigoNuevo` con el motivo.
5. **La respuesta trae las piezas releídas** (`trozas`), ya con el código nuevo: se imprime con ésas, no con las que tenía la pantalla. `repetidos` lista los códigos impresos que también están en otra pieza del negocio, con todas sus piezas, para resolverlos en «Códigos repetidos».
6. **Auditoría** `ctp_trozas_etiquetadas`: cuántas se imprimieron y qué códigos nacieron. El código nuevo es la marca que se pinta: un fiscalizador tiene que poder ver cuándo apareció.

## Consecuencias

- **Número único garantizado por la base (2026-09-26, autorizado por Brandon).** El «118» repetido de `main` se resolvió renumerando la pieza que ya no está en el patio (Tornillo, consumida, GTF 001-0000201): `118 → 90100135`, por `POST /trozas/renumerar` —respeta cierre y queda en la auditoría—; la Sapotillo libre conserva el 118. Con 0 repetidos en todos los tenants se creó `WoodEntryTroza_tenant_codigoPlanta_unico`: `UNIQUE ("tenantId", upper(btrim("codigoPlanta"))) WHERE "codigoPlanta" IS NOT NULL AND btrim("codigoPlanta") <> ''`, con `CONCURRENTLY` por el pooler de sesión (`:5432`), `indisvalid = true`. La expresión es la del guard (`«13/a»` = `« 13/A »`); un índice sobre la columna cruda —el que planeaba el ADR-336— dejaba pasar lo que el guard rechaza.
- **Mira la tabla, no el estado del ingreso.** Una pieza de un ingreso anulado o borrado seguía ocupando su número (149 en `main`) — ver «Ingresos muertos sueltan su código» abajo. El guard (`guardCodigoPlantaUnico`) y el aviso previo (`codigosPlantaEnUso`) se alinearon: antes daban esos códigos por libres y el índice los habría rechazado sin decir cuál. Reusar el número de una pieza anulada exige renumerarla primero.
- **El choque con el índice es un 422, no un 500.** `create`, `actualizarRecepcion`, `agregarTrozas`, `renumerarCodigosPlanta` y `marcarEtiquetadas` encadenan `traducirChoqueCodigoPlanta`, que reconoce el índice por su nombre (llega como `P2002` desde `createMany` y como `P2010`/23505 desde un UPDATE crudo) y tira `CtpInvariantError("CODIGO_PLANTA_DUPLICADO")`. `agregarTrozas` era la única alta que no pasaba por el guard; ahora pasa.
- **Un GET ya no hace DDL.** `intentarCandadoCodigoPlanta` creaba el índice desde el request (con otro nombre y sin `upper/btrim`); se reemplazó por `estadoCandadoCodigoPlanta(tenantId)`, que sólo lee `pg_index.indisvalid` y los repetidos del negocio. Un entorno nuevo recibe el índice por la migración.
- **Correlativo de 8 cifras en `main`.** El tenant QA tiene un `codigoPlanta` numérico `90100120`, así que el correlativo sigue desde `90100121`. Es dato de prueba; en Blas el máximo numérico es 65 y el siguiente sería 66. Si un negocio real tiene un número fuera de escala, el correlativo lo sigue: corregirlo es renumerar esa pieza, no cambiar la regla.
- **Columnas nuevas y dev server.** Con el cliente de Prisma viejo en memoria, el POST devuelve 500 (`Unknown argument etiquetadaEn`) y el GET del patio no trae el sello, hasta reiniciar el servidor.
- Una pieza **sin volumen** no se etiqueta (T1 la bloquea). Si en el patio aparecen palos sin volumen que igual hay que marcar, la regla de etiquetado tiene que separarse de la de consumo: hoy son la misma a propósito.
- **Ingresos muertos sueltan su código (2026-09-26, revisión).** «Anula los ingresos y vuelve a cargarla» chocaba contra el índice: la hoja de SERFOR trae el mismo «Código Planta» y la troza anulada lo seguía ocupando, sin aparecer en «Códigos repetidos» (no es un repetido). Ahora `annul`, `reject` y `softDelete` ponen `codigoPlanta = NULL` en sus trozas DENTRO de la misma transacción, y dejan el renglón `ctp_troza_codigo_soltado` con el antes → después de cada pieza. No existe «restaurar» un ingreso; si se agrega, debe re-asignar desde ese renglón si el número sigue libre y avisar cuál quedó sin código. Limpieza única con `scripts/ctp-soltar-codigos-planta-muertos.mjs --tenant <id> [--aplicar]`: `main` 149 → 0 (22 renglones de auditoría, usuario `sistema:limpieza-codigos-planta`); Blas 0. Consecuencia: el número de una pieza muerta vuelve a estar disponible para el correlativo.
- **Intercambiar códigos (101↔102) en la recepción.** Escrito en un solo UPDATE, Postgres chequea el índice fila por fila y da 23505 (verificado en una transacción con rollback sobre `main`). `actualizarRecepcion` suelta primero los códigos que cambian y después escribe los nuevos, en la misma transacción; el guard ya no excluye a las trozas del pedido que no mandan código (esas siguen ocupando el suyo).

## Adenda 2026-09-26 — Dos QR: la ficha en texto (sin internet) y el del sistema

Brandon: «el primero va a trabajar sin internet mostrando información así en texto… otra función, puede ser otro QR pequeño, que al escanear permita escoger las trozas para consumo y hacer lote».

- **QR grande = la ficha escrita** (`lib/forestal/ficha-texto-troza.ts`): `TROZA <código>` y después `Especie`, `Volumen`, `Medidas`, `N° registro` (`WoodEntry.libroNro`), `GTF`, `SNIFFS` (constancia), `Titular`, `Permiso`, `Cód. bosque`. Lo que falta no se escribe. Cualquier celular la lee con la cámara, sin señal ni cuenta. **Cambia lo que decía la Decisión 1** («escanearla sin cuenta no expone datos»): ahora la etiqueta muestra a quien la escanee lo mismo que la guía impresa que viaja con la carga. Nunca lleva DNI ni RUC. Quien no lo quiera apaga «Ficha en el QR» y vuelve la etiqueta de un solo QR.
- **QR chico = `/admin/q/<id>`**, igual que las etiquetas ya pegadas: abre la troza en el sistema y es el que se escanea para armar lotes. El escáner del sistema entiende los dos (`leerEscaneo` toma el código de la primera línea de la ficha; `esLineaDeFicha` calla las líneas sueltas que una pistola 2D tipea con Enter).
- **Tamaño medido con el codificador real** (`qrcode`), no con bytes: la troza típica de Blas sale en versión 8 (49 módulos) y la más larga posible en versión 10 con corrección L (57 módulos, 0,34 mm en el sticker de 20 mm). Formatos chicos: corrección L; rollo 100×50 y testa: M. Un test falla si una línea nueva baja el módulo de 0,28 mm en algún formato.
- **Maquetación**: el QR chico va bajo el grande (A4, 50×30), entre las barras y el grande (100×50) o a su lado (testa). El texto ya no empuja: `minmax(0, 1fr)` en la fila y una línea con «…» para el código del bosque y las medidas; los m³ van primero para que el «…» se coma el largo, no el volumen. El QR del 100×50 pasa de 40 a 38 mm (con 40 pisaba el pie). Verificado renderizando los 4 formatos a ~290 y ~200 ppp: 24/24 sin recortes y los 32 QR decodificados.
