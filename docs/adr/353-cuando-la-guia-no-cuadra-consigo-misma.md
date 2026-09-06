# ADR-353 — Cuando la GTF no cuadra consigo misma

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Ingresos ↔ Consumos · invariante I2
- **Relacionado:** ADR-312 (un asiento por especie) · ADR-320 (agregar piezas) · ADR-326 (consumo por pieza) · ADR-350 (la ficha) · ADR-346 (la guía es la fila)

## El reporte

Brandon, al consumir un lote:

> *«¿por qué sale así? La guía 019-0000016 solo tiene 4.161 m³ sin consumir;
> estás pidiendo 8.247 m³. Puedo consumir las trozas que quiera, ¿no?»*

La advertencia era **correcta** —I2 impide consumir de un ingreso más de lo que
declara— pero el mensaje culpaba al operador («el ingreso está mal declarado:
corregí su volumen») y no había forma de corregir nada: el ingreso estaba
`validado`, y un validado sólo se corrige **anulando y volviendo a registrar**.

## Lo que dijo la medición

El barrido del libro encontró **2 ingresos descuadrados** en su tenant, con la
misma firma:

| Folio | Guía | Especie | Cabecera (37) | Lista (35) | Brecha |
|---|---|---|---|---|---|
| N° 6 | 019-0000016 | Mashonaste | 4.1610 · 2 pz | 8.2470 · 4 pz | 4.0860 |
| N° 18 | 019-0000013 | Copaiba | 8.4820 · 2 pz | 15.5140 · 4 pz | 7.0320 |

En los dos, **una sola fila de la lista lleva `cantidad = 3`** y su volumen es
exactamente 3× el de una troza de esas medidas. Contándola como UNA, los dos
lados cierran — y la lista pasa a sumar `16.617` y `19.782`, que es clavado el
**«TOTAL VOLUMEN» que declara el propio documento**.

**No es un error de carga.** Se verificó pidiéndole la ficha a la consulta
pública de SERFOR (`consultarGtf.do`, N° de registro `1-19-0354346`):

```
Codificacion | Dimensiones          | Cantidad | Volumen
20/A         | 65.0 X 63.0 X 6.35   | 3.0      | 6.129
```

mientras su casillero 37 dice `Mashonaste · 2 · 4.161`. **La GTF se contradice a
sí misma**, y nuestro importador la copia fielmente —como debe: el documento es
el documento—.

## La decisión

### 1. El descuadre se ve al IMPORTAR, no al consumir

`repartirGtfEnIngresos` ya cruzaba la suma de los productos contra el total del
documento. Ahora también cruza, **por especie, la cabecera (37) contra la lista
de trozas (35)** y devuelve `descuadres[]` además de los avisos. El toast del
alta pasa a **amarillo** y dice dónde quedó marcada.

El cruce vive en `lib/forestal/guia-descuadre.ts` (puro, 15 tests) porque lo
consumen tres pantallas: el importador, el acta de consumo y el cuadre.

### 2. La fila culpable se nombra, pero sólo si es UNA

`filaQueExplica()` busca la fila con `cantidad > 1` cuyo `(N−1) × unitario` da
la brecha **exacta** (tolerancia de un litro). Si hay dos candidatas, no elige
ninguna: dos explicaciones posibles es lo mismo que ninguna, y acá no se adivina.

### 3. «Cuadrar la guía»: se corrige UN lado, y lo elige el operador

El cuadre se abre desde **las cuatro pantallas donde el problema se ve**, porque
un aviso que obliga a cambiar de pestaña se ignora:

| Dónde | Cuándo aparece |
|---|---|
| Tabla de guías (Ingresos y GTF ingresadas) | el aviso naranja **es el botón** |
| Ficha de la guía | antes de recepcionar: «se puede recibir, pero no consumir» |
| Acta de consumo | al lado del motivo que bloquea, sin mandar a otra pestaña |
| Cumplimiento | el barrido de todo el libro (§6) |

Por eso el modal recibe **ids de asiento** y pide lo suyo: el acta de consumo
sólo conoce `woodEntryId`, y obligar a cada llamador a armar una guía completa
era pedirle datos que no tiene. Se abre reemplazando al modal anterior, nunca
apilado (misma regla que ficha↔documento, ADR-350).

Muestra los dos testigos del papel uno al lado del otro, con las dos salidas ya
calculadas:

- **Vale la cabecera** → la pieza `20/A` pasa de 3 trozas · 6.1290 m³ a 1 troza · 2.0430 m³.
- **Vale la lista** → el ingreso pasa de 4.1610 m³ a 8.2470 m³ (4 piezas).

**El sistema hace los números pero no decide.** Elegir por él sería decidir, sin
el documento a la vista, qué dice un documento. El **motivo es obligatorio** y va
al log de auditoría (`ctp_ingreso_cuadre`): un libro fiscalizable tiene que poder
contestar *«¿esto siempre dijo 4.1610?»* y *«¿por qué cambió?»*.

Por qué cuadrar y no anular+re-registrar, que era el único camino: anular pierde
el folio, obliga a recargar la guía entera **y no arregla nada**, porque el
documento va a seguir diciendo lo mismo. Cuadrar deja el folio donde está, con la
corrección fechada, firmada y motivada — más fiscalizable, no menos.

### 4. Los guards de `cuadrarIngreso`

| | Regla |
|---|---|
| Estado | `anulado`/`rechazado` no se cuadran: se vuelven a registrar |
| Período | abierto (mismo guard que validar/anular) |
| Pieza consumida | no se toca: bajarle el volumen reescribiría una corrida cerrada |
| Pieza retrozada | no se toca: los pedazos sumarían más que la madre (R1) |
| Lado «lista» | nunca por debajo de lo ya consumido (sería I2 al revés) |

Cuatro códigos nuevos de invariante (`TROZA_CONSUMIDA`, `TROZA_RETROZADA`,
`TROZA_AJENA`, `CUADRE_SIN_LISTA`) para que **cada rechazo sea 422 con motivo** y
no un 500 mudo: un guard que no explica por qué frenó no sirve en el patio.

### 5. El acta de consumo deja de culpar al operador

> ~~«El ingreso está mal declarado: corregí su volumen (o las medidas de las piezas)»~~
>
> «La guía 019-0000016 declara 4.1610 m³ de Mashonaste **en su cabecera**, pero
> su lista de trozas suma 8.2470 m³. **La guía no cuadra consigo misma**: andá a
> Ingresos, tocá el aviso naranja de esa guía y cuadrala — ahí se ven los dos
> lados del documento.»

Y el aviso de la tabla es **un botón**, no un cartel: un aviso que no lleva a
ningún lado se lee como «tenés un problema y arreglate».

### 6. El barrido del libro entero, en Cumplimiento

`CtpDescuadresPanel` hace el cruce de entrada de un fiscalizador sobre **todo el
libro** y lista guía, folio, especie, los dos volúmenes y la brecha, con su botón
de cuadre. Es lo que hasta ahora sólo se veía corriendo
`scripts/forestal-barrido-libro.mjs` desde la terminal.

Va **dentro de Cumplimiento** y no en una pestaña nueva: una guía que no cuadra
es un hallazgo de fiscalización, y el libro ya tiene 21 vistas.

**No filtra por período**, a diferencia del resto del panel: una guía de julio
sin cuadrar traba el consumo de hoy, y esconderla porque el chequeo mira agosto
sería tapar justo lo que traba. Barre 1000 ingresos y **dice si cortó** — un tope
callado se lee como «no hay más».

## Verificación

**Contra la fuente primaria:** la ficha de SERFOR se pidió en vivo y publica la
fila con `Cantidad 3.0` / `Volumen 6.129`. Queda dicho: el papel es el que no
cierra.

**Escritura, en el tenant de PRUEBAS** (`main`), reproduciendo la firma exacta y
borrando lo creado:

| Caso | Resultado |
|---|---|
| Lado cabecera (3 trozas → 1) | HTTP 200 · declara 4.161 · piezas 4.161 ✅ |
| Lado lista (ingreso → suma) | HTTP 200 · declara 8.247 · piezas 8.247 · 4 pz ✅ |
| Motivo de 2 letras | HTTP 400 ✅ |
| Pieza de otro ingreso | HTTP 422 `TROZA_AJENA` ✅ |

**Pantalla, en el tenant real** (sólo lectura — la decisión de qué testigo vale
es de Brandon y su papel):

1. Ingresos → `019-0000013` muestra «7.0320 m³ de más en las piezas · cuadrar».
2. GTF ingresadas → `019-0000016` muestra «4.0860 m³ de más… · cuadrar».
3. El modal propone `20/A: 3 trozas · 6.1290 → 1 troza · 2.0430` y el otro lado.
4. Consumos → el acta trae el mensaje nuevo y **«Consumir» queda deshabilitado**.
5. **Ficha** → «Esta guía no cuadra consigo misma. Declara 19.7820 m³ … suma
   26.8140 m³» + botón; al tocarlo queda **1 solo diálogo** (reemplaza, no apila).
6. **Acta → Cuadrar la guía** → abre «019-0000016 · Desde el acta del lote
   LA-2026-003», también con 1 diálogo.
7. **Cumplimiento → Guías que no cuadran (2)**: las dos filas con sus cifras y
   «11.1180 m³ de brecha en 2 guías».
8. Light y dark a 1440×900: entra sin scroll.
9. Consola: **0 errores** en los tres flujos (el único del log es un crash de
   hot-reload previo al `?? []` defensivo de `entryIds`).

Queda dicho: el guard de **pieza ya consumida** está en el servidor y la opción
sale deshabilitada en pantalla, pero **no se ejercitó de punta a punta** (haría
falta aserrar una pieza para probarlo).
