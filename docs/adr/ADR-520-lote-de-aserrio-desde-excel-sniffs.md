# ADR-520 — Lote de aserrío pegado desde el Excel del SNIFFS, ya consumido

- **Estado:** aceptado (2026-10-27). Sin schema.
- **Pedido por:** Brandon (27-10): «en el modal de programar un lote de aserrío quiero poder importar en Excel… esos datos importados se pondrán directamente al lote y se pondrán ya como consumido… y podrá usarse normal igual como los otros».
- **Relacionados:** ADR-326 (consumo por pieza, T1), ADR-334/342 (lote de aserrío y su programación), ADR-356 (consumo parcial), ADR-393 (un lote, un permiso), ADR-433 (T3: no se asierra antes de llegar).

## Contexto
El SNIFFS ya tiene los lotes armados y consumidos (lista de trozas con «Lote», «Estado Actual: En consumo» y «Fecha del Estado»). En el libro había que repetirlo a mano: programar el lote, buscar cada troza en Consumos y consumirla. En Blas las 13 trozas del lote 28-2026 ya están en el patio (guías 019-001-0000012/13), libres y con el mismo volumen.

## Decisión
- 3.ª pestaña «Pegar de Excel» en «Programar un lote de aserrío». El pegado se lee en el navegador (`lib/forestal/lote-desde-excel.ts`, mismo reconocimiento de títulos que el import del inventario + «Lote» y el código de troza sin título) y se parte en un lote por N°.
- `POST /api/admin/forestal/lotes-aserrio/importar`: `modo: "previsualizar"` cruza cada fila con el libro sin escribir; `modo: "importar"` vuelve a cruzar en el servidor y recién ahí escribe. El cruce es UNA función pura (`cruzarLote`): por Código Planta acotado a su guía, si no por el código de la troza en su guía; código repetido = «ambigua», nunca se adivina.
- Importar = abrir el lote (o completar el programado con ese N° si está abierto) + `consumirEnPatio` con `exigirTodas`: todas las reglas del libro (T1, una especie, un permiso, T3, mes cerrado) se miran de nuevo bajo lock. Si falla, el lote nuevo se retira y al existente se le sacan las piezas que agregó el pedido.
- Se consume el volumen del LIBRO (el de la guía); el del Excel sólo avisa si difiere más de 1 dm³. D1/D2 del Excel completan sólo puntas vacías (`guardarMedidasTrozas`, `fuente: "archivo"`).
- La fecha del consumo sale de «Fecha del Estado»; si es anterior al ingreso de las trozas (T3) se dice y se ofrece la primera fecha válida.

## Alternativas descartadas
- **Crear trozas que no están en el patio:** el origen legal es la GTF; una troza sin ingreso no se inventa. La fila sale «No está».
- **Forzar la fecha del SNIFFS por encima de T3:** es la invariante que impide declarar madera aserrada antes de llegar.
- **Hacer el cruce en la pantalla con el patio que ya tiene:** el patio de la pantalla no trae las consumidas ni sus motivos, y la pantalla no decide.

## Consecuencias
- El lote queda consumido con su corrida «producción por declarar»: se declara como cualquier otro.
- La tarjeta de un lote consumido sin producción dice «Producción por declarar» (antes «Aún sin aserrar», que contradecía al «Aserrado el …»).
- Auditoría: `ctp_lote_importado_sniffs`.
- (27-10, 2.ª vuelta) El pegado es una grilla como la del cubicador (`CtpLoteExcelGrilla`: clic en una celda y Ctrl+V; con los títulos del SNIFFS cada columna cae en la suya; columnas sueltas desde la celda). Se cruza solo medio segundo después del último cambio.
- (27-10) Un lote `consumido` cuya corrida viva no declaró producción se rotula «En consumo» (tarjeta, detalle y cada pieza), no «Aserrado»: `estadoDeLote` / `loteEnConsumo` en `lib/forestal/lotes-aserrio.ts`. El filtro por estado sigue siendo por `status`.
