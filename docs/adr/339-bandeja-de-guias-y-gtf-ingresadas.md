# ADR-339 — Ingresos es una bandeja; lo recepcionado vive en «GTF ingresadas»

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Sección 1 (Ingresos) · recepción física en el patio
- **Relacionado:** ADR-325 (qué llegó y qué no) · ADR-335 (fecha de recepción del ingreso) · ADR-336 (recepción pieza por pieza) · ADR-337 (lotes de aserrío)

## El problema

La pestaña Ingresos mezclaba dos cosas con vida distinta: **el trabajo por hacer**
—guías que llegaron y falta recibir— y **el archivo del período** —todo lo que ya
entró al libro—. Con 22 ingresos y 7 pendientes, encontrar lo que falta recibir
era filtrar a mano cada vez.

Y «recepcionar» eran tres actos sueltos: fechar el ingreso, fechar cada pieza y
validar. Nadie los hacía los tres, así que el estado real de una guía había que
deducirlo abriéndola.

## La decisión

### 1. Un criterio único de «recepción cerrada», y tres actos que la cierran

`lib/forestal/recepcion-guias.ts` (puro, 11 tests):

| Acto | Por qué cierra la recepción |
|---|---|
| **Validarla** | Es el acto explícito de aceptar el ingreso en el libro |
| **Fecharla** (`fechaRecepcion`) | El día que bajó del camión ya está declarado |
| **Decidir todas sus piezas** | Cada troza fechada o marcada como no llegada: la guía ya no tiene nada que resolver |

**Cualquiera alcanza.** Exigir los tres dejaría la bandeja llena de guías ya
resueltas: medido en el tenant real, **0 de 22 ingresos tenían `fechaRecepcion`**
y 15 estaban validados. Una bandeja que no se vacía se ignora.

El predicado vive dos veces —TypeScript para la pantalla, SQL para el filtro
paginado— por la misma razón que el de fuera de plazo, y con la misma regla: si
uno cambia, cambian los dos.

### 2. `Ingresos` = bandeja · `GTF ingresadas` = archivo

Misma vista, dos filtros (`?recepcion=pendiente|cerrada`), servidor. La bandeja
tiene un chip para abrirse a todo el período sin cambiar de pestaña, y un salto
desde Cumplimiento («3 fuera de plazo») **limpia el filtro solo**: si la guía
buscada ya se recepcionó, esconderla dejaría el click en una lista vacía.

El Excel oficial y los cuadros resumen no cambian: siguen tomando el período
completo. Lo que se partió es la pantalla, no el libro.

### 3. «Recepcionar» es un solo acto

`WoodEntriesDB.recepcionar()`: fecha las piezas que **no** estaban marcadas como
faltantes, fecha el ingreso si estaba vacío, y valida si estaba pendiente — en
ese orden, con auditoría propia (`ctp_ingreso_recepcion`). Sirve en lote: el
camión trae cinco guías y bajan el mismo día.

La fecha viaja como texto `AAAA-MM-DD` hasta el `::timestamp` de Postgres:
convertirla a `Date` en Node la correría un día en Lima.

## Consecuencias

- El listado trae ahora `trozasDecididas` por ingreso (un `groupBy` más, por
  página): sin él, el estado de recepción no se puede calcular sin abrir la guía.
- Una guía anulada o rechazada no se recepciona — se rechaza con motivo.
- Verificado por el camino real: seleccioné `QA-CUADRE-5600181` (10 piezas, 0
  decididas) en la bandeja, apreté «Recepcionar», y quedó `validado` con fecha
  `2026-08-06` y **10/10 piezas fechadas**, fuera de la bandeja y dentro de GTF
  ingresadas.
