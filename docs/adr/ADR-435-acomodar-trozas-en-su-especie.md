# ADR-435 — Acomodar trozas en su especie

- **Fecha:** 2026-09-25
- **Estado:** Aceptado
- **Ámbito:** la lista de trozas de las guías de VARIAS especies en el Libro CTP → Ingresos: quién la carga (`WoodEntriesDB.agregarTrozas`, `WoodEntriesDB.create`, `repartirGtfEnIngresos`) y la corrección de lo ya cargado (`AcomodarTrozasDB`)
- **Contrato:** `lib/forestal/acomodar-trozas.ts` (`filaDeEspecie`, `colocarAlCargar`, `planearAcomodo`), `lib/db/acomodar-trozas.db.ts`, `GET|POST /api/admin/forestal/wood-entries/acomodar-trozas`, auditoría `ctp_ingreso_trozas_acomodar`

## Contexto

Una GTF con N especies se asienta en N filas `WoodEntry` (una por especie, con su m³ y sus piezas declaradas). Su lista de trozas llegó a colgar entera de UNA de esas filas.

Medido el 25-09 en Blas (sólo lectura): en el permiso 10-HUA-PUE/PER-FMP-2026-007, **29 de 46 trozas** están en la fila de otra especie, en sus 8 guías. Ejemplo: la troza 115-A (Cachimbo, 2,808 m³) cuelga de «0000005 Copal», que declara 1,752 m³. Ninguna de las 21 filas tiene tantas trozas como piezas declara.

**Dónde nació**: la importación del inventario del SNIFFS («Sheet1», 24-09 05:09, 8 renglones `ctp_ingreso_trozas_add`). Las guías ya existían (registradas desde SERFOR el 08-09, una fila por especie). El importador completó sus piezas por `idByGtf`, que devuelve UNA fila por GTF, y `agregarTrozas` le colgó las siete de la 0000005 a esa fila. Además, la deduplicación era por fila: re-importar el mismo archivo con otra fila elegida habría duplicado la lista.

Consecuencias: el consumo por pieza agrupa por `woodEntryId` y el tope I2 es por fila, así que la tanda se corta y el m³ cae en la especie equivocada. La vinculación desde el permiso frena esas trozas («hay que acomodarlas en Ingresos»). La ficha del permiso (ADR-432) sólo las reasigna al LEER.

## Decisión

1. **Una sola regla de especie** (`filaDeEspecie`): `claveEspecie` (sin tildes, sin mayúsculas, sin el binomio entre paréntesis), la misma que usa la ficha del permiso. Si no hay nombre común que coincida, se usa el científico. Con dos filas de la misma especie desempata el científico. Si aun así no alcanza, la troza se queda donde está: no se elige a ojo. **Nunca cruza de GTF.**
2. **Al cargar** (`colocarAlCargar`), cada troza nueva va a la fila de su especie de la misma guía, pero **sólo si esa fila la aceptaría por sí sola**: pendiente, o validada cuando la importación completa una guía que no tiene lista, y nunca de un mes cerrado. Si no, se queda en la fila de la carga, como antes, y el resultado lo dice (`fueraDeSuFila`, línea « · AVISO: » en el reporte del importador). Aplica a:
   - `agregarTrozas`: importación que completa la lista y alta manual de piezas. La deduplicación y el «ya tiene su lista» ahora son **de la guía entera**, no de la fila.
   - `create`: alta de UNA fila con lista. Las piezas de otra especie van a una fila hermana pendiente; si esa fila ya tiene la misma codificación, la pieza no entra y se avisa («ya estaban en la fila de su especie: no se duplicaron»).
   - `repartirGtfEnIngresos` (alta desde SERFOR): mismo criterio. Antes, dos productos con el mismo nombre común recibían **las mismas** trozas (duplicadas en los dos ingresos).
3. **«Acomodar trozas»** para lo ya cargado: primero la vista previa (`GET`: qué troza pasa de qué fila a cuál, qué no se mueve y por qué, y por fila «trozas vs piezas declaradas» y «m³ de trozas vs m³ declarado»). Después, aplicar (`POST` con los ids que se vieron). Alcance: una guía, un permiso o todas.
4. **Qué no se mueve** (se lista con su motivo):
   - lo **consumido** o **despachado** por una corrida o despacho VIVO. Su m³ ya está en `ForestCtpConsumo` de la fila donde está. Mover la pieza sin el m³ partiría las dos caras del mismo hecho.
   - lo que está en un **lote de aserrío abierto** («está en el lote X, sin aserrar todavía»). `consumir` y `sumarACorrida` anotan los m³ por fila en una transacción y marcan la pieza en otra, sin bloquear las trozas: si Acomodar corriera entre las dos, el m³ quedaría en la fila vieja y la pieza en la nueva (hallazgo de la revisión).
   - una fila de un **mes cerrado**, con **costo congelado**, **anulada** o **rechazada**, ni para sacar ni para poner.
   - **retrozadas**: la troza se mueve con su **familia entera** (la madre y todos sus pedazos) a la fila de la especie de la madre. Si un pedazo está consumido o despachado, o el corte cae en un mes cerrado, la familia completa se queda. Se decidió así porque bloquear toda retrozada dejaría sin arreglo justo las piezas que se están trabajando. Y mover sólo la madre partiría la familia en dos filas: el Apartado 2 mostraría pedazos bajo una especie cuya madre está en otra.
5. **Qué no se toca nunca:** `ForestCtpConsumo`, el m³ y las piezas declaradas de cada fila, y `orden` (la posición en la lista de la GTF: la guía reimpresa sale igual).
6. **Carrera**: `aplicar` repite todo dentro de la transacción con las trozas bloqueadas (`FOR UPDATE ORDER BY id`), **sólo las de guías de 2+ filas** (con «todas» no se bloquea el patio entero). El `updateMany` lleva `tenantId` y las filas de la MISMA guía en el WHERE. El cliente manda lo que vio como pares **troza → fila de destino**:
   - si el destino de una ya no es el de ahora, o una familia de retrozado no se puede mover entera, se tira un error DENTRO de la transacción y **no se mueve nada** («la guía cambió desde la vista previa»);
   - lo que ya no está para mover (se consumió, se despachó) no se mueve y se cuenta en `yaNoSePudieron`.
7. **Auditoría:** un renglón `ctp_ingreso_trozas_acomodar` por guía, **esperado antes de responder** (`auditCtpEsperando`). Dice cuántas trozas pasaron de qué especie a cuál, el m³ y los ids para deshacer: `troza[+pedazos] filaOrigen→filaDestino`. Se invalidan `wood-entries`, `forest-ctp` y `forest-contrato`, y en el cliente `invalidarCtp()`.

## Consecuencias

- Simulado sobre Blas (sólo lectura, la función de producción con las filas reales): **29 trozas (76,706 m³) pasan a su fila** en 8 guías. **0 quedan quietas y 0 sin fila.** Filas con trozas = piezas declaradas: **0 → 21 de 21**. Nada se movió en Blas: acomodar es un clic de su dueño.
- Los consumos existentes no cambian. En Blas no hay ninguno vivo sobre esas trozas. Donde lo haya, la troza consumida se queda y la ficha del permiso sigue repartiendo su m³ al leer (`repartirConsumo`).
- La vinculación deja de frenar por «otra fila» las trozas acomodadas.

## Alternativas descartadas

- **Migración silenciosa** (un script que mueve todo): atar una troza a una fila es una declaración del libro, y la hace su dueño con un clic que ve antes de confirmar.
- **Mover también el m³ de los consumos** (`ForestCtpConsumo`): reescribe consumos ya declarados, quizá de meses presentados. La reasignación al leer (ADR-432) ya cubre la vista.
- **Bloquear toda troza retrozada**: ver decisión 4.
- **Elegir la primera fila de la especie** cuando hay dos: una troza de Cumala *Virola* terminaría en la fila de Cumala *Iryanthera*.
- **Partir una guía NUEVA del inventario en una fila por especie** al importar: crea folios y un m³ «declarado» que el archivo no declara por especie. Hoy la fila se crea y las trozas de otra especie se avisan (0 casos en los datos reales al 25-09). Queda anotado como mejora.
