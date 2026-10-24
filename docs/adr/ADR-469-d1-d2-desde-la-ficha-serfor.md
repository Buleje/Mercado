# ADR-469 — D1/D2 de las trozas desde la ficha SERFOR de la guía

- **Estado:** aceptado (2026-10-05). Construido; vista previa probada por curl en `main`. La escritura real espera un N° de registro de una guía de Blas. Sin cambio de schema.
- **Relacionados:** ADR-312 (la ficha la trae el servidor, nunca el navegador), ADR-440 (D1/D2 medidos en planta, sólo sobre vacío), ADR-313 (retrozado necesita el diámetro mayor), memoria `serfor-consulta-gtf-publica`.
- **Pedido (Brandon, 05-10, Trozas):** «las columnas D1 y D2 se ponen automáticas porque esos están en la guía».

## Contexto

- Medido el 05-10: en `main` 24/24 trozas tienen D1/D2; en Blas 0 de 17. Esas 17 vinieron del inventario de apertura con su N° de GTF (`010-001-0000005…14`) y su `codificacion` (`116-A`, `62B`…), pero sin `dimensiones`, y sus guías no están en `ForestGuiaGuardada`, `ForestGtf` ni `ForestLothEntry`.
- La consulta pública del SNIFFS devuelve la **lista de trozas con codificación y dimensiones** (`D1 X D2 X largo`), pero se consulta con el **N° de registro** (`1-19-0313629`, el del QR, con guiones), que es otro dato que el N° de GTF impreso (`019-0000003`). Del N° de GTF no se puede llegar al de registro sin enumerar el servicio del Estado, y eso no se hace.

## Decisión

1. **Fuente:** la ficha guardada en el ingreso (`WoodEntry.serforGtf`) si existe —sin red, «automático»—; si no, el operador da el N° de registro o pega el enlace del QR (se extrae `nuRegistroGuia`) y el servidor consulta SERFOR por el único punto de red (`consultarGtfEnSerfor`, mismo rate limit que `GET /gtf/serfor`).
2. **Sólo si la ficha es de esa guía** (`relacionDeGuias`): mismo número por `claveNumeroGtf`, o la ficha con un tramo menos y el resto igual (`001-0000005` dentro de `010-001-0000005`). Otra guía → 422.
3. **Cruce por código** (`planearMedidasDesdeGuia`, puro): exacto (trim + mayúsculas) y, si no aparece, flexible (sin guiones, barras, puntos, espacios ni el paréntesis del precinto). Dos candidatas de un lado o del otro → **ambigua**, no se empareja.
4. **Sólo sobre vacío:** el UPDATE repite `d1Cm IS NULL AND d2Cm IS NULL` en el WHERE, dentro de una transacción con las trozas bloqueadas. `dimensiones`, `largoM` y `diametroCm` sólo si estaban vacíos; `d1d2MedidoEnPlanta = false` (la fuente es la guía). No toca el volumen.
5. **No se fuerza:** medidas con menos de tres números → `sinDato`; largo del libro y de la guía con más de 30 cm de diferencia → `largoDistinto` (otra pieza o se cortó); mes cerrado → bloqueada.
6. **La ficha consultada queda en el ingreso** (`serforGtf`, `serforNumeroRegistro`) sólo si estaban vacíos y el mes está abierto.
7. **Rastro:** `ActivityLog` `ctp_troza_d1d2_guia` con guía, registro, cada código (y su par flexible) y las medidas; caché `wood-entries:<tenant>` invalidada.
8. **Roles:** los de anotar D1/D2 en planta (`admin`, `almacenero`, `owner`): el dato lo pone SERFOR, no quien aprieta el botón.

## Consecuencias

- Una guía del inventario se completa con un dato que el operador tiene en el papel (el QR), sin tipear 3 × N números.
- Si SERFOR publica la guía con otro formato de número (más de un tramo de diferencia), la relación sale `distinta` y no se escribe: se ve en la vista previa y se completa a mano.

## Cambio 2026-10-05 — «Completar Blas con el QR» (título y cámara)

- **QR con la cámara:** cada guía de la planilla tiene «Escanear QR» (la cámara del escáner de trozas, `CamaraEscaneo`). `leerQrDeGuia` (puro) acepta el enlace de la consulta SNIFFS (`nuRegistroGuia`) o el N° de registro con forma `tipo-región-correlativo`; cualquier otro QR (etiqueta de troza, certificado propio, enlace ajeno) se rechaza diciendo qué se leyó. La vista previa sale sola.
- **QR de otra guía:** la vista previa con `relacionGuia: "distinta"` no deja guardar (el 422 sigue); si la ficha es de UNA de las otras guías pendientes (`guiaQueCorresponde`), un toque la lleva allá y se consulta sola.
- **Título habilitante:** la respuesta trae `titulo` (`tituloDesdeFicha`: casilleros 6 y 8 de la ficha frente a los ingresos de la guía, con `planearTitulo`). Al aplicar, DESPUÉS de las medidas y en su propia transacción, `TituloGuiaDB.declarar` con el código y la resolución de la ficha (sólo vacío, mes abierto, vínculo al permiso si el código es de la lista; `ActivityLog` `ctp_ingreso_titulo_declarado` con «tomado de la ficha SERFOR (registro …)»). Si no entra —rol, mes cerrado, error— las medidas quedan y `aplicado.titulo.motivo` dice por qué. Si el libro declara OTRO título, no se pisa y la vista previa lo muestra.
- **Roles del título:** admin y dueño (`bloqueoRolTitulo`), chequeado a mano porque `requireAdmin` deja pasar al encargado por el bypass de gestión. Almacenero y encargado guardan las medidas; el título queda afuera con el motivo. ⚠️ `PATCH /wood-entries/titulo` declara admin/dueño pero hoy deja pasar al encargado (mismo bypass): pendiente alinearlo.
- **Guía tras guía:** al guardar una, el foco pasa a la siguiente pendiente (`siguienteGuiaPendiente`) sin cerrar, con «N de M guías completas» (las que pasaron por la lista desde que se abrió).
- **Verificado:** vista previa real en `main` (SERFOR `1-19-0313629` → título `19-SEC/PER-FMC-2024-008`, `vinculaPermiso: true`, relación `distinta`) y `aplicar` → 422 `guia_distinta` sin escribir. La escritura de medidas + título en Blas espera un N° de registro (o el papel) de una de sus 7 guías.
