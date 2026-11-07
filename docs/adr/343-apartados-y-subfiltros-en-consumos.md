# ADR-343 — Consumos se recorre por apartados, y la pila se acota con sub-filtros

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Consumos
- **Relacionado:** ADR-340 (consumir en el patio) · ADR-341 (el montón en Consumos) · ADR-342 (el lote programado)

## El problema

La pestaña acumuló dos cosas largas: **la tabla del patio** (34 piezas, con sus
filtros) y **el cuadro oficial de la Sección 2**. Apiladas, llegar a la segunda
era scrollear la primera entera.

Y con el lote puesto la tabla ya venía acotada a su especie, pero de ahí para
abajo no había cómo seguir afinando: en una carga de un mismo permiso, «las de
esta resolución» o «las de este proveedor» se buscaban a ojo.

## La decisión

### 1. Apartados que se turnan en el mismo lugar

`CtpApartados` + `useApartado`: una barra con los apartados numerados —**01
Trozas en el patio** · **02 Sección 2 · Consumos**—, cada uno con su contador, y
flechas ‹ › para ir de uno al siguiente. Sólo se dibuja el activo.

El apartado se **recuerda por vista** (`localStorage`): el que trabaja todo el
día en el patio no vuelve a elegirlo cada vez que entra.

### 2. Sub-filtros del patio, siempre a mano

Al filtro por especie y guía se suman **permiso** (título habilitante, casillero
6), **resolución** (casillero 8) y **proveedor**. Se muestran cuando hay algo que
elegir —no cuando hay más de uno—: con el lote puesto, son justamente los que
terminan de acotar la pila.

Debajo, la cuenta de lo que se está mirando («Mostrando 12 de 34 piezas del
patio») y un atajo para **elegir las N de este filtro** — que es el gesto real:
filtrar por resolución y llevarse todo ese grupo a la sierra.

### 3. Toasts para lo que pasa lejos de donde se mira

Consumir cambia de apartado —de la pila al cuadro—, así que el aviso inline
quedaba en una pantalla que ya nadie estaba viendo. Ahora el resultado va por
**toast** («Consumo registrado» + el detalle con la corrida abierta) y la vista
**salta sola al cuadro**, que es donde acaba de aparecer la fila.

## Consecuencias

- `ctp-apartados.tsx` es reusable: cualquier vista del libro con dos bloques
  largos puede turnarlos igual.
- Verificado en el tenant real: los apartados mostraron **01 Trozas en el patio
  (34)** y **02 Sección 2 (2)**, las flechas cambiaron el contenido en el mismo
  lugar, los cinco sub-filtros quedaron a la vista, y al consumir dos piezas del
  lote `LA-2026-011` la vista saltó al cuadro con la Sección 2 en **3 filas**.
  Revertido después: 59 trozas, 52 libres.
