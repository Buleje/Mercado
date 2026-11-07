# ADR-459 — Plantación sin censo: el registro es la base

- **Estado:** aceptado (2026-10-02). Schema aditivo: migración `20261002_plan_species_plantacion`.
- **Relacionados:** ADR-126 (plan de manejo), ADR-305 (invariantes T1–T8 del Libro TH), ADR-454 (Extracción), ADR-455 (una plantación no reserva semilleros).
- **Pedido (Brandon, 02-10):** crear un plan de tipo plantación con los datos del registro —especie, nombre científico, m³ y otros— y trabajar con eso, sin censo; tala, trozado y salida descuentan del volumen.

## Contexto (medido, sólo lectura)

| Qué | Cifra |
|---|---|
| Blas `PO1` (PLANTACION, creado 02-10) | 0 especies · 0 censo · 0 asientos |
| Blas `19-SEC/REG-PLT-2025-096` (PLANTACION) | 0 especies · 65 censo · 4 talas (32,935 m³) · 2 trozados (6,61) · 2 despachos |
| `ForestPlanDB.balanceExtraccion` | leía las líneas de TODO el negocio: el plan `PO-2026-001` de Blas mostraba «fuera del plan» Copaiba 4,951 + Sapotillo 1,6592 m³ que son de la plantación 19-SEC |
| Extracción de una plantación sin censo | base = censo aprovechable = 0 → la primera tala ya marcaba «tope» (0 − talado) |
| T7 del despacho | comparaba el nombre como texto (sin mayúsculas): «Tornillo» contra «Tornillo (Cedrelinga catenaeformis)» se rechazaba; T6 buscaba el techo igual y, con el nombre distinto, **se salteaba** |
| Registro RNPF (`ForestPlantacionTramite`) en Blas | 1 borrador, 0 bloques |

Norma (ADR-455): una plantación registrada no lleva plan de manejo ni censo comercial (D.S. 020-2015-MINAGRI art. 16; D.S. 021-2015-MINAGRI art. 88). Lo que la identifica ante la autoridad es su registro: especie, superficie, año de instalación, volumen.

## Decisión

1. **El registro vive en `ForestPlanSpecies`.** Dos columnas nullable: `anioInstalacion Int?` y `superficieHa Decimal(12,4)?` (vacío = «no se sabe», nunca 0). El volumen ya existía (`volumenAutorizadoM3`; en pantalla, «m³ registrados»).
2. **Alta en un paso.** `POST /api/admin/forestal/plan` acepta `species[]` (máx. 60, sin repetir por clave) y crea plan + especies en UNA transacción (`ForestPlanDB.crearPlanConEspecies`, un `createManyAndReturn`). Respuesta `{ plan, species }`. La misma especie dos veces en un plan → 409 `especie_repetida` (en el alta, en `/plan/species` POST y al renombrar por PATCH). El Zod de una especie es uno solo (`lib/forestal/loth-plan-especie.ts`).
3. **El saldo del plan es del plan.** `balanceExtraccion` cuenta sólo las líneas con `planId` = el plan o sin plan. T6 cuenta lo movilizado con el mismo alcance.
4. **Una regla de especie para todo el libro:** `resolverEspecie` (`loth-constants.ts`): la especie del plan que le corresponde a la línea, por `claveEspecie` del común o, si no, por el científico cuando los dos lo traen. La usan T7 (tala y despacho), T6 (techo y movilizado) y `computeBalance` (`BalanceMovement`/`BalanceSpeciesInput.speciesScientific`). Si T7 aceptara por científico y T6 o el saldo no, «Cedro» (*Cedrela odorata*) pasaría contra el registro «Cedro rojo» (*Cedrela odorata*) sin techo ni descuento (revisión 02-10).
5. **T7 en la tala de una plantación.** Si el plan de la línea es plantación (`esPlanDePlantacion`) y tiene ≥ 1 especie, talar una especie que no está → 422 `T7_ESPECIE_NO_AUTORIZADA`: «La especie X no está en el registro de la plantación: agrégala en Plan de manejo → Registro». Sin especies registradas no frena (19-SEC sigue igual). Pasarse del volumen en la tala no frena: lo frena T6 al despachar («El registro de la plantación tiene X m³…»). Mismo camino para la tala de a una, la tala en tanda (POST por fila) y el despacho con guía: todos pasan por `enforceInvariants`. Una corrección es anular + línea nueva, que vuelve a pasar por ahí.
6. **El patio resta sólo lo que salió como troza.** `computeBalance` agrega `movilizadoTroza` a cada fila (`movilizado` sigue siendo el saldo SERFOR, con el producto); la cascada lo usa para «Trozas en patio»: el producto despachado sale de trozas ya contadas como consumidas.
7. **Quién escribe y qué queda escrito.** Alta/corrección/baja del plan y de sus especies: sólo admin o dueño (`soloAdminODueno`; `requireAdmin` dejaba pasar al encargado y el volumen es el techo de T6). Se auditan `ctp_plan_alta`, `ctp_plan_especie_alta|editar|baja` con el volumen antes → después. Dos altas de la misma especie a la vez se turnan con `pg_advisory_xact_lock` por plan. Plan o especie de otro negocio → 404; una línea del libro con un `planId` que no es del negocio o está de baja → 400 `PLAN_NO_EXISTE` (antes se saltaba T6/T7).
8. **Extracción.** En una plantación con especies registradas, la especie sin censo aprovechable toma lo registrado como base del saldo por operación (`contra: "autorizado"` → pasarse es `exceso`). `FilaExtraccion.baseSaldo = { m3, contra }`; los KPIs (extraído, por talar) leen esa base. Los avisos «medido sobre el censo» y «autoriza más de lo que el censo sostiene» no salen contra un censo que no existe.

## Alternativas descartadas

- **Importar el registro desde el trámite RNPF** (`ForestPlantacionTramite`): en Blas hay 1 borrador con 0 bloques; hoy no aporta nada que importar.
- **Bloquear la tala por volumen:** la tala se mide con cinta y el registro es una estimación; frenar en la tala detendría el monte por un redondeo. El techo legal es lo que sale (T6 al despachar), como en bosque natural.
- **Modelo nuevo `ForestPlantacionRegistro`:** duplicaría lo que ya es una especie del plan (volumen, científico, CITES, precio) y obligaría a cada lector (saldo, extracción, T6, T7, costeo) a mirar dos tablas.
- **T7 en la tala también para bosque natural:** ahí la tala la juzgan el censo y el DMC (T8); el pedido es la plantación.

## Consecuencias

- `PO-2026-001` de Blas deja de mostrar 6,61 m³ ajenos «fuera del plan». `PO 12` de `main` no cambia (sus 7 líneas son todas del plan): Tornillo 80 · talado 5,003 · trozado 4,887 · movilizado 2,761 · saldo 77,239.
- T6 se vuelve más estricto con nombres escritos distinto (antes se salteaba) y más justo entre planes (antes el despacho de otro plan con la misma especie le comía el techo).
- El dev server vivo tiene el cliente Prisma viejo: hasta reiniciarlo, el alta con `anioInstalacion`/`superficieHa` da 500.
- **Pendiente (revisión 02-10, no arreglado):** las líneas SIN plan (`planId IS NULL`) cuentan en el saldo de TODOS los planes del negocio (balance, T6 e informe). Con dos planes de la misma especie, una tala sin plan descuenta de los dos. Arreglarlo pide atribuirlas por su árbol como hace la Extracción (`atribuirLineas`).
- **Pendiente:** la Extracción agrupa por el nombre común (sus líneas no traen el científico); «Cedro» contra «Cedro rojo» sale ahí como «parecida», no como la misma.
- Revertir: `ALTER TABLE "ForestPlanSpecies" DROP COLUMN IF EXISTS "anioInstalacion", DROP COLUMN IF EXISTS "superficieHa";` (contar antes las filas con dato).
