# ADR-352 — El archivo no hereda el filtro de la bandeja

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Ingresos ↔ GTF ingresadas
- **Relacionado:** ADR-339 (bandeja y archivo) · ADR-351 (recepcionar en un acto) · ADR-346 (la guía es la fila)

## La causa, que estaba en la captura

Reporte: *«recepciono en Ingresos y no aparece en GTF ingresadas»*. Dos rondas de
medición no lo reprodujeron — hasta que llegó la pantalla:

En «GTF ingresadas», el chip **«Pendiente 0» estaba activo**, junto a
«Validado 13». La tabla decía «Ninguna guía coincide con el filtro».

Las dos pestañas son **el mismo componente** con distinto filtro de recepción, y
compartían las preferencias en **una sola clave de localStorage**. Con
«Pendiente» puesto en la bandeja, el archivo abría filtrando por pendientes — y
en el archivo **todo está validado por definición**. Trece guías presentes,
ninguna visible.

## La decisión

### 1. Preferencias por pestaña

La clave lleva la vista: `…-v1:pendiente` para la bandeja y `…-v1:cerrada` para
el archivo. Cada una recuerda lo suyo y ninguna contamina a la otra.

El archivo abre además con **su propio default**: sin filtro de estado y
ordenado por `fechaRecepcion desc` (ADR-351). Y por si quedó guardado de la
versión anterior, al leer las prefs del archivo un `statusFilter === "pendiente"`
**se descarta**: es un filtro que ahí no puede dar resultados nunca.

### 2. Un vacío con filtro tiene que poder explicarse

El mensaje era «Ninguna guía coincide con el filtro. Probá limpiar la búsqueda o
ampliar el período» — sin decir qué filtro, y sin forma de sacarlo. Ahora
**nombra lo que está filtrando** («Filtrando por estado «Pendiente»») y trae el
botón **«Quitar los filtros y ver todo»**.

Un callejón sin salida en la pantalla donde el operador acaba de recibir una guía
se lee como «no se guardó». La regla que deja esto: **el estado vacío nombra su
causa y ofrece la salida** — vale para cualquier tabla del libro.

## Verificación

En el tenant real, reproduciendo la pantalla de la captura:

1. Chip **«Pendiente»** puesto en Ingresos → queda guardado sólo en
   `…-v1:pendiente`.
2. **GTF ingresadas** abre con **«Todos»** y muestra las **5 guías**, con
   `019-0000009` (3 asientos) arriba por ser la última recibida.
3. Filtrando «Pendiente» a mano dentro del archivo: «Ninguna guía coincide ·
   **Filtrando por estado «Pendiente»** · [Quitar los filtros y ver todo]» → el
   botón devuelve las 5.
