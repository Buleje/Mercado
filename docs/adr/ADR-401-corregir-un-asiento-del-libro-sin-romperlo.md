# ADR-401 — Corregir un asiento del libro sin romperlo

- **Fecha:** 2026-09-08
- **Estado:** propuesto
- **Pedido por:** Brandon — «en Productos disponibles, en la columna Acciones quiero un botón
  para editar que abra un modal con los datos de la fila; y con varias filas tildadas, elegir
  una columna, poner un dato y que se rellene en todas».

## Contexto

Hoy **el Libro CTP no edita líneas de producción ni de despacho, en ninguna vista.** No es un
olvido: de las ocho acciones que el `PATCH` acepta sobre un asiento —`annul`,
`declarar_produccion`, `ampliar_produccion`, `marcar_usado`, `declarar_apertura`,
`emitir_gtf`, `gtf_datos`, `set_venta`— **ninguna corrige sus campos**. Un asiento no se
sobrescribe: se anula con motivo y se rehace. Eso es lo que hace fiscalizable un libro de
operaciones.

Pero el libro **sí corrige**, y hay precedente exacto: `WoodEntriesDB.update()` corrige un
ingreso con tres candados encadenados —sólo si está `pendiente`, sólo si el período está
abierto, y si se mueve la fecha el mes destino tampoco puede estar cerrado— y audita
`ctp_ingreso_update` narrando campo por campo qué cambió, «porque un libro fiscalizable tiene
que poder responder *¿esto siempre dijo 5.20 m³?*». También existen `ctp_corrida_sumar_piezas`
y `ctp_corrida_quitar_piezas`, que corrigen la materia prima de una corrida abierta sin abrir
un asiento nuevo.

O sea: la pregunta no es *si* se corrige, sino **hasta dónde** y **con qué rastro**. Lo que
falta es esa regla escrita, y sin ella un botón de editar sobre 50 filas tildadas es una
herramienta para borrar trazabilidad sin querer.

### El motivo original ya está resuelto por otro lado

El pedido nació de que «Tornillo» y «TORNILLO» aparecían como dos cosas distintas. Eso era un
bug de agrupación, no de datos: las opciones del filtro se armaban por texto exacto mientras
el filtro comparaba normalizado. Ya se arregló agrupando por `claveEspecie` (ADR-400 §6, mismo
criterio que el resto del libro). **La corrección masiva NO es la herramienta para uniformar
grafías**: reescribir asientos para que digan todos igual altera registros oficiales para
resolver un problema de presentación que se resuelve leyendo.

## Decisión

### 1. Dos clases de campo, dos reglas

| Clase | Campos | Regla |
|---|---|---|
| **Descriptivos** | `observations`, `presentacion`, `materiaPrimaRef` | Se corrigen siempre que el período esté abierto y el asiento vivo, aunque la corrida ya se haya usado |
| **Del registro** | `speciesCommon`, `speciesScientific`, `productType`, `unit`, `quantity`, `volumeInputM3`, `entryDate` | Sólo mientras **nada dependa** del asiento (§2) |

El corte no es por comodidad: un campo descriptivo no cambia ninguna cuenta ni ninguna cadena
de custodia. Cambiar la **especie** o el **producto** de una corrida ya despachada, sí — y
deja una guía emitida citando madera que el libro ahora dice que era otra.

### 2. Qué significa «nada depende de este asiento»

Un campo del registro **no** se corrige si la corrida:

1. es origen de algún despacho (`ForestCtpDespachoOrigen`),
2. alimentó un reproceso (`ForestCtpReproceso`),
3. es miembro de un lote de producción (`ForestProdLoteMiembro`),
4. tiene el costo congelado (`ctp_costo_congelar`),
5. cae en un período cerrado —o la fecha nueva lo movería a uno—,
6. está anulada.

En cualquiera de esos casos el camino es el que ya existe: **anular con motivo y registrar de
nuevo**. El mensaje tiene que decir **cuál** de las seis razones aplica y qué hacer, como ya
hace el de ingresos («Sólo se corrige un ingreso pendiente. Este está validado: anulalo con
motivo y registralo de nuevo»). Un «no se puede» pelado obliga a adivinar.

### 3. Las invariantes se revalidan igual, aunque §2 ya las proteja

Corregir `quantity` revalida **I3** (Σ despachado ≤ Σ producido) e **I5**; corregir
`volumeInputM3` revalida **I1** e **I2**. §2 ya hace imposible el caso —una corrida despachada
no llega hasta acá—, y aun así el guard va: es la última línea antes de escribir, y las
invariantes son ley traducida a código, no una optimización.

### 4. Se audita campo por campo, o no se hace

Acción nueva `ctp_linea_update`, con el **antes y el después de cada campo tocado**, igual que
`ctp_ingreso_update`. Una corrección sin ese detalle es indistinguible de una adulteración:
el libro pasa a decir otra cosa y nadie puede reconstruir qué decía.

### 5. El relleno en masa: previsualizar, aplicar, poder volver

Es la parte que más puede romper, así que es la más acotada:

1. **Sólo campos descriptivos y `speciesCommon` / `productType`.** Nunca `quantity`,
   `volumeInputM3` ni `entryDate`: rellenar una columna de cantidades con el mismo número es
   un error de datos disfrazado de función.
2. **Vista previa obligatoria antes de escribir**: cuántas filas cambian, cuántas quedan
   afuera y **por cuál de las seis razones**. Aplicar a ciegas sobre 50 filas y descubrir
   después que 12 no entraron es peor que no tener la función.
3. **Un solo asiento de auditoría por operación**, con la lista de ids y el detalle por
   asiento. Cincuenta auditorías sueltas no dejan ver que fueron un mismo acto.
4. **Deshacer la operación entera** mientras el período siga abierto, revirtiendo cada campo a
   su valor previo desde ese asiento de auditoría. Esto es lo que convierte un relleno masivo
   en algo que se puede usar sin miedo.
5. **Tope de 200 asientos por operación.** Más que eso no es una corrección: es una migración,
   y va por script con revisión.

### 6. La columna «Lote» de la pantalla no es un campo del asiento

`ForestCtpEntry` no tiene columna `lote`: lo que hay es `materiaPrimaRef` («referencia libre a
la materia prima / lote») y, aparte, la pertenencia real a un lote de aserrío por su tabla
puente. La columna que se ve en Productos disponibles es un derivado. Rellenar «Lote» en masa
tiene entonces dos significados posibles —cambiar una referencia de texto, o mover corridas de
lote— y **sólo el primero entra en este ADR**. Mover una corrida de lote toca L1
(Σ miembros ≤ quantity) y es otra operación, con su propia pantalla.

### 7. Dónde vive el botón

En la columna Acciones de **Productos disponibles**, junto a los que ya están (ficha, cubicar,
reprocesar, marcar usado), y en la tabla de Producción. El modal muestra el asiento completo —
incluidos los campos que **no** se pueden tocar, en gris y con el motivo— porque la pregunta
«¿por qué no puedo cambiar la especie?» se contesta mejor mostrando la respuesta que
escondiendo el campo.

## Consecuencias

- Un operador puede arreglar un typo sin anular y rehacer, que es lo que hoy lo empuja a
  dejar el error puesto.
- La corrección deja **más** rastro que el asiento original: quién, cuándo, qué decía antes.
- Aparece una asimetría deliberada: una corrida despachada no se corrige ni en un campo
  descriptivo si el período está cerrado, aunque el campo sea inofensivo. El período cerrado es
  un acta firmada; reabrirlo es un evento con su propio registro, no un efecto colateral.
- El deshacer necesita que el detalle de auditoría guarde el valor previo con tipo, no como
  texto. Es la parte que hay que diseñar con cuidado al implementar.
- **No se toca `WoodEntry`**: los ingresos ya tienen su corrección y sus candados. Este ADR es
  sobre `ForestCtpEntry`.

## Pendiente antes de implementar

1. Confirmar con Brandon si `entryDate` entra en los campos del registro o se deja fuera del
   alcance: mover la fecha de una corrida cambia de qué mes es la producción, y eso mueve
   rendimientos y cuadros ya mirados.
2. Definir la forma del detalle de auditoría reversible (`{ campo, antes, despues, tipo }`).
3. Decidir si el deshacer caduca con el cierre del período o antes.
