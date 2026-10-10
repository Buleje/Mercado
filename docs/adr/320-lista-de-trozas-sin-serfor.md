# ADR-320 — La lista de trozas cuando SERFOR no responde

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** ingreso por especie + trozas (ADR-312) · port de `~/proyectos/appforestal` (`trozas-disponibles`)

## El problema

La lista de trozas entraba por **un solo camino**: la consulta pública a SERFOR.
Cuando el servicio no responde, la guía es vieja o el proveedor mandó el detalle
en un Excel, quedaban dos salidas malas: tipear ochenta filas o **registrar el
ingreso sin trozas** — que es exactamente el ingreso que después no se puede
cruzar contra el POA del título habilitante.

## La decisión

Una segunda fuente para el **mismo momento** de carga: pegar la lista (Excel,
CSV, tabla copiada de un PDF) y verla interpretada antes de aceptar.

**No abre la puerta a editar trozas existentes.** Siguen siendo inmutables y se
crean con su guía, en la misma transacción — `WoodEntriesDB.create` ahora acepta
`trozas[]` y las inserta dentro del mismo `$transaction` que el ingreso.

### Reglas del parser

| Regla | Por qué |
|---|---|
| Sin volumen **ni** forma de calcularlo → fila rechazada | una troza en 0 suma nada al libro y desaparecería sin aviso |
| El volumen **declarado** gana sobre el calculado por Huber | el libro tiene que cuadrar con el papel que trae el fiscalizador |
| Diferencia > 5 % entre declarado y calculado → aviso, no rechazo | el operador tiene que enterarse, pero el documento manda |
| Un solo diámetro → cilindro (d1 = d2) | es lo que hace el resto del módulo cuando la guía trae el promedio |
| Total vs. volumen declarado del ingreso: aviso si difiere > 2 % | pueden diferir legítimamente; lo que no puede es que nadie se entere |

El separador se decide **por fila** (tabulador · `;` · `,` · espacios múltiples):
una lista copiada a mano mezcla los tres. Los encabezados se detectan solos; sin
ellos se lee por posición y se avisa.

### ⚠️ Miles y decimales

`"1.234,50"` y `"1,234.50"` son el mismo número: **el último separador es el
decimal**. La primera versión asumía "si hay punto, la coma son miles" y leía
`1.234,50` como `1.2345` — lo encontró un test, no una revisión.

## Consecuencias

- Botón "Pegar lista de trozas" en la sección Producto y medidas del ingreso manual.
- Verificado contra la API real: alta con troza → fila en `WoodEntryTroza` con su volumen y diámetros; datos de prueba borrados.

## Referencias

- `lib/forestal/trozas-import.ts` (puro) · `__tests__/forestal-trozas-import.test.ts` (23 casos) · `volumenHuber()` de `ctp-retrozado.ts` como single source del volumen.
