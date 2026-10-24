# ADR-347 — Una fila de filtros, y un solo pedido por dato

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Consumos (filtros) · todo el módulo forestal (carga)
- **Relacionado:** ADR-345 (una sola barra de filtros) · ADR-344 (paginación) · ADR-341 (el montón)

## 1. Los filtros ocupaban tres renglones

Unificar las dos barras (ADR-345) dejó una grilla de **tres filas**. Medido a
1600px: la tabla —lo único que se mira— arrancaba a los 1050px de scroll.

Arriba queda **sólo lo que se usa siempre**: el lote, el día y la búsqueda. Los
cinco selectores finos —especie, guía, permiso, resolución, proveedor— viven
detrás de **«Filtros»**, con el contador de cuántos están puestos.

Lo que está activo se muestra como **chip que se saca de un click**: un filtro
escondido que explica por qué falta madera es peor que dos renglones de más.

Dos detalles que valían un renglón entero cada uno:

- El selector de lote ocupa **dos celdas sólo mientras no hay fecha**; al elegir
  lote aparece el día y vuelve a una.
- **Sin lotes abiertos no se dibuja un selector vacío** —es un cartel de «no
  hay»— sino el camino: «Programar un lote para cargar la sierra».

En el cuadro pasó lo mismo: agrupar y descargar comparten celda, y descargar y
limpiar quedaron como botones de ícono.

**Medido: la barra pasó de ~160px a 48px; la tabla arranca 113px más arriba.**

## 2. La misma respuesta, pedida seis veces

Medición en el navegador (`performance.getEntriesByType("resource")`), UNA carga
de la pestaña Consumos:

| Endpoint | Antes | Después |
|---|---|---|
| `/forestal/ctp` (grafo, saldos, traza, secciones) | 12 | 6 |
| `/forestal/lotes-aserrio` | 6 | 2 |
| `/forestal/wood-entries` | 6 | 2 |
| `trozas/patio` · `ctp-ficha` · `ask` · `cierre` | 2 c/u | 1 c/u |
| **Total al módulo forestal** | **36** | **16** |
| Transferido | 125 KB | 90 KB |
| URLs repetidas exactas | 8 | **0** |

Dos cambios lo explican:

### `ctpGet` — un pedido por dato

`lib/forestal/ctp-fetch.ts` gana un GET con **dedupe en vuelo** (dos componentes
que piden la misma url comparten la promesa — también neutraliza el doble
montaje de React en dev) y **micro-caché de 8 s**, que es lo que dura el montaje
simultáneo de la cabina, el semáforo de pendientes, la tira de lotes y la vista.

No es un caché de sesión: **toda escritura llama a `invalidarCtp()`**. Un caché
que sobrevive a un consumo muestra madera que ya entró a la sierra.

Migrados: `use-lotes-aserrio`, `use-ctp-pendientes`, `use-ctp-saldos`,
`use-ctp-compliance`, `use-ctp-cierres`, `CtpLotesTira`, `CtpAsistente` y la
vista de Consumos.

### El grafo trae sus casilleros

Consumos pedía `wood-entries?limit=5000` **sólo para leerle seis campos** a cada
ingreso (producto, nombre científico, código de origen, N° de fuente, unidad).
Traía el ingreso entero —notas, fotos, la GTF de SERFOR— de miles de filas.

Ahora esos seis viajan dentro del grafo, que ya consultaba esos mismos ingresos
y ya descarta anulados y rechazados en la consulta. `filasConsumo()` los toma de
ahí por defecto: **un fetch menos, y era el más pesado de la pantalla**.

## Consecuencias

- El TTL es corto a propósito. Si alguna vista necesitara datos frescos dentro
  de esos 8 s, pasa `ttlMs: 0`.
- Quedan ~60 GET del módulo sin migrar: son de modales y paneles que se abren a
  mano, no del montaje. Se migran cuando aparezcan en una medición, no antes.
