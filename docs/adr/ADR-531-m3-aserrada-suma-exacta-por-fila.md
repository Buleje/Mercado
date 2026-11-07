# ADR-531 — m³ de madera aserrada: se suma el exacto y se redondea UNA vez por fila

- **Estado:** aceptado (2026-11-03). Sin cambio de schema.
- **Pedido por:** Brandon (03-11): «yo creo que seria mejor sumar todo normal y al ultimo hacer el redondeo … eso de hacerle el redondeo a cada pieza creo que estaria mal … 23.807 si cuadra a 10094 pero el 23.810 se pasa por 1 pie». En el menú eligió «Exacto en lo de Blas».
- **Reemplaza:** la decisión del 2026-10-03 (comentarios de `cubicarPieza` y `m3DeLinea`) de sumar el m³ ya redondeado de cada línea para cuadrar una GTF que llegó de otro aserradero (31,188 contra 31,183).
- **Relacionados:** regla de la GTF por fila en `lib/forestal/gtf-redondeo.ts` (científico × tipo, HALF_UP, total = Σ filas), que NO cambia.

## Contexto

El cubicador muestra cada pieza con PT a 2 decimales y m³ = ese PT ÷ 424 a 4 decimales. Las filas de la GTF, el Anexo 04, los resúmenes y la comparación sumaban esos valores ya redondeados. Con medidas que se repiten, los redondeos no se compensan: en la carga de Rivers (649 piezas, 9.956,75 PT exactos) la fila salía 23,487 m³ (= 9.958,49 PT) contra 23,483 exactos; con la corta, 23,810 contra 23,807 para 10.094 PT. De 116 medidas distintas, el redondeo subía 4,37 PT y bajaba 2,89 PT, así que quedaba un neto de +1,48 PT, casi todo por el m³ a 4 decimales de cada pieza. No hay norma de SERFOR que pida redondear pieza por pieza: la GTF del 03-10 era de otro aserradero, hecha con su Excel.

## Decisión

1. **Lo que se suma de una línea es su valor exacto.** `ptDeLinea` = PT exacto de las medidas (e″ × a″ × l′ / 12 × cantidad). `m3DeLinea` = ese PT ÷ 424, sin redondear. La fila se redondea una sola vez a 3 decimales (`m3OficialDeFila`) y el total es la suma de las filas, como antes.
2. **El valor por pieza queda solo para mostrar.** `cubicarPieza` no cambia (PT a 2 decimales, m³ a 4) y lo ya guardado tampoco.
3. **Prorrateo vs. cubicado, sin columna nueva.** Si el PT o el m³ guardado en una línea es igual al que `cubicarPieza` le da a sus medidas, se suma el exacto. Si es otro número (el reparto partió la línea entre bloques o días, o la línea no tiene medidas), se respeta tal cual.
4. **Juntar o partir líneas se re-cubica.** `unificarPorMedida` y los formatos «Sumada» y «Una por pieza» del Anexo 04 cubican de nuevo con la cantidad nueva cuando las líneas traen el valor de sus medidas, así la suma exacta no se mueve. Con un prorrateo, suman o reparten como antes.
5. **Las guías que llegan de otros** se siguen copiando con el `volumeM3` de su papel: ningún ingreso recalcula desde piezas. Una GTF ya emitida guarda el m³ de cada línea (`ForestGtf.items`), así que se reimprime igual.

## Fuera de esta decisión

- **Plata:** los importes siguen siendo Σ (PT de cada pieza a 2 decimales × precio). En Rivers son −0,10 PT ≈ −S/ 0,59. Pasarlos a exacto lo decide Brandon aparte (14 lugares listados en el mapa del 03-11).
- **Producción ya declarada:** los paquetes guardan `volumenM3` a 4 decimales por medida, no por pieza (Decimal(12,4)). El error es como mucho ~0,00006 por medida y no se reescribe.
- **Madera en rollo** (Smalian, trozas): no cambia.

## Alternativas descartadas

- **Guardar `ptExacto` por pieza:** pide migración y reescribir lo guardado, y la heurística del punto 3 llega al mismo resultado sin tocar la base.
- **Dejar la regla vieja:** el papel se pasa del PT real (1,4 PT en la carga de Rivers).
- **Exacto solo en el cubicador a clientes:** el papel diría 23,807 y la guía 23,810.

## Consecuencias

- Las cubicaciones guardadas muestran al abrirse el m³ nuevo: −0,001 a −0,005 por fila cuando hay muchas piezas repetidas (Rivers: 23,487 → 23,483). Un Anexo 04 ya registrado guarda su total (`anexo04-registro.ts`); reimprimirlo desde la cubicación da el total nuevo.
- El valor en soles del resumen sigue saliendo del PT de cada pieza a 2 decimales, mientras la columna de PT ya muestra el exacto: valor ÷ PT no da justo el precio hasta que se decida la plata.
- Lo que ya se copió al SNIFFS con la regla vieja puede diferir 0,001-0,005 por fila de lo que muestra hoy el sistema. Para declarar algo nuevo vale lo que muestra hoy el sistema.
- Prueba fija: `__tests__/gtf-redondeo.test.ts` («la carga de Rivers ya no se pasa»: 28 piezas de 2×8×8 → 0,704 y no 0,706).

## Enmienda 2026-11-03 (noche): manda pies ÷ 424

- **Pedido:** Brandon eligió «Pies ÷ 424» entre dos formas de total que diferían 0,001 en 2 de 4 lotes reales (Mario 18,224 vs 18,225; 1005 pz 23,520 vs 23,519).
- **Decisión:** en lo que sale de las medidas de Blas (Resúmenes, Tablas, Distribución, Anexo 04, su cuadre y la comparación) el total es la Σ exacta de TODAS las piezas redondeada una vez (= pies ÷ 424) y las filas especie × tipo se cuadran a él por mayor resto (`filasAlTotal`): cada fila se mueve a lo sumo 0,001 y Σ filas = total. Con varios permisos, el total del lote se reparte entre permiso × fila, así que la guía de un permiso puede quedar 0,001 de sus propios pies ÷ 424.
- **No cambia:** la guía GTF que se arma o reimprime con las líneas ya guardadas (`ctp-gtf-formato`, `forest-gtf.db`), madera en rollo, saldos y papeles de otros: con líneas a 3 decimales el resultado es el mismo, y una guía ya registrada en el SNIFFS no puede moverse al reimprimirla.
