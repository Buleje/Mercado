# ADR-323 — Importar la producción del turno

- **Fecha:** 2026-07-31
- **Estado:** aceptado
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

## El alta masiva NO tiene endpoint propio

Cada fila se manda por el **mismo** `POST /api/admin/forestal/ctp` que usa el
alta normal. Es más lento que un bulk, pero cada corrida pasa por los guards que
ya existen —período cerrado, correlativo `lineNo`, validación Zod— en vez de por
un camino paralelo que habría que mantener sincronizado. En un parte de turno
(decenas de filas, no miles) la diferencia no se nota; un guard que se olvidó de
replicar, sí.

**Si una fila falla, las anteriores quedan.** Se informa cuál falló y por qué, y
el operador corrige esa. Revertir lo ya cargado sería borrar producción que
ocurrió de verdad.

## Referencias

- `lib/forestal/produccion-import.ts` · `__tests__/forestal-produccion-import.test.ts` · reusa `filasDesdeTexto()` y `aNumero()` de `trozas-import.ts`.
