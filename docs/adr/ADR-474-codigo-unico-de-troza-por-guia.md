# ADR-474 — Código único de troza por guía (importar y despachar guías del Libro TH)

- **Estado:** aceptado (2026-10-07). **Reemplazado en §2 (cuándo se renombra) por ADR-477 (2026-10-08):** toda troza que entra desde una guía lleva SIEMPRE `<código>-<correlativo>` («12A-0001»); la casilla de §3 sigue. Construido y probado (`__tests__/loth-importar-guia-codigo-unico.test.ts`, 15 casos; vista previa → importación → «Deshacer la importación» por la ruta real en `main`, dos guías del mismo permiso que repiten 12A/12B). Sin cambio de schema.
- **Relacionados:** ADR-461 (importar guías ya despachadas al Libro TH), ADR-459 (plantación sin censo), ADR-305 (T1-T5 del Libro TH), ADR-450 (la troza recuerda su `trozadoId` al pasar al CTP).
- **Pedido (Brandon, 07-10):** «cuando se importa [y] despacho guías, cada guía en su listado de trozas tendrá una columna de Código Único […] porque a veces en el mismo permiso en plantación los códigos de trozas vienen y son lo mismo pero con diferente guía y eso confunde».

## Contexto

- El Libro TH exige `trozaCode` único en TODO el negocio (T3, `ForestLothDB.enforceInvariants`): es lo que impide despachar la misma troza dos veces (T1) y lo que ata la guía a sus líneas (`lineasDeLaGuia`, «Deshacer», anular).
- En las plantaciones de Blas las guías del MISMO permiso repiten la numeración de trozas: la guía 1 trae «12A» y la guía 2 trae otra «12A». El importador pasaba el código de la guía tal cual y, como «12A» ya había salido, la 2.ª guía quedaba **bloqueada** («La troza 12A ya salió») sin forma de anotarla.
- SERFOR ya usa una escritura con el correlativo de la guía entre paréntesis («84/A (0000005)», guía real de comunidad nativa), y `arbolDeCodificacion` ya descartaba el paréntesis.

## Decisión

1. **El código único ES el `trozaCode`.** No se afloja ninguna invariante (T1, T3, T4 siguen igual, con `≤`): sólo cambia el código con que entra la troza que choca.
2. **Cuándo se renombra (`revisarGuia`, la misma función en vista previa e importación):** el código ya tiene una salida `despacho_troza` con **otra** guía (N° distinto, tramo a tramo) y la línea de Trozado de ese código es de **este** permiso. Se propone `«código» («correlativo de esta guía»)`, p. ej. «12A» de la GTF 019-001-0000002 → `12A (0000002)`; si ese ya está tomado, `12A (019-001-0000002)`; si también, choque como antes. Estado nuevo de la troza: `renombrada` (entra como `nueva`: Trozado, tala referencial, T6, tanda).
3. **Nunca automático.** Aviso `troza_renombrada` (atención) y una casilla «Son otras trozas: entran con su código único» en la vista previa. El ítem manda `confirmaRenombres` con los códigos únicos vistos; la importación vuelve a revisar bajo el candado y rechaza la guía (`renombre_sin_confirmar`) si renombra alguno que no esté confirmado. Si fuera la MISMA troza física, renombrarla contaría su volumen dos veces.
4. **El árbol no cambia:** `arbolDeCodificacion("12A (0000002)") = "12"`. La tala referencial del árbol 12 suma las trozas de las dos guías (T4 cierra por construcción).
5. **Lo que guarda cada lugar:**
   - `ForestLothEntry.trozaCode` (Trozado y Despacho): el único, `12A (0000002)`.
   - `ForestGtf.items[]`: `code` = el único; `codigoGuia` = «12A», sólo si difiere (contrato `ItemGtfLoth` en `lib/forestal/tramites-relacion-guias.ts`). Lo escribe `despacharConGuiaEnTx` con el parámetro opcional `codigosGuia`; el despacho manual desde el libro no lo manda (allí el código ya es único).
   - Observación del Trozado: «… En la guía: «12A» (ese código ya salió con otra guía de este permiso; código único ADR-474).» — «Deshacer la importación» la reconoce con la misma función que la escribe.
6. **Lectores:**
   - **Hoja SERFOR** (`loth-gtf-oficial.ts`: casillero 35 y presentación del 37) y **lista de trozas** (`listaDeTrozas`): imprimen `codigoGuia ?? code`. Si no, el papel diría «12A (0000002)» y SNIFFS «12A».
   - **Datos de la guía** (vista GTF → ⋯ → Datos → Lista de trozas): columnas «Código único» y, si alguna difiere, «En la guía».
   - **Vista previa del importador:** columnas «En la guía» y «Código único», chip «Código nuevo».
   - **Pase al CTP** (`guia-th-al-ctp.ts`): lee `codigoGuia`, pero el ingreso guarda en `codificacion` el código **único**. Con «12A», `trozasYaEnElLibro` la tomaría por la «12A» de la otra guía (mismo permiso y especie → falso «ya está en tu libro») y la atadura por código —guías sin `trozadoId`— caería en la troza de la otra guía. El código único contiene el de la guía y su correlativo.
   - Todo lo que ata líneas (`lineasDeLaGuia`, anular, deshacer, T1) sigue usando `code`.

## Consecuencias

- La 2.ª guía de una plantación con códigos repetidos se importa en vez de quedar bloqueada; el libro tiene una troza por pieza y cada guía su lista con código único.
- Un cliente viejo que no manda `confirmaRenombres` recibe el rechazo `renombre_sin_confirmar` (nunca un renombre silencioso).
- La tala referencial de un árbol de plantación puede sumar trozas de varias guías bajo el mismo código de árbol: es un agregado de registro, no una medición de campo (en plantación no es obligatoria, ADR-459).

## Lo que NO resuelve

- **Árboles y trozas de OTROS permisos** con el mismo código: siguen chocando (GTF 010-001-0000014 de Blas: árboles 62 y 85 de otros permisos). El arreglo es la clave (permiso, código) en T1-T4 y en las vistas por código: ADR propio + pasada de `security`.
- Una salida por **consumo** (aserrada en planta) o sin N° de guía no propone renombre: no hay «otra guía» que nombrar.
- El **resumen interno** impreso desde la vista GTF (`printGtf` en `LothGtfView.tsx`) muestra el código único; agregarle «En la guía» queda pendiente.

## Alternativas descartadas

- **Renombrar sin confirmar:** si la guía 2 trae la MISMA troza que la 1 (error de tipeo en SERFOR, reimpresión), se contaría su volumen dos veces ante OSINFOR.
- **Guardar en el CTP el código de la guía:** ver 6 (falso duplicado y atadura a la troza equivocada).
- **Clave (guía, código) en el libro:** el libro no está organizado por guía (una troza existe antes de salir); sería reescribir T1-T4.
