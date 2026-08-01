# ADR-325 — Recibir no es lo mismo que la guía

- **Fecha:** 2026-08-01
- **Estado:** aceptado
- **Contexto:** Libro de Operaciones del CTP · Sección 1 (Ingresos) · fiscalización OSINFOR
- **Relacionado:** ADR-312 (la troza como pieza trazable) · ADR-313 (retrozado) · port de `~/proyectos/appforestal` (`ingresos-ctp`, `trozas-disponibles`)

## El problema

La GTF declara 25 trozas. Al patio llegan 23.

Hasta ahora el libro sólo guardaba **lo que dice el documento**: las 25 trozas de
la ficha de SERFOR entraban tal cual y las dos que nunca llegaron figuraban como
existencia. Una existencia que no existe es exactamente lo que un fiscalizador
encuentra al contar la pila, y la explicación "es que en la guía figuraba" no
sirve: el Libro de Operaciones declara lo que el centro **tiene**.

Faltaban además dos datos que son del CENTRO y no del documento, y que el ERP
forestal de referencia sí registraba:

- El **código de planta**: el número que se marca con pintura sobre la testa al
  recibir. Es por lo que se pregunta en el patio ("traeme la 118"), no por la
  codificación del bosque. Buleje tenía `WoodEntry.ctpProductCode`, pero es de la
  carga entera: no identifica la pieza.
- La **parcela de corta**: de qué parcela del POA salió el árbol. Es el cruce que
  hace OSINFOR pieza por pieza contra el plan del título habilitante. Sin ella la
  troza es trazable hasta la guía, pero no hasta el punto del bosque.

## La decisión

Cuatro columnas en `WoodEntryTroza` y un acto explícito de recepción.

### 1. La troza que no llegó se MARCA, no se borra

`noRecepcionada: Boolean @default(false)`. El documento dice que esa troza
existe; borrar la fila sería alterar el acta. Se marca, se explica en
`recepcionObs` y el volumen recibido se deriva sumando las que sí llegaron.

### 2. El volumen del ingreso NO se ajusta solo

`volumeM3` es lo que manda en los saldos y en la invariante I2 (Σ consumos ≤
volumen del ingreso). Si el sistema lo bajara automáticamente al detectar una
troza faltante, movería el piso de consumos **ya atribuidos**.

La diferencia se calcula, se muestra arriba de la lista —*"el ingreso está
registrado con 4.8740 m³ y lo recibido suma 1.6060 m³"*— y **la corrige el
operador**. Mismo criterio que el resto del libro: se declara el hueco, no se
tapa ni se arregla por atrás.

### 3. Los retrozos no se reciben

Un pedazo es la misma madera de su madre (ADR-313). Contarlo en el balance
duplicaría el volumen recibido, igual que en el Cuadro Resumen 1 donde el
retrozado no mueve el saldo. `balanceRecepcion()` filtra por `trozaOrigenId`.

### 4. Una sola llamada para toda la guía

Recibir 25 trozas son 25 ediciones seguidas. Con un PATCH por fila, cortarse la
señal a la mitad dejaría la recepción en un estado que no es ni el anterior ni el
nuevo. Va todo junto, en una transacción, y se valida que **todas** las trozas
pertenezcan a ese ingreso antes de escribir: un id colado de otra guía sería una
escritura cross-tenant.

### 5. El buscador entiende los dos códigos

`buscarTrozas` pasó a buscar por `codificacion` **o** `codigoPlanta`. Buscar sólo
por la del bosque dejaba media planta sin poder consultarse: en el patio nadie se
acuerda de `13/A (0000008)`, se acuerda del 118 pintado en la testa.

## Consecuencias

- Migración `325-troza-recepcion.sql`, idempotente. Se aplicó por el **pooler**:
  el DNS de `db.<ref>.supabase.co` no resuelve en algunas redes y este DDL es
  simple (`ADD COLUMN IF NOT EXISTS`), así que pasa por pgBouncer.
- Índice `(tenantId, codigoPlanta)` — se busca por él como por la codificación.
- Acción de auditoría nueva: `ctp_troza_recepcion`. El detalle narra qué trozas
  se marcaron como no llegadas, que es lo que se cruza contra el conteo de la pila.
- La lista de trozas del ingreso muestra las dos columnas nuevas y el badge
  "NO LLEGÓ"; el bloque de recepción se abre desde ahí.

## Lo que NO se hace

- No se borra la troza que no llegó.
- No se toca el volumen del ingreso automáticamente.
- No se exige el código de planta ni la parcela para guardar: el libro admite
  huecos, el certificado no. Se avisan, no se bloquean.

## Referencias

- `lib/forestal/recepcion-trozas.ts` · `__tests__/forestal-recepcion-trozas.test.ts`
- `lib/db/wood-entries.db.ts` → `actualizarRecepcion()`
- `components/admin/forestal/CtpRecepcionTrozas.tsx`
- `prisma/manual-migrations/325-troza-recepcion.sql` · `scripts/apply-325-migration.mjs`
