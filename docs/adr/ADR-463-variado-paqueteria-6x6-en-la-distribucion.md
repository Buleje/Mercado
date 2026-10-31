# ADR-463 — «Variado»: la paquetería 6×6 mezclada se desglosa por medida y por especie antes de la distribución

- **Estado:** aceptado (2026-10-02); **punto 4 enmendado el 2026-10-03** (ver «Enmienda»). Sin cambio de schema.
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
4. ~~Las piezas desglosadas siguen siendo **paquetería**~~ → **enmendado 03-10:** cada pieza abierta lleva el tipo de SU medida (ver «Enmienda»).
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
- ~~Reclasificar las piezas a Angosta/Tabla: imposible para la matriz de reprocesos.~~ Adoptado el 03-10 (ver «Enmienda»).

## Enmienda (2026-10-03) — la pieza abierta lleva el tipo de su medida

- **Pedido (Brandon, 03-10):** «en rolliza, en los bloques distribuidos, esa paquetería… se pondrá distribuida por 1x3, 1x2, 2x2 etc y ya no se llamará paquetería sino de acuerdo a las medidas se pondrá su tipo si es larga angosta, corta etc, con su distribución de especies según volumen».
- **Decisión:** la pieza abierta toma `clasificarTipo` de su propia medida: con largo ≥ 6′, 1×3 y 1×4 son **Tabla** y 2×2, 2×3, 2×4, 1×2, 1.5×3 y 3×3 son **Larga angosta**; con largo < 6′ todas son **Corta**. El tipo viaja en la pieza, en el detalle de la tarjeta (`DesgloseGrupo.medidas[].tipo`), en la tabla «Medidas distribuidas», en el PDF/Excel y en «Aplicar el desglose al lote».
- **Reparto por especie con tipos:** cada pieza va sólo a las especies cuyos bloques ADMITEN su tipo («Lleva sólo»). Lo que le toca a cada especie es el área de cada tipo repartida según los pesos de ese tipo (lo libre de los bloques que lo admiten). Un tipo que ningún bloque admite deja la fila sin abrir (`sin-especies`). **Sin «Lleva sólo», el reparto es idéntico al anterior** (las 39 pruebas previas pasan sin tocarlas, salvo la que afirmaba el tipo).
- **Consecuencia aceptada (ADR-407):** una pieza abierta ya no es origen de un reproceso sugerido. Es coherente: un 1×3 o un 2×2 ya es la pieza final; el que se podía reprocesar era el paquete 6×6, que al abrirse deja de existir. Un bloque «Lleva sólo Paquetería» deja de recibir lo abierto: va a «Falta por distribuir» hasta que el bloque admita Tabla/Larga angosta/Corta.
