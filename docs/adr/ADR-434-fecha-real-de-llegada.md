# ADR-434 — Fecha real de llegada: una fecha por guía y «Corregir la recepción»

- **Fecha:** 2026-09-25
- **Estado:** Aceptado (pedido de Brandon del 25-09, a partir de lo que encontró ADR-433)
- **Ámbito:** Libro CTP → Operación → Ingresos: «Recibir en bloque», la fila de la guía y el aviso de la vista; `PATCH /wood-entries` (`recepcionar_guia`) y el endpoint nuevo `GET|PATCH /wood-entries/recepcion`
- **Contrato:** `lib/forestal/fecha-de-llegada.ts` (`propuestaDeLlegada`, `problemaDeLlegada`, `avisosDeCorridas`, `avisoDePlazo`, `choquesConLaSierra`, `revisarLlegada`, `llegadaSospechosa`), `lib/db/forest-recepcion.db.ts` (`contexto`, `corregir`, `revisarAntesDeRecibir`, `exigirLlegadaCompatible`), acción de auditoría `ctp_ingreso_recepcion_corregida`

## Contexto

«Recibir en bloque» pedía UNA fecha para todas las guías marcadas y proponía hoy (`CtpRecepcionBloqueModal.tsx:69`, `useState(hoyLocal())`). Medido en Blas el 25-09 (lectura, `BEGIN READ ONLY`):

- Las 8 guías 010-001-0000005…0000014 del permiso **10-HUA-PUE/PER-FMP-2026-007** se asentaron el 08/09 (registro 15:33-15:35). Sus guías son del 31/08 al 07/09. La recepción quedó el **11/09** (0000005) y el **23/09** (las otras 7).
- Las 30 corridas del permiso van del 07/09 al 22/09. Con T3 (ADR-433), 18 de ellas (07/09-10/09) no podían descontar una sola troza del permiso: el libro decía que la madera llegó después de aserrarse.
- 019-001-0000004 y 019-001-0000013 siguen por recibir. 019-001-0000003 está rechazada.
- **El documento SNIFFS no trae fecha de llegada.** En los 11 documentos guardados (`serforGtf`, `gtfDatos`) hay registro, expedición y vencimiento. `traslado.fechaInicio` es la expedición y `traslado.fechaFin`, el vencimiento.
- La corrección al revés no tenía guard: nada impedía mover la recepción de una guía a una fecha POSTERIOR a una corrida que ya aserró sus trozas. En `main`, la guía 001-0000202 (recibida el 19/09) tiene 2 trozas en la corrida 95002 del 23/07.

## Decisión

1. **Una fecha por guía.** Cada fila del bloque lleva su fecha. Al marcarla se llena con la propuesta, en este orden: la recepción que ya tenga (guía a medio recibir), la fecha de la guía y, si no hay, la del asiento. Nunca se propone una fecha futura. La fecha siempre se puede editar, y el tilde (que arranca en cero) la confirma.
2. **Lo que frena, igual en la pantalla y en el servidor** (`revisarLlegada`):
   - Fecha vacía o inexistente.
   - Fecha futura: el «hoy» es el de Lima con `limaDateKey`, también cuando el servidor pone hoy por defecto. Antes usaba `toISOString()`, que a las 19:00 de Pucallpa ya es mañana.
   - Fecha anterior a la guía.
   - Mes cerrado: el del asiento siempre; al corregir, también el de la recepción vieja y el de la nueva.
   - Costo congelado, sólo al corregir.
   - **Guía a medio recibir**, sólo al corregir: si alguna fila viva de la GTF todavía no tiene `fechaRecepcion`, se frena con «A esta guía le falta recibir la fila de <especie>: recíbela primero en «Recibir en bloque»». Pasa cuando un bloque se corta a mitad de guía o cuando a una guía ya recibida se le agrega la fila de otra especie. La pantalla lo muestra en la fila y el servidor lo repite.
   - **T3 al revés:** una corrida viva que ya aserró trozas de la guía con fecha anterior a la nueva llegada. El mensaje dice qué corrida, qué trozas y hasta qué día sirve.
3. **Lo que avisa sin frenar:**
   - «Hay N corridas de <especie> de este permiso desde el dd/mm: si la madera llegó el dd/mm, esas corridas no pudieron salir de esta guía.» Va en una sola línea aunque la guía traiga varias especies. El permiso es el `contratoId` de la guía o, si no tiene, su `originCode`.
   - El plazo de registro: «con esta fecha, el asiento queda fuera de plazo: N días hábiles». Usa `diasHabilesDeRegistro` desde la llegada hasta el `createdAt` del asiento.
4. **«Corregir la recepción»** está en el menú «Más» de la fila de la guía recibida. Además, un aviso de la vista cuenta las guías recibidas después de corridas de su especie en el mismo permiso (`llegadaSospechosa`) y abre la tanda con esas arriba. Hay un motivo por tanda, obligatorio (≥ 3 letras). El servidor, por guía y dentro de una transacción, hace esto:
   - Bloquea primero las **trozas** y después los **asientos**, los dos con `ORDER BY id`. Es el mismo orden que usan los escritores de consumo por pieza.
   - Vuelve a leer el contexto y lo revisa con la misma función que la pantalla.
   - Cambia `fechaRecepcion` en los asientos **ya recibidos** de la GTF (el `WHERE` lleva `fechaRecepcion IS NOT NULL`, aparte de la revisión) y en las trozas de esos asientos que seguían a la guía, o sea, las que no tienen fecha propia o tienen la misma que su asiento. Una troza que bajó en otro viaje (ADR-336) conserva su fecha. Una que no llegó no se toca.
   - Escribe **un renglón de auditoría por asiento** (`auditCtpEsperando`, antes de responder) con antes → después, las trozas cambiadas, el motivo y los avisos que había.
   - Una guía de otro tenant responde 404: el `tenantId` va en el WHERE.
   - **Corregir es de `admin` y `owner`** (PATCH). Es la misma separación de funciones que validar y anular en `wood-entries/[id]`: el almacenero recibe, pero no reescribe una fecha declarada de una guía que otro ya validó. Leer el contexto (GET) sigue abierto al almacenero, porque lo necesita para ver los avisos al recibir.
5. **Recibir también revisa T3 al revés.** `recepcionarGuia` revisa la guía entera antes del primer asiento (`revisarAntesDeRecibir`), para no dejarla a medias si las trozas cuelgan del segundo. `recepcionar` repite la revisión con lock dentro de su transacción (`exigirLlegadaCompatible`), y ahí sólo cuentan las trozas sin fecha propia, que son las únicas que va a fechar.

## Consecuencias

- **Simulación en Blas** (lógica pura sobre la DB class real, sin escribir). Para las 8 guías de 10-HUA propone la fecha de su guía (31/08, 02/09, 03/09, 07/09) y ninguna frena, porque no hay consumo vivo. Todas salen marcadas como sospechosas con la fecha actual; por ejemplo, 0000006 dice «Hay 11 corridas de este permiso anteriores a esa fecha…». Con la fecha propuesta, 6 de las 8 muestran el aviso de plazo (3 a 6 días hábiles hasta el asiento del 08/09). Las dos del 07/09 quedan dentro del plazo. En 019-001-0000013 (guía del 24/08) avisa de una corrida de Tornillo del 21/08.
- **Corregir a la fecha de la guía deja a la vista que el asiento se registró tarde.** Es honesto, pero el indicador de plazo del libro (`estaFueraDePlazo`, badge, panel y Excel) sigue midiendo del asiento al registro y **no cambia**: el aviso es sólo de la pantalla y del rastro. Cambiar el predicado pide otro ADR y los 3 lectores.
- Una corrección que movería la llegada después de una corrida que ya aserró la madera se frena con el camino: «La corrida N° 95002 del 23/07 ya aserró 2 trozas 204, 205 de la guía 001-0000202: la madera no pudo llegar el 20/09. La llegada tiene que ser el 23/07 o antes, o primero saca esas trozas de la corrida.»
- Blas puede corregir sus 7 guías en una tanda. Después de eso, «Descontar la madera» deja vincular las corridas del 07/09 en adelante.

## Fuera de alcance (deuda anotada)

- El **consumo por guía en m³** sin piezas (`setConsumos`) no se revisa por fecha, como en ADR-433.
- **La salida de trozas enteras** (T2, `despachadaEnId`) y el retrozado tampoco se cruzan con la llegada.
- La ficha de la guía (ADR-350) sigue recibiendo con su propia fecha. No tiene todavía los avisos de corridas ni de plazo.
- Los meses cerrados que caen el día 1 se leen distinto: `assertPeriodoAbierto` compara la medianoche UTC contra el mes de Lima y la regla nueva usa el día (`AAAA-MM`). La regla nueva frena menos, nunca más.

## Alternativas descartadas

- **Corregir sólo las filas ya recibidas y dejar pendiente la que falta, sin frenar:** la misma guía (un camión) quedaría con dos estados, una fila con la fecha corregida y otra «por recibir», y el operador creería que la corrigió entera. Frenar obliga a recibir primero la fila que falta, por `recepcionar`, que además la valida. Se usan las dos cosas: frena la revisión y, si algún día se la saltea, el `WHERE` de la escritura igual deja afuera la fila sin fecha.
- **Leer la llegada del SNIFFS:** no la trae. Proponer `fechaFin` fecharía la llegada con el vencimiento de la guía.
- **Proponer el día anterior a la primera corrida:** es un número inventado que parece oficial (regla `verificacion-de-verdad` §2).
- **Una fecha común con «aplicar a todas»:** es el mismo tilde a ciegas que causó el problema.
- **Corregir desde «Corregir los datos» (`update`):** sólo edita pendientes, y la recepción de una guía validada es justo la que hay que corregir. Además no revisa T3.
- **Bloquear por el plazo de registro:** el retraso ya pasó. Frenar la corrección sólo esconde el dato real.
