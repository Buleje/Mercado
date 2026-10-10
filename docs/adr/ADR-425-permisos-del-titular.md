# ADR-425 — Un titular, varios permisos: el papel se elige, no se tipea

- **Estado:** aceptado
- **Fecha:** 2026-09-21
- **Contexto forestal:** Libro TH (LO-TH) · Directorio (ADR-317/424) · Contratos (ADR-421)

## Contexto

Pedido de Brandon (2026-09-21), sobre el alta de plan del LO-TH:

> «quiero la facilidad de agregar directorios nuevos como CCNN pero poder
> agregar de una misma comunidad diferentes permisos que maneja y áreas de
> manejo, ahí agregar el plan de manejo […] al escoger directorio de una CCNN,
> al presionar, me aparecen otras opciones de qué permiso usar […] en los
> campos que son para rellenar, donde se pueda poner opciones, que sea más
> fácil».

Tres hechos medidos en el tenant real (Blas) el mismo día, antes de escribir
código:

| Qué se midió | Resultado |
|---|---|
| Permisos cargados (`ForestContrato`) | 6 · **`titularId` nulo en 6 de 6** |
| Permisos con área de manejo | **0 de 6** (`areaHa` nulo) · con vigencia 0/6 · con plan 0/6 |
| Región escrita a mano en un plan real | `"Constitucion"` — es una ciudad, no un departamento |
| ARFFS escrita a mano | `GERFOR Ucayali` · `ATFFS SELVA CENTRAL` · `ATFFS SELVA CENTRAL - SEDE PUERTO BERMUDEZ` |

La ficha del Directorio (`ForestParty`) guarda **un** `tituloHabilitante`, **una**
`resolucion` y **un** `planManejo`: el segundo permiso de una comunidad pisaba
al primero. Y el alta de plan pedía esos mismos datos tipeados otra vez.

## Decisión

**El permiso de un titular es un `ForestContrato` atado por `titularId`. No se
crea ninguna tabla.**

`ForestContrato` (ADR-421) ya modela exactamente lo que el pedido describe:
código, tipo de papel, resolución con fecha, ARFFS, región, **`areaHa`**,
vigencia y `planId`. Lo que faltaba no era el modelo: era **llenar la columna
que ya existía** y darle pantalla.

1. **Ficha del Directorio → sección «Permisos y áreas de manejo»**
   (`CtpPartePermisos`). Lista los permisos del titular, los agrega y los edita
   sin salir de la ficha. Tres estados con trato distinto:
   - **suyos** (`titularId` = la ficha) — se editan ahí;
   - **candidatos** — mismo nombre o parecido y sin dueño. Se ofrecen para atar
     **en un clic y nunca solos**: la ficha dice «COMUNIDAD SANTA ROSA DE
     CHIVIS» y el papel «COMUNIDAD **NATIVA** SANTA ROSA DE CHIVIS», y dos
     comunidades pueden llamarse parecido y ser dos (misma vara que
     `partesParecidas`, ADR-317);
   - **pendientes** — cargados durante el alta, cuando todavía no hay id al que
     colgarlos; se crean cuando el servidor devuelve la ficha.
2. **Elegir un titular pregunta con qué permiso** (`DirectorioPicker`,
   `conPermisos`). Con dos o más, un segundo paso los lista con lo que los
   distingue: código, qué papel es, **cuánta área** y hasta cuándo vale. Con uno
   solo no se pregunta —sería un clic para confirmar lo obvio— y siempre queda
   «Sólo los datos de la ficha».
3. **El permiso llena el alta del plan** y lo dice: título habilitante,
   resolución con su fecha, ARFFS, región, área y vigencia. Nunca pisa lo ya
   escrito, y el formulario enumera qué completó.
4. **El plan creado se ata al permiso** (`ForestContrato.planId`), columna que
   existía desde ADR-421 sin un solo uso. Si el atado falla, el plan ya está
   creado y se avisa: no se pierde el alta.
5. **Lo que se puede elegir, se elige.** Región → los 25 departamentos
   (`lib/peru-ubigeo`). ARFFS → **lo que este negocio ya escribió**, ordenado
   por uso, con «Otra…» siempre a mano.
6. **El plan de manejo no se pregunta aparte: lo decide el papel.** Permiso en
   comunidad nativa → DEMA; predio privado → PMFI; plantación → su registro;
   concesión → Plan Operativo (RJ 001-2018-OSINFOR, D.S. 018-2015-MINAGRI). El
   formulario del permiso lo muestra; el tipo del plan se propone y se puede
   cambiar.

## Consecuencias

- Sin migración: cero riesgo de schema, y los 6 permisos existentes se pueden
  atar desde la ficha sin volver a cargarlos.
- El texto del papel (`ForestParty.tituloHabilitante`, `originCode`) **no se
  toca**: eso es lo que se declara ante SERFOR. El vínculo es interno (misma
  regla que ADR-421).
- `TIPOS_CONTRATO` / `ESTADOS_CONTRATO` pasan a ser single source en
  `lib/forestal/contratos.ts`: las rutas los validan con `z.enum` contra la
  misma lista que recorre el selector. Había tres copias.
- Un catálogo cerrado de ARFFS **no se inventa**: no existe uno verificable
  entero, y el módulo prefiere faltar una opción a linkear una sin confirmar
  (mismo criterio que `ARFFS_MESA_PARTES`).
- Los permisos viven detrás de `spec:forestal:ctp-libro` y el Libro TH detrás de
  `spec:forestal:loth-libro`: un tenant con uno y no el otro recibe 403, que
  **no es un error que mostrar** — el bloque simplemente no aparece.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Tabla nueva `ForestPartyPermiso` | `ForestContrato` ya tiene los 9 campos y la plata colgada. Serían dos verdades del mismo papel. |
| Repetir `tituloHabilitante` como array en `ForestParty` | Un permiso tiene área, resolución y vigencia propias: un array de strings los pierde. |
| Atar los candidatos automáticamente por nombre | «SANTA ROSA DE CHIVIS» matchea de más. Atar mal un permiso mueve plata al contrato equivocado. |
| Lista cerrada de ARFFS | No hay fuente oficial verificable completa; inventarla es declarar una autoridad que no aprobó nada. |
| Preguntar el permiso con uno solo cargado | Un clic para confirmar lo obvio. Se elige solo y se muestra cuál fue. |

## Ronda 2 (mismo día): completar, eliminar y aprovechar lo que ya se guarda

Tres pedidos de Brandon sobre lo entregado:

1. **Completar los 6 permisos de Blas** → panel «qué le falta a tus permisos» en
   la vista Contratos, que los lista con lo que les falta en palabras y deja
   completarlo ahí (área, vigencia, ficha del titular) proponiendo la ficha
   candidata por nombre, sin atar sola.
2. **Poder eliminar lo creado, con aviso de confirmación** → baja de fichas
   desde el propio picker y baja de permisos desde la ficha. La del permiso es
   **lógica** (`deletedAt`, el índice único es parcial: el código se puede volver
   a cargar) y **dice antes cuántos documentos cuelgan** (`ForestContratoDB.usos`,
   `GET …?usos=1`): dar de baja un permiso con 24 ingresos imputados no es lo
   mismo que uno recién cargado. Lo imputado nunca se borra.
3. **Más campos en el alta de plan, para aprovechar la información** → lo que el
   modelo YA guardaba y el formulario no preguntaba:
   - la **UIT de referencia viajaba invisible con 5350** — el plan del año
     siguiente nacía con la UIT del anterior y nadie podía verlo;
   - las **observaciones** (`notes`) no tenían dónde escribirse en ninguna
     pantalla;
   - el **estado** (para cargar un plan viejo como cerrado, sin ensuciar los
     vigentes);
   - los **tres costos por m³**, que alimentan el margen de Analítica — es el
     mismo campo que se edita allá, no otra verdad, y decirlo es parte del bloque.
   - **«Copiar de un plan anterior»**: trae lo que se repite (titular, ARFFS,
     región, regente, UIT, costos) y **nunca** lo que identifica al documento
     (número, resolución, parcela, vigencia). Copiar una resolución sería
     declarar un papel que no es el que se está cargando.

Verificado en navegador con datos reales: la copia trajo «titular, ARFFS,
región, costo de extracción, costo de transformación, costo de flete», el
plegado dice «UIT S/ 5350 · 3 de 3 costos por m³ · Vigente», y el plan creado
guardó los tres costos y la observación.

**Gotcha que costó una vuelta:** juntar los rótulos de «qué se completó» dentro
del updater de `setState` los duplica — React invoca los updaters dos veces en
desarrollo. El aviso salió «se completaron: título habilitante, título
habilitante» en el navegador y ningún gate estático lo vio. Las dos reglas de
llenado viven ahora en módulos puros con test.

## Referencias

- `lib/forestal/permisos-de-parte.ts` (módulo puro) · `__tests__/forestal-permisos-de-parte.test.ts` (19 casos)
- `components/admin/forestal/CtpPartePermisos.tsx` · `DirectorioPicker.tsx` · `LothPlanForm.tsx` · `campos-elegibles.tsx`
- `hooks/use-permisos-forestal.ts` · `lib/forestal/loth-plan-alta.ts` · `components/admin/forestal/LothPlanFormCosteo.tsx`
- `__tests__/loth-plan-copiar-del-anterior.test.ts` (8 casos) · `__tests__/forestal-permisos-pendientes-del-alta.test.ts` (8 casos)
- ADR-421 (el contrato como eje) · ADR-424 (ficha del Directorio) · ADR-423 (documentos de gestión y regente)
