# ADR-493: El tipo de establecimiento (19) se guarda en la ficha del Directorio

- **Estado:** aceptado
- **Fecha:** 2026-10-16
- **Contexto de negocio:** guía de transporte forestal, formato SERFOR 2024 (RDE D000014-2024-MIDAGRI-SERFOR-DE, Anexo I)

## Contexto

Cuando la carga sale de un establecimiento, el punto de partida de la guía 2024 lleva
(17) nombre, (18) N° de autorización de la ARFFS, (19) **tipo de establecimiento** y
(20) dirección. La libreta (Directorio del tenant, modelo `ForestParty`) ya guardaba el
(17), el (18) (columna `codigoCtp`) y el (20), pero no el (19): al elegir el
establecimiento en la libreta, la partida limpiaba el tipo y había que volver a elegirlo
en cada guía.

## Decisión

1. Columna nueva `ForestParty.tipoEstablecimiento TEXT NULL` (migración
   `20261016_forest_party_tipo_establecimiento`). Expand puro: nullable, sin default,
   sin backfill (medido: 0 fichas con papel «establecimiento» al 16-10-2026).
2. Valores: la lista cerrada `TIPOS_ESTABLECIMIENTO` de `lib/forestal/ctp-gtf-datos.ts`
   (la misma del selector del (19)). El Zod del Directorio acepta esa lista o `""`;
   lo que no está en la lista no viaja desde la guía (no se rechaza el guardado entero
   por un tipo viejo escrito a mano).
3. Escritura: `undefined` no toca la columna (una pantalla que no muestra el campo no
   lo borra); en el alta rápida por documento (`soloConValor`) lo vacío no pisa; sólo
   la edición explícita con `id` puede vaciarlo.
4. Lectura: la ficha de la libreta lo muestra con sello «Guía (19)» para el papel
   «establecimiento»; elegir el establecimiento en la partida llena el (19) con el de
   la ficha (o lo deja vacío si la ficha no lo tiene: el tipo del local anterior no es
   el de éste). «Guardar en la libreta» y «Guardar aparte» lo guardan.

## Consecuencias

- Tras `prisma generate`, un servidor de desarrollo que arrancó ANTES del generate
  tiene que reiniciarse (cliente viejo). El 16-10 no hizo falta: el que corría arrancó
  después y el POST del Directorio ya guardó y devolvió la columna.
- El importador/exportador Excel del Directorio no lleva la columna (tampoco lleva el
  (18)); importar sin ella no la borra (`undefined` no toca).
- Contract: no aplica (no reemplaza nada).
