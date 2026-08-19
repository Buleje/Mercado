# ADR-340 — Se consume en el patio y se declara la producción después

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Sección 2 (Consumos) y Sección 3 (Producción) · flujo real del aserradero
- **Relacionado:** ADR-334 (lote de aserrío) · ADR-337 (pestaña de lotes) · ADR-339 (bandeja de guías) · ADR-326 (consumo por pieza)

## El problema

El sistema exigía declarar el consumo y la producción **en el mismo acto**: la
única forma de registrar que unas trozas entraron a la sierra era dar de alta la
corrida con su cantidad producida. Pero en la planta eso pasa en dos momentos
distintos —se carga la sierra a la mañana, se sabe qué salió al terminar— y el
propio LO-CTP los separa: la Sección 2 tiene su **fecha de consumo** y la
Sección 3 su **fecha de producción**.

Consecuencia: la madera que ya estaba aserrándose no figuraba en ningún lado
hasta que alguien supiera el resultado. El libro se llenaba de tarde y el patio
mostraba stock que ya no estaba.

## La decisión

### 1. Consumir abre la corrida; declarar la cierra

`ForestLoteAserrioDB.consumirEnPatio()` hace, en orden:

1. mete al lote las piezas elegidas (si el operador sumó alguna),
2. abre una corrida **en proceso**: con su materia prima, su fecha y **sin
   `quantity`**,
3. consume el lote contra esa corrida — piezas marcadas y **m³ por guía**
   (`ForestCtpConsumo`), que es lo que la Sección 2 declara.

`quantity == null` significa exactamente «consumió madera y todavía no declaró
qué salió» — la columna ya era nullable, así que **no hizo falta migración**.
Mientras esté así, I5 no deja despachar de ella (no se saca de lo que no se
declaró) y el rendimiento queda en blanco, que es lo honesto.

Si el consumo no pasa las invariantes, **la corrida recién abierta se borra**: un
intento fallido no deja una línea fantasma en el libro.

### 2. La declaración es un acto propio

`ForestCtpDB.declararProduccion()` completa la mitad de arriba —producto,
presentación, cantidad, unidad, piezas, código, línea— y calcula el rendimiento
con la misma fórmula del alta. Sólo completa corridas **en proceso**: corregir
una ya declarada se hace anulando y rehaciendo, que deja rastro.

### 3. Dónde vive cada cosa en pantalla

| Pestaña | Qué se hace |
|---|---|
| **Consumos** | Al lado de los filtros: **lote** + **fecha de consumo**. Elegir un lote abre el panel de piezas; el botón lleva a un modal con **la tabla de todo lo elegido** (por guía y pieza por pieza) antes de confirmar |
| **Producción** | Selector **«Declarar producción del lote…»** con las corridas abiertas en el patio; el modal pide sólo lo que falta y muestra el rendimiento mientras se tipea |

## Consecuencias

- Una corrida sin `quantity` es un estado nuevo y visible del libro. Aporta 0 a
  la producción de los cuadros —correcto: todavía no produjo— y no se puede
  despachar.
- Tres códigos de invariante nuevos (`LINEA_NO_EDITABLE`, `SECCION_INVALIDA`,
  `CANTIDAD_INVALIDA`) y una acción de auditoría
  (`ctp_linea_produccion_declarada`).
- **Verificado por el camino real** en el tenant `main`: lote `LA-2026-007` con
  2 trozas Capirona → consumido el 06/08 desde la pestaña Consumos → corrida
  **N° 95025 en proceso** (entrada 2.3608 m³, producido `null`) con su consumo
  por guía `001-0000203 · 2.3608 m³` → declarada desde Producción como 1.35 m³
  → **rendimiento 57.18 %** calculado por el servidor. Todo revertido después:
  0 lotes, 59 trozas en patio.
