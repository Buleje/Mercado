# ADR-135: Libro CTP — el último tramo de la cadena: puente N:M despacho → producción

- **Estado:** Propuesto (2026-07-15) — **nada aplicado**. Ensayado contra prod con transacción revertida.
- **Relacionado:** ADR-124 (ingreso), ADR-126 (GTF), ADR-127 (Libro CTP), **ADR-134 (puente ingreso→producción, APLICADO)**
- **Zona de peligro:** `prisma/schema.prisma` · `lib/db/forest-ctp.db.ts` (I3 vive ahí)

---

## Contexto

ADR-134 **está aplicado en prod** (verificado 2026-07-15: `ForestCtpConsumo` + las 5 columnas existen).
La cadena de custodia hoy:

| Tramo | Cómo está | ¿Se puede fiscalizar? |
|---|---|---|
| ingreso → producción | **FK real** (`ForestCtpConsumo`, N:M) + I1/I2 | ✅ ADR-134 |
| producción → **despacho** | **texto libre** (`gtfNumber`, `destino`) | ❌ **el hueco** |

⇒ *"¿De qué árbol salió esta tabla que despaché?"* **no se puede responder de punta a punta.**
Es exactamente lo que exige **EUDR** (due diligence hasta el predio) y lo que fiscaliza **SERFOR**.
La mitad de la cadena está blindada y la otra mitad es una nota de texto.

### Estado real medido (prod, pooler, 2026-07-15)

```
ForestCtpEntry(main, produccion, lineNo=1, 'Madera aserrada'·'Tornillo', volumeInputM3=8.45, quantity=6.2 m3)
ForestCtpEntry(main, despacho,   lineNo=1, 'Madera aserrada'·'Tornillo', quantity=4.0 m3,
               gtfNumber='001-00000031', destino='Maderera Ucayali EIRL')
ForestCtpEntry(main, produccion, lineNo=2, 'Shihuahuaco', SOFT-DELETED)   ← ver D8
ForestCtpConsumo × 2 (ADR-134)
```

**Coincidencia útil y medida:** hay **una sola** corrida viva del producto que el despacho declara
⇒ el backfill deduce el origen sin adivinar nada (D6).

**El módulo no tiene uso productivo real todavía** — datos demo/QA. El valor está en **fijar la forma
antes de que entren datos reales**.

---

## Decisión

Fase **EXPAND única** (aditiva). **No hay CONTRACT**: `gtfNumber`/`destino` son el acta legal del
despacho (ADR-134 D2). El puente es **índice**, no reemplazo.

### D1 — Tabla puente `ForestCtpDespachoOrigen` (N:M), `ForestCtpEntry` × `ForestCtpEntry`

Un despacho real saca producto de **varias corridas** (se junta lo del martes con lo del jueves para
llenar el camión) y una corrida alimenta **varios despachos**. Un FK escalar obligaría al operador a
elegir una corrida y mentir sobre el resto — el mismo argumento que mató al FK escalar en ADR-134 D5.

Las **dos puntas son la misma tabla** ⇒ los campos se nombran por su **rol**, no por su tabla.

```prisma
model ForestCtpDespachoOrigen {
  id       String @id @default(cuid())
  tenantId String   // denormalizado — regla 3 + detección de fuga (D3 de ADR-134)

  despachoEntryId   String
  despacho          ForestCtpEntry @relation("DespachoOrigenDespacho",   fields: [despachoEntryId],   references: [id], onDelete: Cascade)
  produccionEntryId String
  produccion        ForestCtpEntry @relation("DespachoOrigenProduccion", fields: [produccionEntryId], references: [id], onDelete: Restrict)

  /// Hecho físico: cuánto de ESA corrida salió en ESE despacho. NOT NULL, > 0.
  /// Decimal(14,4) — la precisión se copia de la columna que la ACOTA
  /// (ForestCtpEntry.quantity), no de la tabla que se parece (ForestCtpConsumo = 12,4,
  /// que espeja WoodEntry.volumeM3). Copiar el 12,4 haría que una atribución no
  /// pudiera representar la cantidad de la línea que la contiene.
  quantity Decimal @db.Decimal(14, 4)

  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([despachoEntryId, produccionEntryId])   // una corrida 1 vez por despacho: se suma, no se duplica
  @@index([despachoEntryId])
  @@index([tenantId, produccionEntryId])
}

model ForestCtpEntry {
  /// Dos back-relations porque la misma tabla es despacho en una punta y corrida en la otra.
  origenes ForestCtpDespachoOrigen[] @relation("DespachoOrigenDespacho")    // de dónde salió lo que despaché
  salidas  ForestCtpDespachoOrigen[] @relation("DespachoOrigenProduccion")  // a qué despachos se fue esta corrida
}
```

**Sin soft-delete** (igual que `ForestCtpConsumo`): la atribución es detalle editable, no acta.
Quitar una atribución equivocada es **corregir**, no borrar historia.

---

### D2 — **I3 se queda. I4/I5 se agregan. No hay dos nociones de stock** ⭐ *(responde (a))*

La pregunta era si I3 (`assertStockDisponible`, stock por clave STRING `productKey`) se reemplaza por
una invariante por línea. **Se rechaza el reemplazo — y no por gusto: está medido.**

| | Invariante | Capa | Qué mide |
|---|---|---|---|
| **I3** *(existe)* | `Σ despachado(producto) ≤ Σ producido(producto)` | **acta** | el balance que se reporta |
| **I4** *(nueva, ≅ I1)* | `Σ origenes(línea despacho) ≤ despacho.quantity` | **índice** | no atribuir más de lo despachado |
| **I5** *(nueva, ≅ I2)* ⭐ | `Σ origenes(línea producción) ≤ produccion.quantity` | **índice** | **una corrida no se despacha dos veces** |

**La prueba de que NO se solapan (ensayo contra prod, §9, `forestal-ctp-despacho-rehearse.mjs`):**

| Escenario | I3 | I4 | I5 | Conclusión |
|---|---|---|---|---|
| **A** · despacho de 100 contra producción de 6.2, **sin atribuir** | ✅ **rechaza** (stock 6.2 < 100) | — | ❌ **ciego** (Σ=0 ≤ 6.2) | **I3 es irreemplazable**: con atribución parcial (D3), I5 es *vacua* cuando no se atribuye |
| **B** · 2 corridas (6.2 + 10), 2 despachos (6.2 + 10), **ambos citan la misma corrida** | ❌ **ciego** (16.2 − 16.2 = 0, el agregado cuadra) | ❌ **ciego** (6.2≤6.2 y 10≤10) | ✅ **atrapa** (16.2 sobre una corrida de 6.2) | **I5 aporta lo que el agregado no puede ver** |

> **Cada una atrapa exactamente lo que la otra deja pasar.** El escenario B *es* la pregunta de EUDR:
> el agregado dice que todo cuadra mientras una corrida específica sostiene 2.6× su producción —
> el patrón de blanqueo, ahora en la **salida**. I3 no lo ve porque razona sobre una suma por string;
> I5 lo ve porque razona **fila por fila**.

**Sobre "dos nociones de stock solapadas" — no las hay, y es deliberado:**

> **I5 no es un stock: es el techo de una fila.** El stock sigue siendo **uno solo** — el del acta (I3),
> el mismo que reporta `saldos()`. El puente agrega una **medida de cobertura** (`atribuidoQty` /
> `sinAtribuirQty`), no un segundo balance.

Es el corolario de ADR-134 D7 aplicado a la salida: **`saldos()` NO cambia · I3 NO cambia.**
Cero regresión en los números fiscales. La tentación a resistir es hacer que el stock derive de la
atribución: eso *sí* crearía dos verdades compitiendo, y con atribución parcial el stock derivado
mentiría por defecto.

---

### D3 — Atribución **parcial** en el libro, **total** en el certificado ⭐ *(responde (b))*

**`≤`, nunca `==`** (restricción del proyecto, y por la razón de ADR-134 D7): si la línea no se puede
guardar sin atribuir el 100%, el operador que no sabe el origen exacto **tiene que inventar uno**.
La regla que "garantiza" la integridad **fabrica el fraude que previene**. Casos reales que lo exigen:

- producto fabricado **antes** de que existiera el módulo (no hay corrida a la cual apuntar);
- lote **mezclado en patio** donde la corrida exacta ya no es distinguible.

**Pero EUDR sí exige cadena completa.** La contradicción se resuelve moviendo el gate de lugar:

> **El libro registra HECHOS (puede tener huecos). El certificado afirma CUMPLIMIENTO (no puede).**
> Se bloquea donde se hace la **afirmación**, no donde se registra el **hecho**.

| Momento | Regla |
|---|---|
| Guardar la línea / la atribución | **nunca se bloquea por hueco** — `sinAtribuirQty` explícito y medido |
| Emitir el certificado EUDR / DDS de una GTF de salida | **`trazabilidadCompleta(despachoId)` = gate**: hueco ⇒ no se emite, con el faltante a la vista |

`trazabilidadCompleta` = `sinAtribuirQty == 0` en el despacho **y** en cada corrida citada
(`ForestCtpConsumoDB` ya da `sinAtribuirM3` del tramo de ingreso). Recién ahí la cadena
despacho → corrida → ingreso → GTF → predio está cerrada de punta a punta.

**En la UI:** el picker **pre-llena la atribución sólo si es deducible** (una única corrida candidata con
saldo, D6). Con 2+ candidatas **no adivina**: las ofrece y el operador elige. Un pre-llenado "inteligente"
sobre datos ambiguos es la misma mentira, sólo que con un click de coartada.

---

### D4 — Coherencia del puente: qué se bloquea al escribir (y qué no)

| Guard | ¿Bloquea? | Por qué |
|---|---|---|
| Mismo `tenantId` en despacho, corrida y origen | **sí** | El FK **no aísla tenants** — medido en el ensayo (D3 de ADR-134, reconfirmado) |
| Orientación: `despacho.section='despacho'` ∧ `produccion.section='produccion'` | **sí** | Postgres sólo ve "ForestCtpEntry" en ambas puntas — **medido: acepta la orientación invertida** |
| Ambas líneas vivas y `status='registrado'` | **sí** | Una corrida anulada no despachó nada |
| **Misma `unit`** | **sí** | I4/I5 **suman** `quantity`. Sumar 3 m³ con 3 pt no da 6 de nada. Precedente: `monedas_mezcladas` (ADR-134 D6) |
| **Mismo `productKey`** (productType + especie) | **sí** | I3 **ya** define la identidad del producto con esa clave y ya gatea la creación del despacho con ella. Si la atribución pudiera cruzar productos, I3 e I5 se contradirían y la cadena afirmaría una falsedad física |

> **Por qué bloquear acá NO fabrica fraude** (a diferencia de forzar `==`): el escape honesto existe —
> **dejar el despacho sin atribuir**. Una regla fabrica fraude sólo cuando la única forma de avanzar es
> mentir. Acá el operador siempre puede avanzar diciendo la verdad ("no sé de qué corrida salió").

---

### D5 — El lock va sobre las **CORRIDAS**, no sobre el despacho ⭐

Repetir acá el TOCTOU que ya nos comió una vez (2026-07-15: se lockeaba la línea y no el ingreso; dos
corridas paralelas consumieron 20 m³ de un ingreso de 10) sería imperdonable **teniendo la lección escrita**.

> **El recurso disputado es la CORRIDA**, no el despacho. Dos despachos distintos que citan la misma
> corrida **lockean líneas distintas**, no se bloquean entre sí, y bajo READ COMMITTED **ambos leen el
> mismo saldo** antes de que el otro commitee ⇒ **los dos pasan I5 y la corrida se despacha dos veces**.

`setOrigenes` en **una** `$transaction`:

1. `SELECT … FOR UPDATE` de la **línea de despacho** (placeholders `$1`, regla 11);
2. `SELECT … FOR UPDATE` de **las corridas citadas**, **`ORDER BY id`** (mismo orden en toda tx ⇒ sin deadlock);
3. validar tenant + orientación + unit + productKey + vivas;
4. `SUM` actual + delta ≤ límite ⇒ **I4** e **I5**;
5. escribir. Violación ⇒ `throw CtpInvariantError` ⇒ **422 con el detalle** (el operador tiene que ver *cuánto* se pasó).

El test de concurrencia (`__tests__/forestal-ctp-consumo.test.ts` ya tiene el patrón: dos
`Promise.allSettled` en paralelo) es **parte del entregable, no opcional**: es lo único que prueba el punto 2.

---

### D6 — Backfill de la línea de despacho demo *(responde (c))*

`INSERT … SELECT` idempotente al final del EXPAND. **Sin cron ni batches**: es 1 fila (batchear 1000/s
con pausa sería teatro).

| Paso | Regla |
|---|---|
| Alcance | `section='despacho'` · `status='registrado'` · `deletedAt IS NULL` · `quantity > 0` |
| Match | misma `productKey` **normalizada igual que `productKey()` del TS** + misma `unit` + corrida viva/registrada — **sólo si es ÚNICA** (D1 de ADR-134). Empate ⇒ no se escribe |
| Cantidad | `LEAST(despacho.quantity, saldo_corrida)` ⇒ **I4 e I5 por construcción, no por suerte** |
| Idempotencia | `NOT EXISTS (origenes del despacho)` + `ON CONFLICT DO NOTHING` ⇒ N veces == 1 vez, y **nunca pisa lo que cargó el operador** |
| `createdBy` | `'backfill:adr-135'` — distinguible de lo cargado a mano, para siempre |

> La normalización SQL **espeja** `productKey()`/`speciesKey()` (trim → lower → colapsar espacios → `'—'`).
> Un `lower(trim())` a secas (lo que hizo ADR-134) **divergiría** de lo que I3 considera "el mismo
> producto" ⇒ el backfill atribuiría distinto de lo que la invariante exige. Por eso el `regexp_replace`.

**Resultado medido en el ensayo (transacción revertida, prod):**

| Fila | Qué le pasa |
|---|---|
| `despacho` lineNo=1 (4.0000 m³) | → **1 origen de 4.0000** contra la corrida lineNo=1. **I4 con igualdad exacta**, `sinAtribuir = 0.0000` |
| `produccion` lineNo=1 (6.2000) | quedan **2.2000 sin despachar** — disponibles para el próximo despacho (I5 respetada) |
| `produccion` lineNo=2 (soft-deleted) | **no participa** — ni como candidata ni en los agregados (D8) |
| Acta (`gtfNumber`, `destino`, `quantity`) | **intacta** — 0 filas creadas/borradas, 0 campos de acta tocados |
| ADR-134 (`ForestCtpConsumo`) | **intacto** — 2 → 2 |

Las filas demo no se rompen porque **la invariante se eligió para que ya fuera verdad el día 0**
(`Σ=0 ≤ 4.0` antes; `Σ=4.0 ≤ 4.0` después). Si el backfill no corriera, **nada se rompe**: es una
*mejora* (mueve 4 m³ de "sin atribuir" a "atribuido"), no un rescate.

---

### D7 — El puente **no** tiene costo propio

El costo del producto despachado se deriva de la corrida citada
(`ForestCtpConsumoDB.costoDeLinea → costoUnitario`), que **ya tiene su congelado al cierre** (ADR-134 D6).
Un 2º `costoUnitarioSnap`/`congeladoAt` acá serían **dos relojes que se desincronizan**, y el COGS del
despacho pasaría a depender de cuál se leyó. Se deriva: `COGS(despacho) = Σ origen.quantity × costoUnitario(corrida)`,
con la misma regla de oro — **falta factura ⇒ `null`, nunca `0`** (un `0` fingiría margen 100%).

---

### D8 — HALLAZGO en ADR-134 ya aplicado: consumos huérfanos de líneas muertas ⚠️

El ensayo lo **midió en prod**, no es teoría:

```
WoodEntry '001-0000121' (Shihuahuaco, 5.2 m³):
  consumido según saldos()          = 0      ⇒ "hay 5.2 libres"
  consumido según availableSource() = 5.2    ⇒ "no queda nada"
```

**Causa:** el `ForestCtpConsumo` de la corrida lineNo=2 **sobrevivió al soft-delete de su línea** y
sigue comiendo el ingreso. El `groupBy` de I2 (`setConsumos`) y el de `availableSource()` **no filtran
por el estado de la línea padre**; `saldos()` sí (`deletedAt: null`, `status: 'registrado'`).

**Impacto:** esa madera queda **invisible en el picker para siempre** (`disponible = 0` ⇒ `.filter(w => w.disponible > 0)`
la descarta) y **I2 la da por consumida**. Borrar/anular una corrida **secuestra su materia prima**.
Que las dos capas den números distintos del mismo hecho es la prueba de que es un **bug, no una política**.

**Fix (en el Plan, Paso 3):** filtrar por el estado de la línea padre en los dos `groupBy`.
No borrar los consumos al anular: la atribución de una línea anulada es parte de lo que se declaró —
se **ignora** en el agregado, no se destruye.

⇒ **El puente de este ADR no repite el bug: I4/I5 cuentan sólo líneas vivas y `registrado`**, y el
backfill excluye las muertas de las candidatas.

---

## Plan detallado

### Paso 0 — Pre-flight (obligatorio)

```bash
node scripts/forestal-ctp-backfill-verify.mjs --snapshot   # incluye ForestCtpDespachoOrigen: acá SÍ hay datos propios
node scripts/forestal-ctp-despacho-rehearse.mjs            # ENSAYO contra prod, revierte solo. exit 0 = apto
```

### Paso 1 — EXPAND: SQL idempotente vía pooler

```bash
node scripts/apply-sql.mjs scripts/forestal-ctp-despacho-origen-migration.sql
```

| Propiedad | Cómo |
|---|---|
| Idempotente | `CREATE TABLE/INDEX IF NOT EXISTS`, FK con guard `pg_constraint`, backfill con `NOT EXISTS` + `ON CONFLICT` |
| Sin lock largo | FK `NOT VALID` + `VALIDATE` aparte (evita `ACCESS EXCLUSIVE` durante el scan) |
| Sin table rewrite | Tabla nueva; no se toca ninguna columna existente |
| Atómico | `apply-sql.mjs` envuelve en `BEGIN`/`COMMIT` |

### Paso 2 — Sincronizar `schema.prisma` (DESPUÉS de que el SQL corrió)

⚠️ **Orden no negociable** (R4 de ADR-134): editar el schema antes ⇒ `P2021`/`P2022` en runtime.

```bash
# aplicar el bloque de D1 a prisma/schema.prisma
npx prisma generate && npx tsc --noEmit && npm run db:sanity
```

### Paso 3 — Capa DB

| Archivo | Cambio |
|---|---|
| `lib/db/forest-ctp-despacho.db.ts` **(nuevo)** | `ForestCtpDespachoDB.setOrigenes()` — D5 completo (lock de **corridas** ordenado por id, tenant/orientación/unit/productKey, I4/I5, audit `ctp_origenes_set` con "de → a"). Espeja `forest-ctp-consumo.db.ts` |
| idem | `listByDespacho()` · `trazabilidadCompleta(despachoId)` (D3) · `cogsDeDespacho()` (D7) |
| `lib/db/forest-ctp.db.ts` | `CtpEntryInput` + `origenes?: { produccionEntryId, quantity }[]`; en `create` se escriben **después** del INSERT, por su propia vía (mismo patrón que `consumos`) |
| `lib/db/forest-ctp.db.ts` → **I3** | **NO se toca** (D2) |
| `lib/db/forest-ctp.db.ts` → `availableSource('despacho')` | devolver **`produccionEntryId`** + **saldo por corrida** (hoy agrega por `productKey` y **no devuelve ids** — sin id no hay puente, el mismo bug que ADR-134 arregló para `produccion`) |
| `lib/db/forest-ctp-consumo.db.ts` + `availableSource('produccion')` | **fix D8**: filtrar el `groupBy` por línea viva/registrada |
| `CtpInvariantError.code` | + `I4_SOBRE_ATRIBUCION_DESPACHO` · `I5_SOBRE_SALIDA_PRODUCCION` |

### Paso 4 — API + UI

| Archivo | Cambio |
|---|---|
| `app/api/admin/forestal/ctp/origenes/route.ts` **(nuevo)** | Espeja `consumos/route.ts`: `GET ?despachoEntryId` · `PUT { despachoEntryId, origenes }`. Zod `safeParse`, `.max(50)`, invariante ⇒ **422** |
| `app/api/admin/forestal/ctp/route.ts` | `origenes` en `createSchema` |
| `components/admin/forestal/CtpEntryForm.tsx` | En `despacho`: picker de **N corridas** (saldo a la vista, total vs `quantity` en vivo, hueco visible). Pre-llena **sólo si la candidata es única** (D3) |

### Paso 5 — Tests (no opcional)

`__tests__/forestal-ctp-despacho.test.ts` contra **DB real** (mismo criterio del ADR-134: un mock no
prueba locks): I4, I5, tenant, orientación, unit, productKey, parcial permitido, y **el de concurrencia**
(dos `setOrigenes` en paralelo sobre la misma corrida ⇒ uno falla).

### Timeline

| Fase | Cuándo | Gate |
|---|---|---|
| EXPAND (SQL + schema + DB + API + UI) | Deploy N | ensayo `exit 0` + `tsc` + `lint` + `node scripts/build-gate.mjs` + verify |
| CONTRACT | **NUNCA** (el acta se queda) | — |

Todo en **un solo deploy**: la tabla es nueva y el código viejo la ignora ⇒ **zero downtime por
construcción, no por coreografía**.

---

## Plan de rollback

| Momento | Acción |
|---|---|
| SQL aplicado, código NO deployado | `scripts/forestal-ctp-despacho-origen-rollback.sql` (dropea la tabla). Seguro: nada la escribe |
| Código deployado, bug en UI | **Revert del deploy. La tabla se queda** (inerte). Dropearla con el código nuevo vivo = P2021 |
| Backfill atribuyó mal | `DELETE FROM "ForestCtpDespachoOrigen" WHERE "createdBy" = 'backfill:adr-135'` — quirúrgico, **sin tocar lo del operador** |

> Igual que ADR-134 rev.2: `DROP TABLE` **sí borra datos propios** (la atribución) ⇒ el `--snapshot` la
> incluye. Aun así el libro fiscal sobrevive intacto: se pierde el **índice** (re-derivable con el
> backfill), nunca el **acta**. **D2 y D3 son también la red de rollback.**

---

## Observabilidad

Extender `scripts/forestal-ctp-backfill-verify.mjs`:

| Métrica | Umbral |
|---|---|
| **I5 · Corrida sobre-despachada** (`Σ origenes > produccion.quantity`) | **0 — crítica.** Blanqueo en la salida. Postgres **no** lo previene (medido) |
| **I4 · Despacho sobre-atribuido** | **0 — crítica** |
| **Fuga cross-tenant** (origen ↔ despacho ↔ corrida) | **0 — crítica.** El FK **no** lo previene (medido) |
| **Orientación inválida** (`section` cruzada) | **0 — crítica.** Postgres la acepta (medido) |
| Origen con `unit` o `productKey` distinto entre puntas | 0 |
| Origenes contra líneas soft-deleted/anuladas | 0 — el FK no ve el borrado lógico (D8) |
| **Cobertura de trazabilidad** (`Σ atribuido / Σ despachado`) | Informativo hoy (100%); **>90% a 30 días**. **<100% no es error** (D3) |
| Despachos EUDR-completos (cadena cerrada hasta el ingreso) | Cola de trabajo para certificación |
| **[D8] Ingresos bloqueados por consumos de líneas muertas** | **>0 hoy (1) ⇒ arreglar en Paso 3** |
| `productKey` con ≥2 `unit` distintas | >0 ⇒ I3 estaría sumando peras con manzanas (latente, 0 hoy) |

---

## Riesgos

| # | Riesgo | Prob. | Mitigación |
|---|---|---|---|
| **R1** | **Doble despacho de la misma corrida (blanqueo en la salida)** | **Media** | **I5 en la capa DB + métrica crítica.** Postgres no puede (agregado). Es el riesgo que el puente viene a cerrar |
| R2 | **TOCTOU**: dos despachos concurrentes drenan la misma corrida | **Alta si se copia mal** | D5: lock de **las corridas** (no del despacho) ordenado por id, dentro de la tx del INSERT + test de concurrencia. **Ya nos pasó una vez** |
| R3 | Fuga cross-tenant | Media | Guard app-level + métrica. **Medido: el FK deja pasar** |
| R4 | Orientación invertida (despacho↔producción) | Baja | Guard app-level. **Medido: Postgres la acepta** |
| R5 | Backfill ata el despacho a la corrida equivocada | Baja (hoy), Media (futuro) | D6: sólo match único. `createdBy='backfill:adr-135'` ⇒ reversible quirúrgicamente |
| R6 | `schema.prisma` editado antes del SQL ⇒ P2021/P2022 | **Alta** (error humano) | Paso 2 explícito + `db:sanity` |
| R7 | `prisma migrate dev` por costumbre ⇒ CREATE TABLE de todo lo forestal | **Alta** | B2 de ADR-134 sigue vigente: **sólo** SQL manual |
| R8 | Alguien hace derivar el stock de la atribución | Media | D2: I3 y `saldos()` **no se tocan**. El puente es índice, no balance |
| R9 | El hueco de atribución se lee como "dato faltante" y alguien fuerza `==` | Media | D3 documentado + `sinAtribuirQty` como **cola de trabajo**, no como error |

---

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| **Reemplazar I3 por I5** | **Medido (escenario A):** con atribución parcial, I5 es vacua sin atribución ⇒ un despacho de 100 contra una producción de 6.2 pasaría. Sería un downgrade de seguridad |
| **Sólo I3 (no agregar I4/I5)** | **Medido (escenario B):** el agregado cuadra mientras una corrida sostiene 2.6× su producción. Es el hueco de EUDR que abrió este ADR |
| **`Σ origenes == despacho.quantity` enforced** | Fabrica el fraude que previene (ADR-134 D7): sin origen conocido, el operador inventa uno. Además rompería el stock legacy (producto anterior al módulo) |
| **FK escalar `produccionEntryId` en la línea de despacho** | Un despacho real junta varias corridas ⇒ obligaría a elegir una y mentir sobre el resto (ADR-134 D5) |
| **Stock derivado de la atribución** (matar I3 y `saldos()`) | Crea 2 verdades compitiendo; con atribución parcial el stock derivado **miente por defecto**. Rompe los números fiscales ya reportados |
| **Bloquear el despacho sin trazabilidad completa** | El libro registra hechos; el certificado afirma cumplimiento. Bloquear el hecho no crea trazabilidad: crea trazabilidad **inventada** (D3) |
| **Constraint trigger `DEFERRABLE` para I4/I5** | Cero precedente en el repo; pelea con la filosofía app-level. La capa DB ya es el único escritor |
| **`costoUnitarioSnap` propio en el puente** | Dos relojes de congelado que se desincronizan (D7) |
| **`Decimal(12,4)` copiando ForestCtpConsumo** | La precisión se copia de la columna que **acota** (`ForestCtpEntry.quantity` = 14,4), no de la tabla que se parece |
| **Permitir atribuir entre productos distintos** | I3 ya define la identidad del producto por `productKey`; cruzarlos haría que las dos capas se contradigan y la cadena afirme una falsedad física (D4) |
| **Borrar los consumos al anular la línea** (fix alternativo de D8) | La atribución de una línea anulada es parte de lo declarado: se **ignora** en el agregado, no se destruye |

---

## Referencias

- `scripts/forestal-ctp-despacho-origen-migration.sql` · `…-rollback.sql` · `scripts/forestal-ctp-despacho-rehearse.mjs` (ensayo, **exit 0** 2026-07-15)
- `lib/db/forest-ctp.db.ts` — `assertStockDisponible()` (I3), `productKey()`, `availableSource()`, `saldos()`
- `lib/db/forest-ctp-consumo.db.ts` — `setConsumos()` (I1/I2 + lock del recurso disputado), `costoDeLinea()`
- `__tests__/forestal-ctp-consumo.test.ts` — patrón del test de concurrencia (encontró el TOCTOU real)
- ADR-134 (aplicado) — D1 (match único), D2 (acta vs índice), D3 (el FK no aísla tenants), D5 (N:M), D6 (costo), D7 (`≤` y no `==`)
- CLAUDE.md reglas 1, 2, 3, 11, 12, 14
