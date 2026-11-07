# ADR-366 — La ficha del paquete: del cartel de la pila a la troza

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Producción y Trazabilidad (`ForestCtpDB.buscarPaquetes`,
  `GET /api/admin/forestal/ctp?paquete=`, `CtpPaqueteFicha`, `CtpBuscarGtf`,
  `CtpProductosDisponibles`)
- **Relacionados:** ADR-316 (saldo único de corrida), ADR-326 (consumo por
  pieza), ADR-349 (producción en paquetes), ADR-362 (el saldo es de la corrida),
  ADR-365 (declarar lo que faltó)

## Contexto

El código de paquete es el único identificador que existe **físicamente** en la
planta: está pintado en el atado, se cita en la guía de salida y es lo que un
cliente lee por teléfono. El libro lo guardaba desde ADR-349, pero como un campo
adentro de la corrida: no había ninguna puerta que **empezara** por el código.

La pregunta que eso deja sin contestar es la del día a día —«tengo este atado
delante, ¿de dónde salió?»— y es exactamente la que `CtpBuscarGtf` ya contesta
para una guía, del otro extremo de la cadena. Contestarla exigía adivinar la
corrida, abrirla en Producción y desde ahí mirar sus trozas.

## Decisión

1. **`ForestCtpDB.buscarPaquetes(tenantId, texto)`** — busca por código
   (parcial, insensible a mayúsculas; el **exacto se ordena primero** para que
   `PQ-1` no quede debajo de `PQ-10`) y devuelve cada paquete con **su corrida y
   el saldo de esa corrida**, que sale de `saldosDeCorridas` (ADR-316, la única
   fuente). Cuando la búsqueda cae en **uno solo**, el mismo viaje trae la cadena
   hacia atrás: las trozas de esa corrida (`WoodEntriesDB.trozasDeCorrida` — las
   tres lecturas dicen lo mismo, ADR-326 §6) y las guías que las ampararon.
   Con veinte resultados no se traen: serían veinte lecturas del patio que nadie
   mira.
2. **`GET /ctp?paquete=<texto>`**, sin período: el que lee un cartel en la pila
   no sabe de qué mes es la corrida.
3. **`CtpPaqueteFicha`** — un modal en el orden en que se pregunta: *qué es este
   bulto* · *de qué corrida salió* · *de qué madera está hecho*.
4. **Dos puertas**: el buscador del libro (`b`), que pasa de dos registros a
   **tres** —guía de entrada, guía de salida y código de paquete—, y el código
   clickeable en **Productos disponibles**, que es donde se mira el stock.

## Lo que la ficha NO afirma

El saldo mostrado es de la **corrida**, no del paquete (ADR-362): el libro
registra cuántos m³ salieron de la planta, no cuál de los atados. La ficha lo
dice con todas las letras en vez de dejar que se suponga —«si la corrida todavía
tiene disponible, este paquete puede seguir en la pila»—, porque un «despachado»
inventado a nivel de atado es justo el dato que después se declara ante una
autoridad.

Lo mismo con el origen: de una tabla no se puede decir de qué árbol salió. Lo que
el libro afirma —y la ficha muestra— es que el paquete salió de esa corrida y que
esa corrida se hizo con esas trozas.

## Consecuencias

- La cadena queda navegable **en los dos sentidos**: de la GTF hacia adelante
  (radar, ADR-134) y del paquete hacia atrás.
- `ForestCtpDB` pasa a importar `WoodEntriesDB` (la dependencia va en un solo
  sentido: `wood-entries.db` no importa este archivo).
- El buscador global gana un tercer fetch por búsqueda; los tres van en paralelo.
- Un paquete de una corrida **anulada** no aparece: esa madera volvió al patio.
  Se dice en el vacío, para que no se lea como «no existe».

## Alternativas consideradas

- **Un `?paqueteId=` aparte para la ficha**: obligaba a dos viajes para el caso
  normal (código exacto → un resultado → quiero todo).
- **Marcar el paquete como despachado**: requiere atribuir la salida por atado, y
  hoy el despacho se atribuye a la corrida (ADR-362). Sería inventar el dato.

## Verificación

Con datos reales del tenant `main` (`scripts/visual-verify-paquete-ficha.mjs`):
buscar `PQ-0290` en el buscador del libro lista «Paquetes con ese código · 1» y
abre la ficha con corrida N° 95052, lote `LA-2026-043`, línea LP, rendimiento
53.6 %, saldo 0.8040 disponible, la guía `QA-CUADRE-5600181` y las 3 trozas que
entraron a la sierra. El código también abre la ficha desde Productos
disponibles. Sin errores de consola; dark verificado.
