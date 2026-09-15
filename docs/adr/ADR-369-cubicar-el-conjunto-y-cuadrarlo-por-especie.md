# ADR-369 — Cubicar el conjunto y cuadrarlo especie por especie

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Productos disponibles (`cuadrarConjunto`,
  `CtpCubicarProductoModal`, `CtpProductosDisponibles`, `cubicacion-registro`)
- **Relacionados:** ADR-368 (cubicar un producto contra su asiento), ADR-349
  (producción en paquetes), ADR-366 (la ficha del paquete)

## Contexto

ADR-368 dejó cubicar **un** producto contra **su** asiento. Pero el aserradero no
mide de a un paquete: cubica **el camión entero** —veinte metros cúbicos de tres
especies— y eso tiene que cuadrar contra el conjunto de registros que van a
salir. Con la herramienta por fila había que medir cinco veces la misma pila y
después sumar a mano.

Y comparar sólo los totales esconde el error que importa: **que sobre Tornillo y
falte Capirona da cero en la suma**. En una guía eso es carga sin amparo.

## Decisión

1. **`cuadrarConjunto(piezas, filas)`** (puro, 8 tests nuevos) agrupa la medición
   y lo declarado **por especie**, y devuelve fila por fila: piezas medidas vs
   declaradas, m³ medidos vs declarados y su diferencia, con el total aparte.
   - Medir una especie que no se eligió, o elegir una que no se midió, es
     **error** (no aviso): es madera que no tiene de dónde salir.
   - Si el volumen total cierra pero las especies están cruzadas, el primer aviso
     lo dice con todas las letras — el verde del total no puede tapar eso.
   - Las piezas sin especie se agrupan bajo «sin especie» y se **nombran**.
2. **Selección múltiple en la tabla**: un check por fila, otro en la cabecera para
   todo lo visible (que con filtro puesto es lo filtrado, no las 500 del período)
   y una barra fija con registros · piezas · volumen · pie tablar y el CTA
   **«Cubicar madera»**.
3. **Una cubicación puede amparar varias corridas**: `CubicacionRegistro` gana
   `ctpEntryIds[]`; `ctpEntryId` sigue siendo el primero, así que lo que ya leía
   un solo id —el ANEXO N° 04, la ficha del despacho— no se entera del cambio.
4. **Reusar una medición en vez de repetirla**: el modal ofrece las cubicaciones
   guardadas; elegir una carga sus piezas en la grilla y **actualiza ese mismo
   registro** al guardar (le agrega las corridas contra las que ahora cuadra).
   Dos mediciones distintas de la misma pila es justo lo que no puede pasar.
5. **La tabla muestra el pie tablar**, que es la unidad en la que se canta y se
   vende en el patio; el libro guarda m³ y la conversión se hacía aparte.

## Consecuencias

- El modal sirve para los dos casos con el mismo código: una fila (con el cruce
  extra del **tipo**, que por especie no existe) o el conjunto tildado.
- Si todo lo elegido es de una sola especie, la grilla arranca con ella: pedir la
  especie fila por fila con tres paquetes de Tornillo es pedir que la olviden, y
  una pieza sin especie no cuadra contra nada.
- Sigue **avisando, no bloqueando** (ADR-368): el primer clic muestra las
  diferencias, el segundo guarda y lo deja escrito en las notas.

## Verificación

Tenant real: se tildaron 3 registros (28 piezas · 0.8376 m³ · Tornillo), la barra
mostró `Registros 3 · Piezas 28 · Volumen 0.8376 m³ · Pie tablar 355 pt` y al
medir 30 piezas de 2×8×10 pies el cuadre dio
`Tornillo: 30 vs 28 piezas · 0.9439 vs 0.8376 m³ · +0.1063 m³ (+2 pza)` con su
aviso. Guardado confirmado en la base: `30 piezas · 400.00 pt · 0.9439 m³` con
`ctpEntryIds`. El selector de cubicaciones guardadas ofreció las 2 existentes.
Light y dark, sin errores de consola.
