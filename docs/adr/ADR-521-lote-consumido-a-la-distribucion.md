# ADR-521 — Un lote ya consumido va a la Distribución y declara su corrida desde el bloque

- **Estado:** aceptado (2026-10-27). Sin schema.
- **Pedido por:** Brandon (27-10): «implementa función para llevar de frente al cubicador en distribución para que se distribuyan en bloque y trabajen directamente mejor».
- **Relacionados:** ADR-520 (lote pegado del SNIFFS, ya consumido), ADR-519 (Recorrido del permiso), ADR-464 (de la Distribución al Libro, jornada por jornada), ADR-326 (T1, consumo por pieza), ADR-364 (partir una corrida), ADR-412 (cobro del aserrío).

## Contexto
ADR-520 deja el lote consumido con UNA corrida abierta: piezas consumidas, `quantity` vacía, «producción por declarar». En Blas, el lote 28-2026 (13 trozas, 31,476 m³, TORNILLO) quedó con la corrida N° 7 así. Para declararla había dos caminos y ninguno servía:

- La Distribución de rolliza rechaza las trozas («ya entraron a una corrida»): no se podía repartir lo aserrado de ese lote en el cubicador.
- La tabla del Libro declara la corrida a mano: sin el reparto del cubicador ni sus paquetes.

## Decisión
- **Un bloque por lote que ADOPTA su corrida abierta.** `GET /api/admin/forestal/lotes-aserrio/bloque-para-distribucion?loteId=` arma el bloque con la función pura `bloqueDeLoteConsumido`. El bloque lleva:
  - las trozas de la corrida (`trozaIds` = `trozasElegidas`, así el paso «Trozas» del Recorrido no frena);
  - `dias: 1` y la fecha de la corrida;
  - `corridaIds: [id]` y una jornada `abierta`.

  El hook `useLlevarLoteADistribucion` siembra el bloque en la hoja de rolliza y abre los Resúmenes del cubicador.
- **Sólo si es inequívoco.** Si no, responde 409 con el camino a seguir:
  - `LOTE_NO_CONSUMIDO`: el lote no está consumido;
  - `SIN_CORRIDA_ABIERTA`: no tiene corrida abierta;
  - `VARIAS_CORRIDAS_ABIERTAS`: tiene más de una;
  - `CORRIDA_CON_OTRAS_PIEZAS`: la corrida comió piezas de otro lote;
  - `DEMASIADAS_TROZAS`: más trozas de las que admite un bloque.
- **El plan del Libro** (`planLibroDeBloque`) reconoce la corrida adoptada: es la que consumió EXACTAMENTE las trozas del bloque (`corridaEsDelBloqueEntero`).
  - El día lleva esas trozas y el mismo tope del 56 % que mide el servidor, sobre la materia prima de la corrida.
  - Queda `declarable` si hay aserrada repartida y entra en el tope.
  - Si no, dice por qué: sin aserrada, pasa el tope, o la aserrada está en más de un día («la corrida es un día: junta los días»).
- **El Recorrido** muestra «Declarar la corrida N° X» como paso pendiente, en vez de `CORRIDA_ABIERTA` con problema. El `POST …/recorrido` llama a `ForestJornadaBloqueDB.declararJornadaAbierta`, que:
  - le declara la producción a ESA corrida (no abre otra ni consume) con los paquetes del cubicador;
  - anota el día como `declarada` en la misma transacción (`escribirEnBloque`);
  - exige que la corrida sea de producción, registrada, viva y con exactamente las piezas del bloque, y vuelve a contarlas bajo la transacción (si no: `LINEA_NO_EDITABLE` / `CORRIDA_NO_ES_DEL_BLOQUE`);
  - trata un reintento sobre una corrida ya declarada como `yaEstaba` (sólo anota).

  La ruta rechaza además `CORRIDA_DE_OTRO_BLOQUE` y `UN_SOLO_DIA`.
- **Dos declaraciones a la vez, una sola.** `declararProduccionEnTx` toma la corrida con `updateMany` y `quantity: null` en el WHERE: el que llega segundo recibe `CORRIDA_YA_DECLARADA`. El «Declarar» del Libro también corre ahora en una transacción, así que la toma y los paquetes quedan juntos o no queda ninguno.

## Alternativas descartadas
- **Distribuir antes de consumir:** importar el lote sin consumirlo y que la Distribución lo consuma por día. Contradice ADR-520: el SNIFFS ya lo dio por consumido en una fecha, y la corrida del libro tiene que decir lo mismo.
- **Partir la corrida con ADR-364:** un día por pedazo. La corrida es UN consumo real del SNIFFS, y partirla inventa jornadas que no existieron. Además, una troza no se parte entre dos corridas (T1). Si la aserrada se reparte en varios días, la ruta pide juntarlos.

## Consecuencias
- Sin migración: el bloque vive en la clave `ctp-distribuciones:{tenantId}`, como cualquier otro, y la corrida es la que ya existía.
- `declararProduccionEnTx` es el camino de «Declarar» del Libro (`lib/db/forest-ctp.db.ts`): cambiar su toma toca a todos los que declaran. Necesita una pasada de `security` y de `reviewer`.
- Un lote cuya corrida comió piezas de otro lote sigue declarándose desde la tabla del Libro: el bloque no declara madera que no es suya (I1).
- Si el lote ya estaba en la hoja de rolliza, no se duplica (`unirSiembra` lo da por repetido) y el botón lo dice: un bloque sembrado ANTES de consumir no tiene la corrida y no la adopta.
- Cambia también el estado de distribuciones que no vienen de un lote importado: un bloque de un día cuya jornada quedó `abierta` (el Libro de bloques consumió y falló la declaración) pasa de «declárala desde el Libro» a «Declarar la corrida N° X» en el Recorrido. Es la misma corrida y la misma regla; las dos puertas siguen valiendo y la segunda recibe `CORRIDA_YA_DECLARADA` (revisión 27-10).
- Pendiente fuera de este ADR: `corregirLinea` (`forest-ctp.db.ts`) puede poner `quantity` a una corrida abierta sin el tope del 56 % ni paquetes; conviene que remita a «Declarar».
