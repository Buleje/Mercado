# ADR-452 — Guía del Libro TH: serie por región, talonario por titular, lista numerada y placa oficial

**Estado:** Aceptado y construido (2026-09-29).
**Relacionados:** ADR-442 (guía del Libro TH guardada en el CTP), ADR-446 (talonario de la GTF de salida del CTP), ADR-450 (recibir contando), memoria `numero-de-guia-tramo-a-tramo`.

## Contexto

Brandon (29-09), en «Despachar trozas con guía» del Libro TH: el N° de GTF correlativo según la región (Pasco), el punto de partida con dirección y ubigeo, la lista de trozas y la GTF de origen automáticas, y la placa con el formato oficial «para evitar inventados».

Medido antes de construir:

- SERFOR (FAQ de la GTF): los primeros dígitos del talonario son el **código de ubigeo del departamento**. Las guías reales de la base lo confirman: `019-001-0000003/4` (Pasco, ATFFS Selva Central), `010-001-…` (Huánuco); la Ficha CTP de Blas escribe `19-001`. SERFOR también publica talonarios de dos tramos: `019-0000001` (C.N. San Luis de Chinchihuani).
- **Cada titular tiene su propio talonario** con la misma serie: el mismo mes, la planta de Blas iba por 054…064 en `19-001` y la comunidad Chivis usaba 003 y 004 en `019-001`. El N° solo no identifica una guía.
- La lista de trozas tiene **su propio correlativo** y una guía lleva varias hojas: la guía 3 (34 trozas) lleva las listas «5, 6»; la guía 4 (31 trozas), «7, 8».
- Ninguna troza del Libro TH llega con una guía anterior: sale del bosque. La consulta de SERFOR de las guías del bosque no publica GTF de origen.
- Había placas guardadas que no pueden existir: «WRFWR242», «W3242G», «QA-450». Las reales de SERFOR tienen 3 caracteres + 3 números (`V2H-901`, `W2D-853`).

## Decisión

1. **Serie por región.** El primer tramo es el código INEI del departamento del plan, a 3 dígitos, como imprime SERFOR (`lib/forestal/gtf-serie-region.ts`). El segundo tramo sale de lo que el sistema ya vio en esa región; si no hay nada, `001`. El departamento se resuelve con el padrón; ante homónimos manda el distrito. Sin departamento conocido no se arma serie: no se inventa.
2. **Talonario por titular.** El siguiente número es el máximo + 1 de lo usado **por el mismo titular** en esa serie. Cuentan las guías del Libro TH (anuladas incluidas), las guías de SERFOR guardadas y las que entraron como ingresos (`WoodEntry.serforGtf`), comparando tramo a tramo. Sin historia, se tipea sólo el correlativo impreso: nunca se propone `0000001`.
3. **«¿Es la misma guía?»** = N° normalizado + mismo titular o permiso (`mismoTitular`: primero el título, luego el nombre con las abreviaturas CCNN/C.N./SAC expandidas y 1-2 letras de tolerancia en palabras largas). El duplicado que **bloquea** es el del mismo titular, o cuando a alguno de los dos le falta el titular. Si el N° lo usa **otro** titular, sólo se avisa. Si una búsqueda encuentra dos candidatas de dueños distintos y no sabe el titular, responde **«ambigua»**, nunca la primera (`elegirGuiaDelDueno`: guardadas, puente TH→CTP, `findByNumber`, «¿ya entró?»). El candado `pg_advisory_xact_lock` va sobre el N° normalizado en las dos escrituras. El titular que se guarda lo calcula el **servidor** desde el plan de las trozas.
4. **Número de otra región** que la del plan: 409 `serie_de_otra_region` hasta que el operador lo confirme, igual que el salto de correlativo.
5. **Lista de trozas** con correlativo propio (`lib/forestal/loth-lista-numero.ts`): 20 trozas por hoja (lo que cabe en una A4; la evidencia de SERFOR acota entre 17 y 30). Cada hoja impresa es una lista con su N°. Un texto de lista que no es un rango claro («L-19-0300920») se respeta tal cual.
6. **GTF de origen** en la guía del bosque: se muestra «No aplica · sale del bosque» y se imprime «NO APLICA» (un casillero en blanco de una declaración jurada se puede llenar después), pero **no se guarda** ese texto en `gtfOrigenNro`, que otras rutas leen como N° de guía. Si la madera sí viajó antes con otra guía, se elige esa guía de una lista del sistema.
7. **Partida y llegada desarmadas** en `traslado.partida` y `traslado.llegada` (dirección, departamento, provincia, distrito), en el esquema compartido de la GTF. `puntoPartida`/`puntoLlegada` siguen siendo el texto impreso: los rearma el servidor con `componerPunto`, en el orden que publica SERFOR. Las guías viejas se leen igual.
8. **Placa oficial** (`lib/forestal/placa-peru.ts`): vehículo mayor y remolque = letra de zona + 2 alfanuméricos + 3 números; moto sólo escrita `AB-1234`; en río no se valida (matrícula). En las guías de **salida**, una placa imposible frena imprimir (y registrar en el Libro TH, donde la guía no se corrige después). En las guías de **ingreso** es sólo un aviso: es el papel de un tercero y se transcribe tal cual.
9. **«Buscar placa»** junta lo que el negocio ya sabe de esa placa (Directorio, guías del Libro TH, despachos del CTP, guías de SERFOR vivas) y rellena sólo lo vacío. La consulta a SUNARP (json.pe) es opcional con `PLACA_API_TOKEN`: tiene un tope por negocio (`PLACA_API_TOPE_DIA`/`_MES`) y caché (Upstash o una sola clave `interno:` de ≤500 placas). Las claves `interno:` no salen en la lectura general de configuración.

## Consecuencias

- Dos titulares con el mismo N° conviven en el libro. El índice único (tenant, N°) de las guías guardadas vivas todavía impide guardar las dos a la vez: cambiarlo es una migración pendiente.
- El plan de Blas tiene «Constitucion» donde va el departamento; se resuelve por el distrito, pero conviene corregirlo a Pasco.
- La consulta a SUNARP no está probada con un token real.

## Alternativas descartadas

- **Comparar el N° solo** (lo que había): unía guías de dos comunidades y anulaba las líneas de la otra.
- **Guardar «NO APLICA» en `gtfOrigenNro`**: contaminaba un campo que se lee como número de guía.
- **Bloquear la placa inválida en el ingreso**: obligaba a «corregir» el papel de un tercero.
