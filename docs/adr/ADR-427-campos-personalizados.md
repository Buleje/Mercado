# ADR-427 — Campos personalizados: las preguntas que el negocio inventa

- **Estado:** aceptado
- **Fecha:** 2026-09-21

## Contexto

Pedido de Brandon (2026-09-21):

> «Quiero implementar esta función innovadora en todos los modales en general:
> que se puedan crear campos de forma personalizada, y la opción de poner si es
> temporal para ese modal o permanente para ese modal para otros registros;
> crear personalizado y reutilizar campos, ponerle nombre y para qué es, para
> poder aplicar campos personalizados y poner datos variados en todos los
> modales».

Medido antes de escribir nada:

| Qué | Resultado |
|---|---|
| ¿Existía algo de campos personalizados? | **No.** `grep` de `customField\|campoPersonalizado\|campos personalizados` sobre todo el repo: 0 archivos |
| Modales que podrían usarlo | **174 archivos** montan `AdminModal` |
| Dónde termina hoy ese dato | En «Observaciones» o «Notas»: texto libre donde no se puede buscar, sumar ni saber qué se esperaba |

## Decisión

**Dos tablas, no un `Json` en cada modelo.**

Un JSON suelto guarda el valor pero **no la pregunta**: nadie puede listar qué
campos inventó, reusarlos en otro formulario, ni distinguir el dato de una vez
del dato que el negocio adoptó. La definición es información del negocio, no
metadata de una fila.

- `CampoPersonalizado` — la pregunta: `formulario`, `clave`, `nombre`,
  **`descripcion`** («para qué es»), `tipo`, `opciones`, `orden`, `activo`.
- `CampoPersonalizadoValor` — la respuesta de un registro: `campoId`,
  `registroId`, `valor` (texto, siempre) y además `valorNum` / `valorFecha`
  cuando el tipo lo permite, para poder **sumar y ordenar sin parsear texto**.

### Las dos vidas de un campo son una columna

`soloParaRegistroId`:
- **`null` = permanente** — la pregunta queda en ese formulario y aparece en
  todos los registros que se carguen después;
- **con id = temporal** — vale sólo para ese registro. La excepción no ensucia
  el formulario de los demás.

Se elige al crearlo, con las consecuencias escritas en la UI («Sólo en este
registro» / «Siempre en este formulario»), porque quien inventa el campo es
quien sabe si es la excepción o la regla.

### El resto de las reglas

1. **El formulario es un id estable** (`"forestal.plan"`, `"directorio.parte"`),
   no el nombre de la tabla: dos modales del mismo modelo pueden preguntar
   cosas distintas.
2. **La clave se deriva del nombre** (`claveDesdeNombre`) y no cambia si después
   se renombra la etiqueta: lo guardado se sigue encontrando. «Camión» y
   «camion» son la **misma** pregunta.
3. **Nada es obligatorio.** Un campo personalizado nunca bloquea el guardado: el
   ingreso o el plan importan más que la pregunta que alguien agregó. Se avisa
   cuando lo escrito no es del tipo declarado; no se traba.
4. **Un valor que no se puede convertir no se inventa**: «doce» en un campo
   numérico queda como texto y `valorNum` en `null`. Un 0 ahí sería un dato
   falso que después se suma.
5. **Reutilizar es copiar la pregunta, no compartir la respuesta.** Se ofrecen
   sólo los permanentes de otros formularios, deduplicados por clave; los
   temporales son la excepción de un registro y no se adoptan en otra pantalla.
6. **Apagar, no borrar.** Un campo que ya no se usa se desactiva: sus valores
   siguen siendo lo que alguien escribió.
7. **Seis tipos, no veinte** (texto, número, fecha, lista, sí/no, nota). Cada uno
   existe porque cambia cómo se escribe el dato y qué se puede hacer con él; un
   catálogo más largo sólo haría elegir mal.

## Consecuencias

- Las dos tablas se crearon con `20260922000000_campos_personalizados`, aplicada
  contra el pooler en modo session y verificada en `information_schema`
  (15 y 10 columnas, 7 índices, FK con `ON DELETE CASCADE`).
- **El `@@unique` de Prisma no alcanzaba y se descubrió probándolo**: en un campo
  permanente `soloParaRegistroId` es `NULL`, y Postgres trata cada `NULL` como
  distinto, así que **dos permanentes con la misma clave entraban los dos** (se
  crearon dos por API para confirmarlo). El unique real son dos índices
  **parciales** (`20260922010000_campos_unicos_parciales`): uno para los
  permanentes `WHERE soloParaRegistroId IS NULL AND deletedAt IS NULL` y otro
  para los temporales. Los dos excluyen lo dado de baja, para que un campo
  apagado no deje su clave bloqueada para siempre. Es el mismo caso que
  `ForestLoteAserrio` (ADR-396) y `ForestContrato` (ADR-421) — la tercera vez que
  este repo tropieza con el mismo `NULL`. Verificado después del arreglo: el
  segundo permanente con la misma clave responde **409**.
- **Cableado real (primera tanda):** 5 modales en 3 formularios, elegidos por
  las filas que de verdad tiene el negocio (ingresos **24 guías / 160 trozas**,
  lotes **21**, adelantos **4**) y no por intuición: alta y corrección de
  ingreso (`forestal.ingreso`), detalle de lote (`forestal.lote`), alta y
  detalle de adelanto (`adelantos.adelanto`). Se saltearon **despacho/guía**
  —crea una línea por producto y no hay un id único donde colgar los valores— y
  **compras** (0 órdenes en el tenant real).
- **El registro se valida y los permisos salen del formulario.** Un `registroId`
  que no existe en ese tenant se rechaza (`409 registro_desconocido`) en vez de
  guardar basura, y cada rol sólo ve y llena los campos de los formularios de su
  módulo (`403` con el motivo). Un formulario todavía **no mapeado no se
  bloquea**: se permite avisando en el log, porque el motor se cablea modal por
  modal y exigir el mapa rompería cada pantalla nueva.
- **Ley 29733, hasta donde llega hoy:** el export incluye los valores de la
  persona cuando se la puede cruzar (documento exacto contra el Directorio), y
  **declara en `fueraDeAlcance`** los formularios que no se pueden cruzar en vez
  de callarlos. Ningún formulario cableado cuelga todavía de un pedido o una
  venta, así que para un cliente de bodega trae 0. El borrado **no** toca esos
  valores: esa ruta no suprime la ficha del Directorio, y borrar un pedazo de un
  registro que se retiene sería incoherente (queda dicho en `retainedData`).
- **Alcance de esta entrega:** el motor (modelo + módulo puro + API + bloque de
  UI) y el cableado en los modales piloto. Los 174 modales **no** se cablean de
  una vez: cada uno necesita decidir su id de formulario y dónde va el bloque, y
  hacerlo a ciegas en todos llenaría de preguntas pantallas que nadie pidió. El
  patrón queda documentado para ir sumándolos.
- Los valores de un registro que todavía no existe (un alta) se acumulan como
  pendientes y se guardan cuando el servidor devuelve el id — mismo patrón que
  los permisos del Directorio (ADR-425).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un `Json` de extras en cada modelo | Guarda el valor y pierde la pregunta: no se puede listar, reusar ni distinguir temporal de permanente. |
| Una tabla por modelo (`ForestPlanExtra`…) | 174 modales serían decenas de tablas iguales. |
| Campos obligatorios configurables | Un campo inventado que bloquea el guardado convierte una ayuda en una traba. Se avisa, no se traba. |
| Tipos ricos (moneda, teléfono, email…) | Cada tipo nuevo hay que validarlo, formatearlo e imprimirlo. Seis cubren lo que pidió el negocio; se agregan cuando haga falta uno. |
| Cablearlo en los 174 modales de una | Ninguno tendría el id de formulario pensado ni el lugar correcto en la pantalla. |

## Referencias

- `lib/campos-personalizados.ts` (módulo puro) · `__tests__/campos-personalizados.test.ts` (26 casos)
- `prisma/migrations/20260922000000_campos_personalizados/`
- ADR-425 (permisos del titular: el patrón de «pendientes» del alta)
