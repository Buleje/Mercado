# Verificar por el camino del usuario, no por el mío

> Escrito desde los fallos REALES de la sesión del importador CTP (2026-08-04).
> Cada regla acá abajo se ganó con un bug que llegó a producción de la sesión
> porque el gate que corrí no era el gate que importaba.

## 1. El script propio NO es verificación

**Lo que pasó:** verifiqué el importador de trozas con un script que llamaba al
parser directo. Daba 60 filas, 32.803 m³, perfecto. Reporté "funciona".

**Lo que el usuario vio:** de 60 trozas entraron 9. Las otras 51 se descartaron
como «duplicada en el archivo» porque compartían GTF — un tramo (modal →
endpoint → dedup por `gtfNumber`) que mi script nunca tocó.

**Regla:** cuando existe un camino de UI, el gate es ese camino completo. Un
script que salta el endpoint prueba la mitad que ya funcionaba. Si no se puede
llegar hasta el final (escribir de verdad), decirlo — no llamarlo verificado.

## 2. Un dato derivado nunca se presenta como el dato

**Lo que pasó:** calculé que hacía falta una apertura de 167.798 m³ y la
pantalla lo afirmó. El Cuadro Resumen 2 del propio usuario declara **152.922**.
Yo estaba estimando un número que el archivo ya traía.

**Regla:** antes de derivar un total, buscar si el sistema de origen ya lo
publica. Si se muestra un derivado, decir que lo es y de dónde sale el real. Un
número inventado que parece oficial termina declarado ante una autoridad.

## 3. «Cuadra» sólo después de cruzarlo contra la fuente

**Lo que pasó:** dije "el patio cuadra, Δ 4.5 m³" leyendo mal una columna del
Cuadro 1 (era *Salidas de trozas*, no el saldo final). Tuve que corregirlo al
turno siguiente.

**Regla:** al leer un cuadro oficial, verificar primero que su propia fórmula
cierre (`A+B+D−C−E = final`). Si no cierra, la lectura está mal y todo lo que se
concluya arriba también.

## 4. Tolerancias con la unidad del negocio, no del float

**Lo que pasó:** el umbral de I3 era 0.0001 m³ — una décima de litro. Sobre 4666
filas con 3 decimales, siete lotes daban «rompe I3» por 0.001 de redondeo. Siete
rojos falsos enseñan a ignorar la lista entera.

**Regla:** la tolerancia sale de cómo se mide en el mundo real (un aserradero
mide con cinta: 10 litros es fino). Nunca del epsilon de punto flotante.

## 5. Los gates estáticos no ven los bugs que importan

`tsc` + `lint` + `vitest` pasaron **verdes** con: 51 trozas descartadas en
silencio, 423 m³ mal clasificados, un lote fantasma llamado «-», y seis avisos
rojos falsos. Todos eran bugs de **semántica de datos**, invisibles para el tipo.

**Regla:** después de los gates, correr los datos REALES del usuario y mirar los
totales. Si un número no se puede explicar, es un bug hasta que se demuestre lo
contrario — no un redondeo.

## 6. Cuando el usuario dice «salió mal», medir antes de opinar

**Lo que funcionó:** ante «la importación salió mal», consultar el saldo real por
API y comparar contra lo esperado encontró la causa en un turno. Las hipótesis
sin medición (marcas del libro, unidades, período) quemaron tres turnos y todas
resultaron falsas.

**Regla:** primero el SELECT/fetch que muestra el estado, después la hipótesis.

## 7. Descartar una hipótesis se reporta igual que confirmarla

Tres turnos seguidos sostuve que la brecha de producción venía de las marcas
`P/R`/`DIV`. Al medirlas por combinación exacta, ninguna daba el número. Decirlo
—«queda descartada»— vale tanto como encontrar la causa: evita que el próximo
turno lo intente de nuevo.
