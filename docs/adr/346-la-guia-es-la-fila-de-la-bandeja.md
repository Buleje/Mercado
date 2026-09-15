# ADR-346 — La guía es la fila; los asientos viven adentro

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestañas Ingresos y GTF ingresadas
- **Relacionado:** ADR-312 (un ingreso por especie) · ADR-339 (bandeja / archivo) · ADR-311 (folio del libro)

## El problema

Una GTF que trae dos especies son **dos asientos** en el libro: el formato
oficial pide una línea por especie y producto (ADR-312), y eso es correcto y no
se toca.

Pero el operador no recibió dos cosas: recibió **un papel**. La bandeja mostraba
la misma guía repetida —mismo número, mismo proveedor, misma fecha— y había que
validarla dos veces y recepcionarla dos veces. Peor: el propio selector de la
vista decía *«Por guía — una fila por documento de ingreso»* y no era cierto.

## La decisión

**La pantalla ve guías; el libro sigue viendo asientos.** Ningún cambio de
schema, ninguna migración: cambia cómo se lista y sobre qué actúan los botones.

### 1. El resumen, en una lib pura

`lib/forestal/ingresos-por-guia.ts` (12 tests) junta las líneas de un documento:
especies ordenadas por volumen, totales, folios `13–14`, piezas y cuántas ya
tienen decisión de recepción. Tres reglas que se ganaron pensando en el
fiscalizador:

- **La clave es serie + número.** Dos ARFFS pueden emitir el mismo correlativo
  con series distintas; juntarlas sería declarar que una madera vino de un papel
  que no la ampara.
- **Estados distintos dan `mixto`, nunca el del primero.** Una guía con una
  línea validada y otra rechazada no está validada, y mostrarla así esconde justo
  la que hay que mirar.
- **Sin volumen en las piezas, el total es `null` y no `0`** — «no sé» no es
  «cero», o la tabla canta un descuadre que nadie puede explicar.

### 2. La paginación va por documento

`WoodEntriesDB.listPorGuia()` agrupa en SQL (`groupBy` por serie + número),
ordena los **grupos** —por fecha manda el asiento más viejo, por cantidad la
suma— y recién entonces trae los asientos de esa página.

No se agrupa una página de asientos ya cortada: **cortar a los 50 partiría una
guía justo en el borde** y la misma guía saldría en dos páginas. El endpoint lo
expone con `?agrupar=guia`, y la respuesta trae `total` (guías) y `lineas`
(asientos), que es lo que dice el pie: *«12 guías · 13 asientos del libro»*.

### 3. Las acciones son del papel

`CtpGuiasTable` reemplaza a `CtpIngresosTable` (borrada, junto con su card
mobile). Cada fila trae **Recepcionar guía** —en la bandeja— y **Validar N**, que
operan sobre todos sus asientos de una. El detalle se despliega con «Ver
asientos»: ahí vive lo que es de cada línea (rechazar con motivo, editar,
duplicar, cadena), porque ahí se ve a cuál se le aplica.

Marcar la guía marca todos sus asientos pendientes: las acciones en lote siguen
trabajando sobre asientos, pero el operador eligió un documento.

## Consecuencias

- `formatDate` acepta `Date` además de `string`: el resumen se arma en el
  servidor con lo que devuelve Prisma. Una sola función o la fecha se formatea
  de dos maneras.
- El CSV y el legajo **siguen siendo por asiento**: son el libro, no la bandeja.
- Los KPI del período siguen contando ingresos (asientos). El pie de la tabla es
  el que aclara la diferencia.

## Verificación

En el tenant real: la guía `019-0000003` (Copaiba + Sapotillo) pasó de dos filas
a una — folios **13–14**, «2 asientos», `9.0650 + 4.8740 = 13.9390 m³`, 4 trozas,
Validado — y desplegada muestra sus dos asientos con su nombre científico.

Camino completo con datos nuevos: se registraron dos asientos de la misma GTF
(`QA-GUIA-2ESP`: Tornillo 4.5 + Capirona 2.25) → apareció **una** fila en la
bandeja con «2 especies · Rolliza · 6.7500 m³» → **Recepcionar guía** en un
click → toast «Guía QA-GUIA-2ESP recepcionada», salió de la bandeja y apareció
en «GTF ingresadas», también como una sola fila. Datos de QA borrados después.
