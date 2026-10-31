# ADR-312 — Un ingreso por especie y la troza como pieza trazable

- **Fecha:** 2026-07-30
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP (LO-CTP) · RDE D000025-2023-MIDAGRI-SERFOR-DE
- **Relacionado:** ADR-311 (paridad de campos), ADR-134 (ingresos), consulta pública de GTF

## El problema

Una GTF real ampara **varias especies**. La guía `1-19-0313629` declara Copaiba 9.065 m³ y
Sapotillo 4.874 m³, total 13.939 m³, repartidas en 4 trozas con su codificación.

El alta de ingreso guardaba **un solo registro**: la primera especie de la guía con el
**volumen total**. O sea, el libro decía *Copaiba 13.939 m³* — una especie que nunca entró
en esa cantidad y otra que no entró nunca. Para un fiscalizador eso no es un redondeo: es
un ingreso que no cuadra con su documento de origen, y la salida que se apoye en él tampoco.

Y la lista de trozas —la codificación que OSINFOR cruza pieza por pieza contra el POA del
título habilitante— se guardaba sólo dentro del JSON de la ficha: visible al reimprimir la
GTF, imposible de buscar.

## La decisión

### 1. Una GTF con N especies entra como N ingresos

Cada producto declarado en la guía genera **su propio `WoodEntry`**, con su especie y su
volumen. Todos comparten `gtfNumber` + `serforNumeroRegistro`: el grupo es la guía, y ya
hay índice por `gtfNumber` para recomponerlo.

No se inventa una tabla de "guía": el LO-CTP registra **por especie y producto**, no por
documento. Un ingreso por línea del documento ES el formato oficial.

### 2. La ficha la vuelve a pedir el SERVIDOR

El alta desde SERFOR viaja con el **N° de registro**, no con la ficha. El servidor la
consulta él mismo y registra lo que responde SERFOR.

Aceptar la ficha que manda el navegador sería aceptar cualquier ficha: un POST a mano
podría meter al libro una guía que no existe, con el sello de "verificado en SERFOR" puesto
por nosotros. La verificación que no hace el servidor no es verificación.

### 3. `WoodEntryTroza` — la troza como pieza

Cada renglón de la lista de trozas se guarda como fila propia, atada a su ingreso:
codificación, especie, dimensiones tal como las publica SERFOR, cantidad y volumen.

- Se indexa `codificacion` por tenant: se busca una troza y aparece de qué GTF entró.
- La especie viaja **en la troza**, no sólo en el ingreso: si una troza no matchea con
  ninguna especie de la guía, se engancha al primer ingreso del grupo pero **conserva su
  especie declarada** — el dato del documento nunca se pierde por una heurística nuestra.

### 4. Atómico: entra la guía entera o no entra nada

Los N ingresos + sus trozas se crean en **una transacción**. Media guía registrada es peor
que ninguna: deja un saldo que no corresponde a ningún documento y obliga a corregir a mano
un libro que ya tiene folio.

## Consecuencias

- El folio (`libroNro`) se asigna dentro de la misma tx, correlativo por cada ingreso: una
  guía de 2 especies ocupa 2 folios, como en el libro de papel.
- `volumeM3` de cada ingreso sale del **producto** de la guía; si la guía no lo declara, se
  cae al total de sus trozas. Si tampoco hay, la guía **no se registra automáticamente** y
  se avisa: no se reparte un total entre especies a ojo.
- Los ingresos ya cargados con el comportamiento viejo **no se migran**: llevan folio y
  pueden estar presentados. Se corrigen por anulación + recarga, que es lo que la norma
  prevé.

## Lo que NO se hace

- No se toca el modo de carga manual: sigue siendo un ingreso, una especie.
- No se deduce el volumen de una especie restando las otras del total.
- No se enumera el rango de N° de registro contra SERFOR para "encontrar" guías.
