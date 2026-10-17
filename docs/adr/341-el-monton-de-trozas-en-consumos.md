# ADR-341 — El montón de trozas vive en Consumos

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Consumos · patio del aserradero
- **Relacionado:** ADR-339 (bandeja de guías) · ADR-340 (consumir en el patio) · ADR-326 (consumo por pieza) · ADR-336 (recepción por pieza)

## El problema

Recepcionada la guía, sus trozas «desaparecían» de la vista: para saber qué
madera había en el patio había que abrir guía por guía en el archivo, o entrar al
armado de un lote —donde se veían como tarjetas pensadas para tildar, no para
consultar—.

La pregunta del aserradero es al revés: **«¿qué hay para aserrar?»**, y se hace
parado frente a la pila, mirando códigos y medidas.

## La decisión

### 1. Una tabla, siempre visible, en Consumos

`CtpTrozasIngresadas`: todas las piezas de **guías recepcionadas** que todavía no
se aserraron, con lo que se mira en el patio — código de planta, codificación,
especie, guía de origen, **medidas** (D1 × D2 × largo), fecha de recepción,
volumen y estado (libre / apartada en un lote). Con búsqueda, filtros por especie
y guía, y el total en m³ y pie tablar.

**Sólo las recepcionadas** (ADR-339): la madera que un documento declara pero que
nadie recibió todavía no está en el patio. El endpoint devuelve ahora
`guiaRecepcionada` por pieza —validada, guía fechada, o pieza fechada— más las
tres medidas sueltas y la fecha de recepción **de la pieza** (antes ese campo
traía la fecha del asiento del libro, que es otra cosa).

### 2. La misma tabla es el picker

Con un lote elegido arriba, la tabla enciende sus casillas y lo elegido va al
consumo; sin lote, se mira. **Una sola lista**: dos —una para consultar y otra
para elegir— terminan mostrando conjuntos distintos de la misma madera.

## Consecuencias

- `TrozaConsumible` suma `d1Cm`, `d2Cm`, `largoM`, `fechaIngreso` y
  `guiaRecepcionada`; el serializer del patio deja de llamar `fechaRecepcion` a
  la fecha del asiento.
- El picker de tarjetas (`CtpTrozasPicker`) sigue vivo donde tiene sentido —el
  modal de corrida, en una columna angosta—; en Consumos, que es ancho, manda la
  tabla.
- Verificado en el tenant real: **30 piezas · 78.3358 m³ · 33.197 pt** listadas
  con sus medidas y su fecha de recepción; al elegir un lote aparecieron las 29
  casillas elegibles y lo tildado se sumó al consumo (1 elegida + 1 ya apartada
  = «Revisar y consumir (2)»).
