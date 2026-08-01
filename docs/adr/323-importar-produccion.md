# ADR-323 — Importar la producción del turno

- **Fecha:** 2026-07-31
- **Estado:** parcial — parser listo, alta masiva pendiente
- **Contexto:** import de ingresos (ADR-138) · import de trozas (ADR-320) · port de `~/proyectos/appforestal` (`productos-disponibles`)

## El problema

`ctp-import` importa **ingresos**. La producción se sigue cargando línea por
línea, y un aserradero que corta todo el día genera decenas de paquetes por
turno: el que los anota en un cuaderno los carga tarde —fuera de los 2 días
hábiles— o no los carga.

## La decisión

Un parser que lee el parte de turno como venga: encabezados detectados solos o
lectura por posición, fecha en ISO / `DD/MM/AAAA` / serial de Excel, unidad
normalizada, y la **línea de producción** traducida al vocabulario oficial
(`LP` / `LRE`) desde como la escribe el aserradero ("principal", "recuperación",
"LR").

### ⚠️ Una corrida importada entra SIN origen atribuido

Y eso **se declara** en los avisos, siempre. Podría parecer un hueco, y lo es —
pero es la política del libro: se guarda sin atribución completa y se bloquea
sólo el certificado (`trazabilidadCompleta()`). Adivinar de qué ingreso salió
cada paquete sería fabricar exactamente la trazabilidad que I1-I2 protegen.

### Lo que se rechaza

| Fila | Por qué |
|---|---|
| Sin fecha (y sin fecha de turno) | una corrida sin fecha no tiene período y rompería el cierre |
| Cantidad 0 o ausente | no es una corrida |

Una línea de producción que no se reconoce cae en `LP` **y se avisa**: el Cuadro
Resumen 3 del LO-CTP se presenta por línea, y una mal clasificada lo descuadra.

## Estado

Parser puro + 14 tests, verificado. **Falta el alta masiva** (endpoint que cree
las N corridas en una transacción) y la UI. Se dejó afuera a propósito: crear
líneas del libro en lote toca el correlativo `lineNo` y el guard de período
cerrado, y merece su propia vuelta con verificación contra la base.

## Referencias

- `lib/forestal/produccion-import.ts` · `__tests__/forestal-produccion-import.test.ts` · reusa `filasDesdeTexto()` y `aNumero()` de `trozas-import.ts`.
