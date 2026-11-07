# ADR-487 — La carta de las guías: título del permiso, expediente y código único

- **Estado:** aceptado (2026-10-08). Construido.
- **Pedido por:** Brandon (08-10): «cuando se está en Libro TH › GTF, selecciona GTF y se escoge Relación de guías en trámites: tiene que ponerse en el documento arriba en el título el título del permiso, debe añadirse el N° de expediente automáticamente, y diferentes datos y mejorar el formato, cada carta con un código único que se guardará».
- **Extiende:** ADR-364 (relación de guías, correlativo `NNN-AAAA` al presentar), ADR-474 (guías elegidas → formatos), ADR-308 §4 (trámites en KV). **No toca schema.**

## Contexto (medido, sólo lectura)

- El N° de expediente **no existe en ningún lado**: ni en `ForestContrato`, ni en la carátula del LO-TH (`ForestLothCaratula`), ni en `ForestPlan`, ni en `gtfDatos`. El papel tenía un casillero «Expediente» a mano, en blanco cada vez.
- Blas: 6 permisos; sólo 1 trae ubicación y ARFFS (`19-SEC/REG-PLT-2025-096`) y su «resolución» es el mismo código. 3 GTF en el Libro TH (2 de ese permiso). 3 trámites guardados, ninguno de la relación.
- Ya existía un código interno por trámite (`SERFOR-2026-001`, al primer guardado), pero **«Imprimir» no guardaba**: el papel impreso desde la barra de guías salía sin código. Y una carta guardada se podía editar después: reimprimirla no daba el mismo papel.
- Con guías de dos permisos ya se arma **una carta por permiso** (botón por permiso; las de otro quedan fuera con aviso, Brandon 08-10). Se mantiene.

## Decisión

1. **Las cartas** son los formatos que se llenan desde las guías (`aceptaGuias`: la relación y sus 5 hermanos de la barra). Comparten el encabezado nuevo; los otros 23 formatos salen igual que antes.
2. **Título de la carta** (`tramites-print.ts › cabezaCartaHtml`): nombre del formato centrado, `N° 001-2026 · SERFOR` y, si la carta es de un permiso, una tabla con: título habilitante (código + modalidad escrita como en la Ley 29763), titular, RUC (o DNI si es persona natural), representante, resolución con fecha, ubicación (distrito, provincia, región), **expediente** y período. Lo vacío no se imprime (sin rayas mudas). Los datos salen del permiso al elegirlo (`datosDelPermiso`: `permisoTipo`, `permisoResolucion`, `permisoUbicacion`, `permisoTitularDni`); una resolución igual al código no se repite. Los hermanos llevan el permiso si todas sus guías dicen el mismo (`conPermisoUnico`); con dos, no se elige por el operador.
3. **Expediente del permiso** (`tramites-carta.ts › expedienteDelPermiso`): sin casillero en el permiso, se escribe **una vez** en «N° de expediente del permiso» (bloque del permiso del formulario) y las cartas siguientes del MISMO permiso (mismo contrato o mismo código normalizado) lo traen solas de la última carta guardada que lo tenía. Vacío = borde ámbar + «Falta: escríbelo acá una vez…» en el formulario y «Falta el N° de expediente» marcado en el papel de la app (nunca en el impreso). Si se cambia de permiso, el expediente puesto solo se reemplaza; el tipeado a mano, no.
4. **Código único por carta**: `prefijoCodigo` en el catálogo; la relación usa **`REL-AAAA-NNNN`** (correlativo por negocio y año, 4 dígitos; los demás formatos siguen con la sigla de su autoridad). Sale arriba a la derecha («Carta REL-2026-0001») y al pie de cada hoja (`@page @bottom-left`, junto a «Página X de Y»). **Único de verdad**: toda escritura del KV va por `PlatformSettingsDB.actualizar` (advisory lock por clave, lectura de la base), así dos impresiones a la vez no sacan el mismo código ni se pisan; y el correlativo respeta un piso que sólo sube (`interno:ctp-tramites-correlativos:<tenant>`, `pisosTrasRegistro`), así borrar una carta —o que caiga del tope de 400— no devuelve su código a otra. Lo mismo vale para el `NNN-AAAA` de ADR-364.
5. **Imprimir sella** (`emitir: true` → `TramiteRegistro.emision`): al Imprimir, Descargar PDF o PDF al Drive, la carta se guarda y el servidor la sella con `{en, por, huella, guias, permisoCodigo, expediente}` (el usuario sale de la sesión, nunca del cuerpo; Zod descarta un `emision` del cliente). La **huella** (FNV-1a de formato + permiso normalizado + expediente + N° de guías, sin orden; la anulada cuenta distinto) decide:
   - misma huella → **reimpresión**: mismo código, no se guarda de nuevo (corregir la redacción no cambia la huella);
   - otra huella → **otra carta**: el cliente la guarda como trámite nuevo (código nuevo, borrador) y la anterior queda como se imprimió. El servidor lo exige: guardar otro contenido bajo un código sellado → 409 `carta_impresa`.
   La ventana de impresión se abre en el mismo clic (si no, el navegador la bloquea tras esperar al servidor).
6. **Buscar y reimprimir**: el Expediente de Trámites busca también por N° de guía, permiso y expediente, y muestra «Impresa el jueves 08/10 por … · N guías · permiso … · expediente …». «Abrir» → «Imprimir» la saca igual con su código.
7. **Composición A4**: `@page` A4 16/16/18 mm, numeración «Página X de Y», encabezados de tabla repetidos por hoja, filas y totales sin partirse; en la carta, los anexos declarados y la base legal van **antes** de la firma y las tablas de guías (Anexo 1/2 + totales por especie) en hoja aparte después.

## Consecuencias

- Sin migración: el sello vive en el mismo KV de trámites (`ctp-trámites:<tenant>`, tope 400). Si mañana el expediente tiene que cargarse desde la ficha del permiso, es una columna aditiva `ForestContrato.expediente` y `expedienteDelPermiso` la lee primero.
- Las relaciones guardadas antes siguen con su código `SERFOR-…` y sin sello: la primera vez que se impriman se sellan con lo que tengan.
- Tests: `__tests__/forestal-tramites-carta.test.ts`.
