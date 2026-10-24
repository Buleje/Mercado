# ADR-505 — Distribución respetando medidas de troza

- **Estado:** aceptado (2026-10-20). Sin cambio de schema: las medidas viajan dentro del JSON de la hoja de reparto.
- **Pedido por:** Brandon (20-10): «que la distribución actúe de acuerdo a Faltante y cierre según cuadran las medidas, para que según lo distribuido en piezas cuadre con las dimensiones tanto en diámetro y largo de la rolliza; que se distribuya de acuerdo a ello».

## Contexto

Desde el 19-10 «Faltante y cierre › ¿Cuadran las medidas?» compara cada pieza repartida con las trozas de su bloque, pero sólo AVISA: el reparto (`distribuirPorCapacidad`) llenaba por volumen y no miraba largo ni diámetro. En la hoja real de Blas el cuadre daba **46 avisos**: tablas de 12 pies dentro de PLT-2021-017, cuyas trozas no pasan de 3,42 m, mientras PLT-2025-096 (hasta 9,75 m) tenía capacidad.

Además el cuadre medía el diámetro contra el ANCHO de la pieza: un 6×12″ pedía 30,5 cm de Ø cuando su sección necesita 34 cm (la diagonal).

## Decisión

1. **Una sola regla** (`lib/forestal/medida-cabe-en-troza.ts`) para el reparto y para el cuadre: una pieza cabe en un bloque si alguna troza suya, la MISMA, cumple
   - largo de la pieza ≤ largo de la troza + 0,15 m (el pie comercial se redondea a 30 cm);
   - diagonal de la sección √(ancho² + espesor²) ≤ Ø de la punta delgada (el menor entre D1 y D2) + 1 cm.
2. **El reparto filtra con esa regla.** Por especie, las medidas exigentes (las que no caben en todas las trozas) se reparten primero, cada una al bloque con la troza más justa que la da, topadas por la subcapacidad: la parte del volumen del bloque que esas trozas representan. Después corre el reparto de siempre, con el mismo filtro.
3. **Lo que ninguna troza da va a «Falta por distribuir»** con su porqué (`FaltanteGrupo.sinTroza`: «ninguna troza de tornillo alcanza 40 pies; la más larga mide 9,75 m»). El cierre con tolerancia no lo mete en un bloque.
4. **Un bloque sin medidas de troza es el último recurso**: recibe lo exigente que sobró, marcado «sin comprobar» (`AsignacionMedida.sinComprobar`), y el cuadre lo cuenta aparte.
5. **Lo dicho a mano gana**: una línea con override no pasa por el filtro; si no cuadra, queda como aviso en el cuadre.
6. **Las medidas viajan con la hoja**: `BloqueRolliza.trozasMedidas` (≤ `MAX_TROZAS_POR_BLOQUE`), declaradas en el Zod de `/api/admin/forestal/distribuciones` (si no, Zod las descartaba en silencio). Los bloques sembrados desde el patio las traen; las hojas viejas se completan UNA vez al cargar el Libro (`completarMedidas`). Cambiar las trozas de un bloque borra la copia y se vuelve a completar.
7. **Interruptor** «Repartir respetando medidas» en Bloques, prendido por defecto, también por bloque (`BloqueRolliza.ignorarMedidas`). «Ver antes/después» muestra por permiso m³ / PT / piezas, cuántas piezas cambiaron de bloque y lo ya escrito que queda tocado (casillas tildadas, jornadas en el Libro). «Dejar como estaba» marca todos los bloques sin respetar medidas.

## Alternativas descartadas

- **Dejar sólo el aviso.** Es lo que había: 46 avisos que alguien tenía que mover a mano, pieza por pieza.
- **Ordenar todos los bloques por largo de troza.** Sin subcapacidad, el bloque con la troza larga se llena de piezas cortas y las largas quedan sin lugar.
- **Prohibir bloques sin medidas.** Contradice T1 y el reparto por volumen de lo que entró sin cubicar troza por troza: esos bloques existen y deben poder recibir piezas.

## Consecuencias

- Con todos los bloques «sin respetar medidas» el reparto es idéntico al anterior (test `reparto-por-medidas`, fuzz de 800 escenarios sin cambio).
- Reglas y tolerancias en un solo archivo: el cuadre y el reparto no pueden discrepar.
- Las casillas tildadas y las jornadas pasadas al Libro pueden cambiar de contenido al prender la regla: el antes/después lo dice antes de que alguien imprima.
