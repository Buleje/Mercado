# ADR-349 — La producción se declara en paquetes, y lo que queda tiene su vista

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestañas Producción y Productos disponibles
- **Relacionado:** ADR-340 (consumir y producir son dos actos) · ADR-342 (el lote se programa) · ADR-316 (el saldo de la corrida es la única fuente) · ADR-311 (líneas LP/LRE)

## El problema

Tres cosas que el formato oficial hace y el libro no:

1. **La producción se declaraba como un volumen suelto.** El formulario del SNIFFS
   declara **paquetes**: cada uno con su código, su producto, su presentación y
   —si se dimensiona— espesor, ancho y largo. Ese código es el que después viaja
   en la GTF de salida y el que un fiscalizador busca en la pila.
2. **El camino estaba partido:** consumir en Consumos, declarar en Producción. El
   operador que baja de la sierra con el parte del turno recorría dos pestañas
   para anotar una sola jornada.
3. **No había dónde ver qué hay.** Cuánto se produjo estaba, cuánto salió
   también, pero «qué madera aserrada tengo hoy» había que restarlo a mano entre
   dos pantallas.

## La decisión

### 1. `ForestCtpPaquete` — el detalle, no una segunda contabilidad

Migración 349: código (único por planta), producto, presentación, piezas,
volumen, espesor/ancho/largo y observación, colgando de la corrida en cascada.

**La cantidad de la corrida sigue siendo la única que cuentan las invariantes.**
Los paquetes son su detalle y al declarar se valida que sumen lo mismo, con la
tolerancia del negocio (un litro), no la del float. Dos códigos repetidos se
rechazan: es lo que se busca en la pila.

Lo **disponible** se sigue leyendo del saldo de la corrida (`saldosDeCorridas`,
ADR-316). Una segunda cuenta por paquete sería una segunda verdad.

### 2. Producir desde el lote, en una pantalla

En la barra de Producción hay un selector **«Producir desde un lote…»**. Al
elegirlo aparecen sus trozas —con sus filtros y su tilde por fila— y el botón
**Registrar producción** abre el formulario con la forma del SNIFFS:

| Bloque | Qué trae |
|---|---|
| **Material** | especie · piezas · volumen · **rendimiento vivo** |
| **Información de lote** | N° · inicio · fin del proceso (ADR-342) |
| **Agregar producción** | línea (LP/LRE) · fecha · código de paquete · producto · presentación · cantidad · **Dimensionar** (esp × ancho × largo) o volumen · Añadir |
| **Producción** | la tabla de paquetes cargados + consumido / producido / rendimiento |

Tres decisiones del formulario:

- **Dimensionado, el volumen se calcula** (esp cm × ancho cm × largo m × piezas):
  tipearlo aparte crea dos verdades sobre el mismo paquete.
- **El código se autonumera** conservando los ceros (`PQ-001` → `PQ-002`): una
  jornada carga veinte paquetes iguales cambiando el número, y ahí es donde
  aparecen los repetidos.
- **El rendimiento se ve mientras se carga**, no después de guardar: es el número
  que dice si la corrida salió bien.

En el libro **siguen siendo dos actos** (Sección 2 con su fecha y Sección 3 con
la suya): lo que se junta es la pantalla. Si la declaración falla, el consumo
**no se deshace** —esa madera entró a la sierra de verdad— y la corrida queda
abierta, que es un estado que el libro ya sabe mostrar.

### 3. Productos disponibles

Pestaña nueva: cada corrida con saldo, **una fila por paquete** con su código,
sus medidas y el saldo de su corrida. Las corridas viejas —sin paquetes
cargados— entran como una fila «sin paquete» con su saldo: no puede desaparecer
producto que existe.

## Verificación

Camino completo en el tenant real: lote `LA-2026-016` (Tornillo) → 2 trozas
tildadas → **Material 1.0000 m³** → paquete `QA-PQ-001` dimensionado 2.5 × 20 cm
× 3 m × 20 piezas = **0.3000 m³** (rendimiento 30 %) → guardado → toast «Corrida
N° 95029: consumió 1.0000 m³ y produjo 0.3000 m³ en 1 paquete(s)» → la fila
apareció en **Productos disponibles** con sus medidas y su saldo. Revertido:
corridas anuladas, lotes deshechos, patio de vuelta en 34 trozas y 0 paquetes.

**Gotcha que costó un intento:** el primer guardado devolvió 500 — el cliente de
Prisma se regeneró con el dev server ya levantado y `paquetes` no existía para
él. Es el gotcha conocido del repo: `prisma generate` → **reiniciar el dev**.

Y un bug que sólo se ve usándolo: al consumir, el lote deja de estar abierto y el
bloque entero **se desmonta** — el error de la declaración se iba con él. El
aviso sube a la vista como toast, igual que el del consumo (ADR-343).
