# ADR-463 — «Variado»: la paquetería 6×6 mezclada se desglosa por medida y por especie antes de la distribución

- **Estado:** aceptado (2026-10-02). Sin cambio de schema.
- **Relacionados:** ADR-405 (Anexo 04 por jornada), ADR-407 (matriz de reprocesos), ADR-410 (catálogo de especies); memoria `cubicacion-reparto-rolliza-aserrada`.
- **Pedido (Brandon, 02-10):** «en especie una opción VARIADO… se usa solo para paquetería de 6x6; en cada paquetería entran 2x2, 2x3, 2x4, 1x4, 1x3, 1x2, 1.5x3, 3x3 (1.5x3 y 3x3 entran poco)… en el bloque de distribución las medidas se desglosarán de acuerdo a las especies (entre más volumen del permiso, más de esa especie) y de 6x6 a esas medidas en el anexo hasta que cuadren los volúmenes… y excepciones de especies que no van a aplicar».

## Contexto (medido)

- Un paquete 6×6×L del cubicador es una fila de paquetería (larga si L ≥ 6′, corta si no) que da 3·L PT. En Blas: 3 cubicaciones, 700 filas, **47 filas 6×6 = 1 596 paquetes**, todas anotadas como Tornillo porque no había otra forma de decir «mezclado».
- El reparto (`lib/forestal/cubicacion-reparto.ts`) separa estricto por especie: una especie «Variado» quedaría sin rolliza y caería como aserrada huérfana.
- El Anexo 04 se arma desde la distribución y conserva el tipo de cada pieza.

## Decisión

1. **Especie «Variado»** al final de la lista del cubicador; no entra al catálogo de especies (ADR-410) y no se puede crear una especie con ese nombre.
2. **Desglose de medida** (puro, `lib/forestal/variado-desglose.ts`): N paquetes 6×6 → piezas ENTERAS de las medidas permitidas, con pesos Normal (3) / Poco (1) / No entra (0). Se cuenta en medias pulgadas² para que la SECCIÓN cierre exacta (Σ espesor×ancho×piezas = 36·N); el PT sólo se mueve por el redondeo de cada fila (≤ 0,005 PT).
3. **Reparto por especie** proporcional a lo LIBRE de cada especie en la distribución (capacidad − su aserrada no-Variado; si ninguna tiene libre, la capacidad), en piezas enteras, cada especie a menos de una pieza de su parte. Las especies exceptuadas pesan 0.
4. Las piezas desglosadas siguen siendo **paquetería** (tipo forzado del paquete): reclasificarlas las volvería imposibles para la matriz de reprocesos (ADR-407).
5. Se engancha en `ResumenReparto.tsx` antes del reparto; **el motor del reparto no cambia**, así que bloques, capacidad, PDF/Excel y Anexo 04 trabajan con las piezas ya desglosadas.
6. El reparto por especie es un **derivado**: la pantalla y el papel dicen «repartido por proporción» (regla `verificacion-de-verdad` §2).
7. «Enviar al Libro» y el Anexo 04 del cubicador se bloquean mientras quede alguna fila Variado sin desglosar.
8. La configuración (medidas con su nivel + especies exceptuadas) vive en localStorage por negocio (`slugKey("-variado")`), como la del lote.

## Consecuencias

- Cero DDL; el motor del reparto (2 564 líneas) no se toca.
- Con otra configuración, la misma distribución sale distinta: la distribución guardada no lleva copia de la config (pendiente si hace falta congelarla).

## Alternativas descartadas

- Un parámetro nuevo en `distribuirPorCapacidad`: mete el Variado en el motor del reparto.
- Un bloque de rolliza «Variado»: lo mostraría como especie huérfana y no cuadraría con ninguna GTF.
- Reclasificar las piezas a Angosta/Tabla: imposible para la matriz de reprocesos.
