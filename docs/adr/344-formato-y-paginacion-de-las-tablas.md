# ADR-344 — Un solo formato de tabla, y todas paginan

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · todas las vistas con tabla
- **Relacionado:** ADR-341 (el montón en Consumos) · ADR-343 (apartados) · ADR-127 (tablas de Producción/Despacho)

## El problema

Cada tabla del módulo se había escrito por su cuenta: su cabecera, su densidad,
su borde. Y **ninguna tenía tope de filas**. Con un patio de mil trozas o una
Sección 2 de un trimestre, el navegador pintaba mil filas que nadie iba a leer, y
la única forma de llegar al pie era scrollear todo.

## La decisión

### 1. La aritmética, en una lib pura

`lib/forestal/tabla-paginacion.ts` (14 tests): el rango de la página, los números
que se dibujan y el rótulo en palabras. Dos reglas que se ganaron con tablas
rotas:

- **La página se acota sola.** Filtrar estando en la página 7 dejaba al operador
  mirando una pantalla vacía; ahora vuelve a la última con filas.
- **Cambiar el tamaño vuelve al principio.** Quedarse en la 7 con páginas el
  triple de largas es un lugar que nadie eligió.

### 2. El marco y la barra, en un primitivo

`components/admin/forestal/ctp-tabla.tsx`: `TablaCtp` (cabecera **sticky**,
líneas suaves, scroll horizontal propio, alto máximo), `TheadCtp` / `TbodyCtp` /
`FilaVacia`, el hook `usePaginacion` y `CtpPaginacion` — el rango en palabras
(«Mostrando 26–50 de 340 trozas»), el selector **25 / 50 / 100 / Todas** y los
botones ‹‹ ‹ 1 … n › ››.

La barra se dibuja **siempre que haya filas**, aunque entren todas: saber cuántas
hay es parte de leer la tabla. Los botones sólo aparecen si hay más de una
página.

### 3. Aplicado

| Tabla | Sustantivo del rótulo |
|---|---|
| Trozas en el patio (Consumos) | trozas · con los m³ y el pie tablar del filtro |
| Sección 2 · Consumos | consumos — el pie va **dentro** del `Cuadro`, que ganó un slot `pie` |
| Piezas del lote (ficha) | piezas |
| Producción / Despacho | corridas · despachos |

El cuadro agrupado no pagina: cortar grupos dejaría un subtotal sin sus líneas.

## Consecuencias

- `Cuadro` (formato oficial) acepta `pie`: la paginación se lee como parte del
  cuadro y no como un control flotando debajo.
- Verificado en el tenant real: el patio mostró **«Mostrando 1–25 de 30 trozas ·
  78.3358 m³ · 33.197 pt»** con páginas 1 y 2; la página 2 trajo las 5
  restantes; «Todas» pasó a 30 filas y escondió los botones; Producción mostró
  «5 corridas» con su selector.
