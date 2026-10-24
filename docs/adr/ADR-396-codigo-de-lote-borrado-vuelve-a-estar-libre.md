# ADR-396 — El código de un lote borrado vuelve a estar libre

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — «cuando se crea un lote, se elimina y se crea otro con el
  mismo nombre, quiero que sí se pueda».

## Contexto

`ForestLoteAserrio` se borra en blando (`deletedAt`), pero su código era único por
`@@unique([tenantId, code])` **sin mirar** `deletedAt`. Un lote armado por error, borrado
y vuelto a armar con el mismo nombre chocaba contra su propio fantasma: «El código ya
está en uso» para siempre. `codigoAUsar()` tampoco filtraba los borrados a propósito,
para no decir «libre» sobre un código que Postgres iba a rechazar.

Medido en la base antes de tocar: el índice era
`ForestLoteAserrio_tenantId_code_key ON ("tenantId", code)`, total.

## Decisión

1. **Índice único PARCIAL** — `ForestLoteAserrio_tenantId_code_vivo_key ON ("tenantId",
   "code") WHERE "deletedAt" IS NULL` (migración `adr-396-lote-codigo-reusable.sql`).
   Sólo los lotes vivos compiten por el código. Los borrados conservan el suyo: la
   auditoría sigue pudiendo decir «el LA-2026-010 se borró el día tal por quién».
2. **`schema.prisma` queda con `@@index([tenantId, code])`** y un comentario que apunta
   a la migración — Prisma no sabe expresar índices parciales (mismo precedente que
   `codigoPlanta`, migración 336).
3. **`codigoAUsar()` filtra `deletedAt: null`**, para que el mensaje y la base digan lo
   mismo.
4. **`siguienteCode()` sigue contando los borrados**: el correlativo automático
   `LA-2026-00N` no vuelve atrás. Un libro numerado con huecos se explica; uno con dos
   `LA-2026-007` distintos, no. Reusar un código es una decisión del operador (lo tipea),
   no algo que pase solo.

## Alternativas descartadas

- **Renombrar el código al borrar** (`LA-2026-007~borrado-…`): cero migración, pero el
  registro borrado pierde su nombre real y hay que reconstruirlo desde la auditoría.
- **Borrado físico**: el libro no borra asientos; la traza de qué se armó y se deshizo
  vale para un fiscalizador.

## Consecuencias

- Una carrera entre dos armados con el mismo código sigue cayendo en la base (P2002) y
  se reporta como error de invariante, igual que antes.
- Al restaurar un lote borrado (si algún día existe), habrá que chequear el código contra
  los vivos en ese momento.
