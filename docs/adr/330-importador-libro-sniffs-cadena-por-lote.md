# ADR-330 — Importar el Libro de Operaciones del SNIFFS armando la cadena por lote

**Fecha:** 2026-08-04 · **Estado:** aceptado
**Relacionado:** ADR-138 (import LO-CTP) · ADR-312 (ingreso por especie) · ADR-315 (cadena de custodia) · ADR-316 (saldo único de corrida)

## Contexto

El titular del CTP baja del SNIFFS su Libro de Operaciones: un Excel con cinco
secciones —Ingresos, Consumos, Retrozado, Producción, Salidas— en el formato de
la RDE D000025-2023. Importarlo debería dejar el sistema mostrando el estado real
del aserradero: cuánto entró, cuánto se aserró, qué queda en patio y en depósito.

No lo hacía. El importador tenía tres huecos que, juntos, hacían que un libro
importado mintiera:

1. **Leía una sola hoja.** Quien subía el libro completo importaba los Ingresos y
   perdía las otras cuatro secciones **sin ningún aviso**.
2. **La producción entraba sin consumos** (`consumos: []`), porque el formato no
   dice de qué guía salió cada corrida. El saldo se deriva de esas relaciones
   (`Σ ingresos − Σ consumido`), así que toda la madera aparecía disponible
   aunque el libro declarara que se aserró.
3. **Los despachos entraban sin atribuir**, dejando la cadena rota para el
   certificado de trazabilidad.

## Decisión

### 1. El LOTE es la llave que el formato ya provee

Las secciones no están desconectadas: el SNIFFS reparte la relación en columnas
que nadie estaba cruzando.

```
Ingreso     «Código de CTP»  3012264   ←  GTF 019-0000002
   ↓
Consumo     «Código de Origen/…/CTP»  3012264   ·  Lote 001
   ↓
Producción                                        Lote 001
   ↓
Salida                                            Lote 001
```

Un lote es una corrida: lo consumido con ese lote alimentó lo producido con ese
lote, y eso es lo que se despachó con ese lote. `lib/forestal/ctp-cadena-import.ts`
lo implementa como código puro.

**El puente código→guía sale del propio archivo:** la sección Ingresos tiene las
dos columnas, así que `mapaCodigoAGuia()` traduce el código de troza a la GTF que
acredita su origen legal. Un retrozo (`3012264/A`) hereda la guía de su madre —
cortar una troza no le cambia el origen.

### 2. Reparto a prorrata entre productos del mismo lote

Una corrida rinde varias líneas (tablas, tablillas, cuartones) pero el modelo
guarda una fila por producto. Darle a cada fila la lista completa de consumos
contaría la misma madera tantas veces como productos tenga — **exactamente lo que
I1 e I2 existen para impedir**.

Se reparte proporcional a lo producido: 10 m³ consumidos con 3 de tablas y 1 de
tablillas → 7.5 y 2.5. Es el único reparto defendible cuando el libro no dice
más, y conserva el rendimiento del lote, que es el número que mira SERFOR. La
última línea absorbe el redondeo para que la suma sea exacta.

### 3. Orden de escritura = orden de la cadena

```
Ingresos → Retrozado → Consumos → Producción → Salidas
```

No es una preferencia: la producción se atribuye contra guías que tienen que
existir, y un consumo puede apuntar a un retrozo. Secuencial, nunca en paralelo
(`ctp-serfor-secuencia.ts`). Si una sección falla, se corta ahí: seguir con las
que dependen de ella sólo encadena errores sobre un libro a medio escribir.

### 4. El libro oficial entra VALIDADO

Un ingreso importado quedaba `pendiente`, y en esa condición **no cuenta como
disponible**. Pero su consumo —del mismo archivo— sí descontaba. Resultado
medido: importar dejaba especies en **saldo negativo**, que es justo el hallazgo
que un fiscalizador levanta.

El libro del SNIFFS **ya fue presentado ante SERFOR**: no es una carga de campo
esperando revisión, es el registro oficial. Los ingresos que vienen de ahí
(`origen: "libro-oficial"`) entran validados.

Se hace pasando por `WoodEntriesDB.validate()` y **no** forzando el status en el
`create`: así queda el asiento de auditoría `ctp_ingreso_validate`. Un ingreso que
entra al balance sin rastro de quién lo habilitó no es fiscalizable. Si la
validación falla (período cerrado), la importación no se pierde: el ingreso queda
y se valida después.

Todo otro origen mantiene el comportamiento de siempre: pendiente hasta que
alguien lo valide a mano.

### 5. Atribución de despachos por lote

Las corridas creadas devuelven su `id`, indexado por lote. Cada salida se
atribuye a las corridas de su mismo lote, a prorrata (`origenesDelDespacho`).

**Siempre `≤`, nunca `==`:** nunca se atribuye más de lo que la corrida produjo
(I5) ni más de lo que el despacho saca (I4). Si el libro declara más despacho que
producción, el faltante queda **sin atribuir** — forzar el cuadre inventaría el
origen que la invariante protege. El libro admite el hueco; el certificado no.

### 6. Dos formatos, un solo camino

- **Libro completo**: un Excel con las cinco hojas.
- **Sección suelta**: un archivo por sección.

Los escribe la **misma función** (`escribirSeccion`), con las celdas del libro
real: cabecera en la fila 6 —fila 5 en Consumos, que no lleva el agrupador
`ESPECIE`— y el preámbulo del SNIFFS. El importador no distingue de cuál salió.

### 7. Lo que se muestra ANTES de escribir

- **El estado que va a quedar**: ingresó / se aserró / queda en patio / se
  produjo / se despachó / queda en depósito, y el rendimiento del libro.
- **Los avisos que un fiscalizador levantaría**: producir sin consumo declarado,
  despachar más de lo producido (I3), rendimiento > 100%.
- **Las hojas con datos que no se reconocieron**, con su nombre.

Un patio negativo **se muestra**, no se recorta a 0: esconderlo detrás de un
`Math.max` dejaría el libro "cuadrado" y sin evidencia.

### 8. El ingreso crea la TROZA, no sólo la guía

Era la raíz de dos fallas que parecían distintas. El import de Ingresos creaba el
`WoodEntry` (la guía) pero ninguna pieza, y tanto el Consumo como el Retrozado
buscan por `buscarTrozaPorCodigo`. Un libro completo importaba sus ingresos y
después declaraba que **ninguno de sus propios consumos existía**, y el retrozado
no encontraba la troza madre que acababa de entrar.

El «Código de CTP» del formato es el identificador de la **pieza** dentro del
centro, no de la guía. Con él se crea la troza en la misma transacción
(ADR-312/320). Como un retrozo **es** una troza con madre (auto-relación), el
mismo arreglo destrabó el Apartado 2: verificado cortando `R8-900` en `/A` y `/B`,
y consumiendo `/A`.

### 9. Las dos caras del consumo se escriben juntas

El consumo vive en dos lugares y son el mismo hecho: los m³ por guía
(`ForestCtpConsumo`) y las piezas (`WoodEntryTroza.consumidaEnId`). Escribir sólo
una deja el patio mostrando trozas libres que ya se aserraron.

Los códigos van **con la corrida** (`trozasConsumidas`), no con la Sección 2: la
pieza se marca consumida EN una corrida, y hasta que la corrida no existe no hay
dónde apuntar. Se resuelven vía `marcarTrozasConsumidas`, que trae sus propias
validaciones (ya consumida, no recepcionada, descarte, madre partida).

**Los m³ se reparten a prorrata entre los productos del lote; la pieza no.** Una
troza es indivisible: va a una sola corrida. Repetirla en cada producto marcaría
la misma troza consumida N veces.

### 10. El código del retrozo lo pone el documento

`calcularRetrozado()` **descartaba** la codificación recibida y generaba la suya
(`3012263/A` se guardaba como `3012263-1`). Para el alta manual está bien —el
operador no escribe el código— pero el Apartado 2 del libro **ya nombra al
pedazo**, y ese es el nombre que SERFOR conoce. El retrozo quedaba guardado con
un código que no figura en ningún documento, y el consumo del mismo libro
—que apunta a `3012263/A`— no lo encontraba nunca.

Ahora el código del documento manda y sólo se genera cuando no viene: el mismo
criterio que la función ya aplicaba al volumen (*«el volumen que escribió el
operador manda: midió la madera»*).

De paso se quitó un `as never` en la llamada del importador. Ese cast era
justamente lo que impedía a TypeScript avisar del campo faltante — y al sacarlo
apareció otro hueco real: diámetros y largo podían llegar `null` desde un libro
que no los trae. Se normalizan a `0`, que el cálculo lee como «no medido» para
usar el volumen del documento.

**Verificado end-to-end** (Quinilla): ingresó 12 → retrozó en `/A` (7.0) y `/B`
(4.5) → consumió `/A` → *«Corrida importada (1 consumo, 1 troza)»* → saldo +5 m³.

## Consecuencias

**A favor**
- Un libro importado deja el saldo correcto sin trabajo manual.
- Los despachos quedan atribuidos: el certificado de trazabilidad es emitible.
- Las incoherencias del libro se ven antes de escribir, no después.
- 104 tests cubren la cadena, el reparto, el retrozado y los topes de las invariantes.

**En contra / a vigilar**
- **Validación automática**: la decisión descansa en que el archivo venga
  realmente del SNIFFS. El flag lo pone el importador del libro, no el usuario,
  pero un archivo editado a mano entra igual. Mitigación: queda auditado como
  validación por importación, y el preview muestra el estado antes de escribir.
- **Reparto a prorrata**: es una atribución derivada, no declarada por el libro.
  El rendimiento del lote se conserva; el de cada producto individual es una
  estimación. Documentado acá para que nadie lo lea como dato del documento.
- **Lotes de texto** (`CUM R 01/30`) no se normalizan: fundirlos podría unir dos
  corridas que el operador quiso separadas. Sólo se normalizan los numéricos
  (`001` = `1`), donde el riesgo es el inverso y mayor.
