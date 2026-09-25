# ADR-134: Libro CTP — trazabilidad real de consumo (N:M), costos y FK a Supplier

- **Estado:** Propuesto — **rev. 2** (2026-07-15)
- **Fecha:** 2026-07-15
- **Relacionado:** ADR-124 (ingreso de madera), ADR-126 (GTF), ADR-127 (Libro CTP completo)
- **Zona de peligro:** `prisma/schema.prisma` (189 modelos)

---

## Changelog de la revisión

| | rev. 1 | **rev. 2** |
|---|---|---|
| Trazabilidad | FK escalar `ForestCtpEntry.woodEntryId` (1 línea ← 1 ingreso) | **DESCARTADO** → tabla puente `ForestCtpConsumo` (N:M) — **D5** |
| Costo de MP en la línea | Columna `costoMateriaPrima` almacenada | **No se almacena**: derivado on-read, congelado al cierre — **D6** |
| Costo del ingreso | `costoUnitario` + `costoTotal` | Sólo `costoTotal` (la factura); el unitario se deriva — **D6** |
| Invariante de volumen | (no existía) | **I1 + I2**, `≤` y no `==`, enforced en la capa DB — **D7** |
| Backfill | `UPDATE` de 1 FK | `INSERT` de 1 consumo, con guard de saldo — **D8** |

**Disparador:** decisión de negocio de Brandon (2026-07-15) — *una corrida de producción real SÍ mezcla
varias guías de ingreso*. El supuesto 1:1 de la rev. 1 (D5, "limitación aceptada") es falso en el dominio real.

**El SQL de la rev. 1 NUNCA se aplicó** — verificado contra prod 2026-07-15: **0 de las 9 columnas existen**.
⇒ La revisión no cuesta migración correctiva ni rollback. Se reescribe el SQL, no se parcha.
Lo verificado en la rev. 1 (bloqueadores B1–B3, mediciones, D1–D4) **se mantiene**.

---

## Contexto

Hoy el Libro CTP encadena ingreso → producción → despacho con **texto libre**:

| Campo | Modelo | Hoy | Problema |
|---|---|---|---|
| `gtfIngreso` | `ForestCtpEntry` | `String?` | No garantiza que la GTF exista |
| `materiaPrimaRef` | `ForestCtpEntry` | `String?` | "lote / acopio" — sin destino |
| `providerName` | `WoodEntry` | `String` (NOT NULL) | No enlaza al maestro `Supplier` |

Además no hay **costo** en ninguno de los dos modelos: el libro cuadra volúmenes (m³) pero no plata.
`ForestCtpDB.saldos()` cruza `WoodEntry` × `ForestCtpEntry` **por nombre de especie normalizado**
(`speciesKey()`) — un join por string, frágil ante tipeo.

### Estado real de los datos (medido en prod vía pooler, 2026-07-15)

| Tabla | Filas vivas | Detalle |
|---|---|---|
| `WoodEntry` | **2** | ambas en tenant `main`. (Hay una 3ª, `TEST-001` del tenant `cmom36x91…`, **soft-deleted** desde 2026-05-28 — la rev. 1 la contaba como viva) |
| `ForestCtpEntry` | **2** | ambas en `main`: 1 `produccion` + 1 `despacho` |
| `ForestGtf` | 2 | 1 por tenant |
| `Supplier` | 2 | `Proveedor Dropship Demo`, `Proveedor QA Test` — **ninguno en `main`** |

Las filas que importan:

```
ForestCtpEntry(main, produccion, lineNo=1, gtfIngreso='001-0000120',
               speciesCommon='Tornillo', volumeInputM3=8.4500, quantity=6.2 m³)
ForestCtpEntry(main, despacho,   lineNo=1, gtfIngreso=NULL, volumeInputM3=NULL, quantity=4.0 m³)

WoodEntry(d0f1c1c7…, main, gtf='001-0000120', 'Tornillo',    volumeM3=8.4500, validado)
WoodEntry(b40c4e8a…, main, gtf='001-0000121', 'Shihuahuaco', volumeM3=5.2000, validado)
```

> **Coincidencia útil y medida:** la línea de producción declara `volumeInputM3 = 8.4500`, exactamente el
> `volumeM3` del ingreso `001-0000120`. ⇒ El backfill produce un consumo que satisface **I1 e I2 con igualdad
> exacta, sin residuo** (D8). No hay que elegir cómo repartir nada.

**El módulo no tiene uso productivo real todavía — son datos demo/QA.** El riesgo de pérdida es ~nulo;
el valor del ADR está en **fijar la forma correcta antes de que entren datos reales**.

### Bloqueadores de mecánica (verificados, rev. 1 — siguen vigentes)

| # | Hallazgo | Evidencia |
|---|---|---|
| B1 | `prisma migrate deploy` **no es opción** | `DIRECT_URL` → `getaddrinfo ENOTFOUND db.sofkgguriggocouiuamx.supabase.co` (CLAUDE.md regla 14) |
| B2 | Las tablas forestales **no están en el historial de migraciones** | `grep -rl "WoodEntry\|ForestCtpEntry\|ForestGtf" prisma/migrations/` → **0 hits**. Creadas por `db push` / SQL manual |
| B3 | Historial drifteado | prod `_prisma_migrations` = **61** aplicadas vs **63** dirs locales; 3 `rolled_back_at` |

Por B2, `prisma migrate dev` generaría `CREATE TABLE` de todo lo forestal y **fallaría en prod** (ya existen).
Por B1+B3, la vía es **SQL idempotente por el pooler** — precedente: `scripts/credit-requests-migration.sql`.

---

## Decisión

Fase **EXPAND única** (aditiva). **No hay fase CONTRACT** — ver D2.

### D1 — El backfill por `gtfNumber` es ambiguo por diseño → sólo match ÚNICO *(rev. 1, sin cambios)*

`ForestGtf.items` es un `Json` con **N trozas/productos**. `WoodEntryForm` carga una guía y toma **un ítem**
(`components/admin/forestal/WoodEntryForm.tsx:209`) → **1 GTF ⇒ N `WoodEntry`, uno por especie/ítem.**
Por eso `WoodEntry.gtfNumber` **no es único y no puede serlo**.

**Regla:** desambiguar por `(tenantId, gtfNumber, speciesCommon)` y backfillear **sólo si el match es único**
(`COUNT(*) = 1`). Empate ⇒ no se escribe. En un libro que fiscaliza SERFOR, **`NULL` honesto > FK adivinada**.

### D2 — Los campos de texto **se quedan**: son el acta legal, no deuda técnica *(rev. 1, sin cambios)*

`providerName`, `gtfIngreso` y `materiaPrimaRef` son el **snapshot de lo que decía la guía al momento del ingreso**.
Si mañana el `Supplier` se renombra, el libro debe seguir diciendo lo que decía el papel.

⇒ **`providerName` sigue `NOT NULL`. No se dropea nada. La trazabilidad es aditiva** — habilita joins,
no reemplaza al texto. Esto elimina las fases MIGRATE-dual-write y CONTRACT: no hay dos fuentes compitiendo,
hay **acta (texto) + índice (relación)**. *Esta jerarquía es el eje del ADR: D6 y D7 son el mismo patrón
aplicado a la plata y al volumen.*

### D3 — Postgres no aísla tenants: hay que enforzarlo en la capa DB *(rev. 1, ampliado)*

Un FK Postgres **no impide** que un `ForestCtpConsumo` del tenant A cite un `WoodEntry` del tenant B.
El aislamiento del repo es app-level (no RLS).

> **Verificado empíricamente** en el ensayo (`forestal-ctp-migration-rehearse.mjs`, control negativo):
> el `INSERT` cross-tenant **fue aceptado por Postgres**. No es una hipótesis, es un hecho medido.

⇒ `ForestCtpDB` **debe verificar** que `ctpEntryId` y `woodEntryId` pertenezcan al `tenantId` antes de escribir.
Idem `supplierId` en `WoodEntriesDB`.

### D4 — `onDelete` *(rev. 2: cambia el sujeto del FK)*

| Relación | Política | Razón |
|---|---|---|
| `ForestCtpConsumo.ctpEntryId → ForestCtpEntry` | `Cascade` | El consumo es **detalle** de la línea: sin línea no significa nada. `ForestCtpEntry` es soft-delete ⇒ no dispara en la práctica |
| `ForestCtpConsumo.woodEntryId → WoodEntry` | `Restrict` | Borrar un ingreso citado por una corrida rompe la cadena de custodia. `WoodEntry` es soft-delete ⇒ red gratis |
| `WoodEntry.supplierId → Supplier` | `SetNull` | `providerName` (D2) sobrevive al borrado ⇒ el acta no se pierde; no bloqueamos la baja de proveedores |

> El soft-delete hace que `Restrict`/`Cascade` casi nunca disparen. Se ponen igual: cuestan cero y son la
> red para el día que alguien haga un `DELETE` real desde un script.

---

### D5 — **Tabla puente `ForestCtpConsumo` (N:M). El FK escalar queda descartado** ⭐ *(rev. 2)*

La rev. 1 aceptó `woodEntryId` escalar "porque modela el caso común". **La decisión de negocio lo refuta:
una corrida mezcla varias guías.** Con un FK escalar, el operador que mezcla 3 ingresos debe elegir uno
y mentir sobre los otros dos — el FK escalar no es una simplificación, es un **generador de datos falsos**
en un libro fiscalizado. Se descarta antes de existir.

```prisma
model ForestCtpConsumo {
  id       String @id @default(cuid())
  tenantId String   // denormalizado — regla 3 + detección de fuga (D3)

  ctpEntryId  String
  ctpEntry    ForestCtpEntry @relation(fields: [ctpEntryId],  references: [id], onDelete: Cascade)
  woodEntryId String
  woodEntry   WoodEntry      @relation(fields: [woodEntryId], references: [id], onDelete: Restrict)

  /// Hecho físico: m³ de ESE ingreso que entraron en ESA corrida. NOT NULL, > 0.
  volumeM3 Decimal @db.Decimal(12, 4)   // 4 dec = precisión forestal

  /// NULL = costo vivo (on-read). NOT NULL = congelado al cierre. Ver D6.
  costoUnitarioSnap Decimal?  @db.Decimal(12, 2)
  congeladoAt       DateTime?

  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([ctpEntryId, woodEntryId])   // un ingreso aparece 1 vez por línea: se suma, no se duplica
  @@index([ctpEntryId])
  @@index([tenantId, woodEntryId])
}
```

**Sin soft-delete.** El consumo es detalle editable, no acta: mientras la línea no esté congelada, quitar una
atribución equivocada es corregir, no borrar historia. El acta (`volumeInputM3`, `gtfIngreso`) nunca se toca.
Congelado (`congeladoAt != NULL`) ⇒ inmutable.

---

### D6 — Costo: **derivado on-read, congelado al cierre**. Ni snapshot puro ni cálculo puro ⭐ *(rev. 2 · responde (a))*

**El hecho que decide:** en Perú **la factura del proveedor llega DESPUÉS de la corrida**. Al momento de crear
el consumo, `WoodEntry.costoTotal` es **NULL** en la mayoría de los casos.

| Opción | Qué pasa con la factura tardía | Veredicto |
|---|---|---|
| **Snapshot puro** al crear el consumo | Congela **NULL para siempre**. El costo real nunca entra solo. Haría falta un cron que camine hacia atrás repescando cada consumo cuando llega cada factura — mecanismo nuevo, con su propio lag y sus propios bugs | ❌ **El snapshot congela la ignorancia**, no el costo |
| **On-read puro** desde `WoodEntry` | Cuando llega la factura, **todas** las líneas que consumieron ese ingreso se encienden retroactivamente, gratis, sin backfill. Pero una corrección posterior (nota de crédito, factura rectificada) **reescribe en silencio el margen de períodos ya cerrados y reportados** | ❌ auditoría rota |
| **Híbrido: on-read hasta el cierre, congelado al cerrar** | La factura tardía entra sola mientras el período está abierto; al cerrar, la plata se vuelve acta y deja de moverse | ✅ **elegido** |

**Fórmula:**

```
costoUnitario(consumo) = COALESCE(
    consumo.costoUnitarioSnap,                       -- congelado: manda
    wood.costoTotal / NULLIF(wood.volumeM3, 0)       -- vivo: derivado de la factura
)
costoMateriaPrima(línea) = Σ  consumo.volumeM3 × costoUnitario(consumo)
costoTotal(línea)        = costoMateriaPrima(línea) + línea.costoProceso
```

Es un **promedio ponderado por volumen consumido** — exactamente lo que hace falta cuando la corrida mezcla
ingresos de precios distintos (que es el caso que abrió esta revisión: si mezclás guías, mezclás precios).

**Regla de oro: sin factura ⇒ el costo es `NULL`, no `0`.** Un `0` produciría en silencio un margen del 100%.
`NULL` dice "todavía no sé". *Es D1 aplicado a la plata: **costo NULL honesto > costo inventado**.*

**Corolarios (por qué se borran columnas de la rev. 1):**

- **`ForestCtpEntry.costoMateriaPrima` NO se almacena.** Con facturas tardías, un derivado almacenado está
  **garantizado** a quedar podrido: se calcularía como NULL al crear la línea y nadie lo recalcularía.
  La realidad peruana no sólo permite el cálculo on-read — **lo exige**.
- **`ForestCtpEntry.costoTotal` NO se almacena.** Derivado de lo anterior + `costoProceso`.
- **`WoodEntry.costoUnitario` NO se almacena.** La **factura dice un total** — eso es el acta (D2).
  El unitario es `costoTotal / volumeM3`. Guardar los dos = drift garantizado. Y si el volumen se recubica,
  lo que pagaste no cambia: el total sigue siendo verdad y el unitario efectivo se mueve solo, que es
  económicamente correcto. Si el trato fue "S/ 850 el m³", la UI multiplica y guarda el total.

**Queda en `ForestCtpEntry`:** `costoProceso` (input genuino: aserrío/secado/mano de obra — sin él no hay
margen, sólo costo de compra) + `moneda`. Nada más.

**El congelado lo dispara el cierre de período** (acción explícita del usuario), no un cron: congelar es una
decisión contable, no un evento de tiempo.

---

### D7 — La invariante: **`Σ ≤ volumeInputM3`, no `==`**. Y la que de verdad importa es la del ingreso ⭐ *(rev. 2 · responde (b))*

**La igualdad estricta `Σ ForestCtpConsumo.volumeM3 == ForestCtpEntry.volumeInputM3` se RECHAZA.** Tres razones,
en orden de peso:

1. **Contradice D1 y fabrica el fraude que D1 previene.** Si la línea no se puede guardar hasta atribuir el
   100% del input a ingresos identificados, el operador que no sabe el origen exacto (o cuyo material es
   anterior al módulo) **tiene que inventar uno para poder guardar**. La regla que "garantiza" la integridad
   produce datos falsos. En un libro que fiscaliza SERFOR, **eso es peor que un hueco declarado**.
2. **No es enforceable en Postgres.** Un `CHECK` no puede agregar cross-tabla. Sólo un constraint trigger
   `DEFERRABLE` podría — cero precedente en el repo, y pelea contra la filosofía app-level que D3 ya fijó.
3. **Rompería las 2 filas demo el día 0** (la línea de producción declara 8.45 con 0 consumos).

**Lo que se enforza en cambio — dos invariantes, ambas `≤`:**

| | Invariante | Qué significa | Por qué |
|---|---|---|---|
| **I1** | `Σ consumos(línea) ≤ línea.volumeInputM3` | La atribución no puede exceder lo declarado | Coherencia interna |
| **I2** | `Σ consumos(ingreso) ≤ ingreso.volumeM3` | **Un ingreso no se puede consumir dos veces** | ⭐ **el premio** |

> **I2 es la invariante de más valor de todo el ADR y no existía con el FK escalar.** Sin ella, se puede
> atribuir el mismo ingreso legal de 8.45 m³ a cinco corridas distintas — que es **exactamente el patrón de
> blanqueo de madera que SERFOR fiscaliza**: sostener más producción de la que un ingreso legal puede dar.
> El modelo N:M no sólo modela mejor la realidad: **habilita la única invariante que le importa al fiscalizador.**
> Verificado en el ensayo: Postgres acepta felizmente un consumo de 999999 m³ contra un ingreso de 8.45.

**Semántica (mismo patrón que D2):**

| Concepto | Rol | Puede ser |
|---|---|---|
| `volumeInputM3` | **acta** — lo que el titular *declara* haber consumido; es lo que se reporta | la verdad fiscal |
| `Σ consumos` | **índice** — la atribución a ingresos concretos | **parcial** |
| `volumeInputM3 − Σ consumos` | `volumenSinAtribuir` — el hueco, **explícito y medido** | cola de trabajo, no mentira |

El índice **explica** el acta, no la reemplaza. Un hueco declarado es información; un hueco tapado con una
FK inventada es un dato corrupto que ya no se puede distinguir de uno bueno.

**Cómo se enforza (reparto de responsabilidades, ya establecido por D3):**

> **Postgres garantiza la FORMA. La capa DB garantiza la POLÍTICA.** Las dos cosas que Postgres no puede
> hacer acá son las mismas dos de siempre: el tenant y el agregado.

| Nivel | Garantiza | Cómo |
|---|---|---|
| **Postgres** (forma) | `volumeM3 > 0` · un ingreso 1 vez por línea · el destino existe · congelado coherente | `CHECK`, `UNIQUE(ctpEntryId, woodEntryId)`, FKs |
| **`ForestCtpDB`** (política) | **I1 · I2 · aislamiento por tenant** | Una transacción: `SELECT … FOR UPDATE` de la línea (`$1`, regla 11) → validar tenant de ambos extremos → `SUM` actual + delta ≤ límite → escribir. Violación ⇒ `throw` |
| **`forestal-ctp-backfill-verify.mjs`** (detección) | que lo anterior no se rompió | I1/I2/fuga como checks críticos |

**Efecto colateral que vale oro: `saldos()` NO cambia.** Sigue calculando `consumidoM3` desde `volumeInputM3`
(lo declarado). **Cero regresión en los números fiscales**; la tabla puente es detalle puramente aditivo.
*(El join por `speciesKey()` sigue siendo frágil, pero la tabla puente abre la puerta a reemplazarlo por un
balance exacto por ingreso más adelante — fuera de scope.)*

---

### D8 — Backfill de las filas existentes *(rev. 2 · responde (c))*

Un `INSERT … SELECT` idempotente al final del SQL de EXPAND. **No necesita cron ni batches**: es 1 fila.
(Un backfill batcheado de 1000/s con pausa sería teatro acá.)

| Paso | Regla |
|---|---|
| Alcance | `section='produccion'` · `status='registrado'` · `deletedAt IS NULL` · `volumeInputM3 > 0` · `gtfIngreso NOT NULL` |
| Match | `(tenantId, gtfNumber, speciesCommon)` — **sólo si es único** (D1). Empate ⇒ no se escribe |
| Volumen | `LEAST(volumeInputM3, saldo_del_ingreso)` donde `saldo = w.volumeM3 − Σ ya atribuido a ese ingreso` ⇒ **I1 e I2 se cumplen por construcción, no por suerte**. El residuo aparece como `volumenSinAtribuir` (honesto) en vez de violar una invariante |
| Idempotencia | `NOT EXISTS (consumos de esa línea)` + `ON CONFLICT (ctpEntryId, woodEntryId) DO NOTHING` ⇒ correrlo N veces == 1 vez, y **nunca pisa una atribución hecha por el operador** |
| `createdBy` | `'backfill:adr-134'` — distinguible de lo cargado a mano, para siempre |

**Resultado medido en el ensayo contra prod (transacción revertida):**

| Fila | Qué le pasa |
|---|---|
| `produccion` lineNo=1 (`001-0000120`, Tornillo, 8.4500) | → **1 consumo de 8.4500 m³** contra `WoodEntry(d0f1c1c7…)`. I1 e I2 con **igualdad exacta**, `sinAtribuir = 0.0000` |
| `despacho` lineNo=1 (`gtfIngreso` NULL) | **no se toca** — el despacho no consume materia prima. Correcto **por diseño, no por omisión** |
| Las 2 `WoodEntry` de `main` | `supplierId` queda **NULL** (los 2 `Supplier` viven en otros tenants) · `providerName` **intacto** (D2) ⇒ sin pérdida |
| Las 4 filas preexistentes | **0 creadas, 0 borradas, 0 campos de acta modificados** |

**Las 2 filas demo no se rompen porque la invariante se eligió para que ya fuera verdad el día 0** (`Σ=0 ≤ 8.45`
antes del backfill; `Σ=8.45 ≤ 8.45` después). El backfill es una *mejora* — mueve 8.45 m³ de "sin atribuir" a
"atribuido" — **no un rescate de datos**. Si el backfill no corriera, nada se rompe.

---

### Campos nuevos (bloque para `prisma/schema.prisma`)

```prisma
model WoodEntry {
  // ── Proveedor ──
  supplierId String?                                                   // ← NUEVO
  supplier   Supplier? @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  providerName String  // SE QUEDA — acta legal (D2)

  // ── Costo de materia prima ── (NUEVO)
  /// S/ total de la factura del proveedor. Llega TARDE (D6) ⇒ nullable por diseño.
  /// El costo unitario NO se almacena: es costoTotal / volumeM3.
  costoTotal Decimal? @db.Decimal(12, 2)
  moneda     String?  @default("PEN")

  consumos ForestCtpConsumo[]                                          // ← NUEVO (back-relation)

  @@index([tenantId, supplierId])                                      // ← NUEVO
}

model Supplier {
  woodEntries WoodEntry[]                                              // ← NUEVO (back-relation)
}

model ForestCtpEntry {
  gtfIngreso      String?  // SE QUEDA — acta legal (D2)
  materiaPrimaRef String?  // SE QUEDA — acta legal (D2)
  volumeInputM3   Decimal? @db.Decimal(12, 4)  // SE QUEDA — acta: lo DECLARADO (D7)

  /// Aserrío / secado / mano de obra. Input genuino: sin esto no hay margen.
  /// costoMateriaPrima y costoTotal NO se almacenan — son derivados (D6).
  costoProceso Decimal? @db.Decimal(12, 2)                             // ← NUEVO
  moneda       String?  @default("PEN")                                // ← NUEVO

  consumos ForestCtpConsumo[]                                          // ← NUEVO (back-relation)
}

// + model ForestCtpConsumo { … }   ← ver D5
```

> `Decimal(12,2)` para plata (consistente con `PurchaseOrder.total`); `Decimal(12,4)` para volumen
> (precisión forestal, consistente con `WoodEntry.volumeM3`). **Los 4 decimales son de m³, no de soles.**

---

## Plan detallado

### Paso 0 — Pre-flight (obligatorio)

```bash
node scripts/forestal-ctp-backfill-verify.mjs --snapshot     # backup real: son 5 filas, un JSON alcanza
node scripts/forestal-ctp-migration-rehearse.mjs             # ENSAYO contra prod, revierte solo. exit 0 = apto
```

### Paso 1 — EXPAND: SQL idempotente vía pooler

```bash
node scripts/apply-sql.mjs scripts/forestal-ctp-fk-costos-migration.sql   # DATABASE_URL (pooler)
```

| Propiedad | Cómo |
|---|---|
| Idempotente | `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, FK con guard `pg_constraint`, backfill con `NOT EXISTS` + `ON CONFLICT` |
| Sin lock largo | FK con `NOT VALID` + `VALIDATE CONSTRAINT` aparte (evita `ACCESS EXCLUSIVE` durante el scan) |
| Sin table rewrite | Columnas nullable; `DEFAULT 'PEN'` usa `attmissingval` (PG11+, sin reescribir) |
| Backfill seguro | Sólo match único (D1); volumen con `LEAST` ⇒ I1/I2 por construcción (D8) |
| Atómico | `apply-sql.mjs` envuelve todo en `BEGIN`/`COMMIT` — cualquier error ⇒ `ROLLBACK` completo |

### Paso 2 — Sincronizar `schema.prisma` (DESPUÉS de que el SQL corrió)

⚠️ **Orden no negociable.** Editar `schema.prisma` + `prisma generate` **antes** de que exista la tabla
⇒ el cliente pide columnas/tablas inexistentes ⇒ `P2021`/`P2022` en runtime.

```bash
# 1. aplicar el bloque "Campos nuevos" de este ADR a prisma/schema.prisma
npx prisma generate
npx tsc --noEmit
npm run db:sanity
```

### Paso 3 — Capa DB (guards D3 + invariantes D7)

| Archivo | Cambio |
|---|---|
| `lib/db/forest-ctp.db.ts` | `CtpEntryInput` + `consumos?: { woodEntryId, volumeM3 }[]` + `costoProceso`. `create`/`setConsumos` en **una `$transaction`**: lock de la línea (`SELECT … FOR UPDATE`, `$1`) → validar que cada `woodEntryId` sea del `tenantId` y no esté soft-deleted → validar **I1** y **I2** → escribir. Violación ⇒ `throw` |
| `lib/db/forest-ctp.db.ts` | `costoDeLinea()` — implementa la fórmula de D6 (`COALESCE(snap, costoTotal/volumeM3)` ponderado). Devuelve `null` si falta alguna factura o si se mezclan monedas: **no sumar peras con manzanas** |
| `lib/db/forest-ctp.db.ts` | `congelarCosto(tenantId, ctpEntryId)` — cierre de período: escribe `costoUnitarioSnap` + `congeladoAt`. Rechaza si algún costo es `NULL` (no se congela lo que no se sabe) |
| `lib/db/wood-entries.db.ts` | `supplierId` validado contra `Supplier` del tenant; `costoTotal` + `moneda` |
| `lib/db/forest-ctp.db.ts` → `saldos()` | **NO cambia** (D7). Agregar aparte `atribuidoM3` / `sinAtribuirM3` como lectura nueva |

### Paso 4 — API + UI

| Archivo | Cambio |
|---|---|
| `app/api/admin/forestal/ctp/route.ts` | Zod (`safeParse`, regla 2): `consumos: z.array(z.object({ woodEntryId: z.string().min(1), volumeM3: z.coerce.number().positive() })).max(20).optional()` + `costoProceso`. Error de invariante ⇒ **422 con el detalle**, no 500: el operador tiene que ver *cuánto* se pasó |
| `lib/db/forest-ctp.db.ts` → `availableSource()` | agregar **`id`** y el **saldo disponible** (`volumeM3 − Σ ya consumido`) al `select` de `woodEntry`. Hoy devuelve `gtfNumber` pero **no `id`** — por eso el picker sólo podía guardar texto. **Éste es el cambio que cierra el loop** |
| `components/admin/forestal/CtpEntryForm.tsx` | El picker pasa de 1 selección a **N filas** (ingreso + m³ a consumir), con el saldo disponible a la vista y el total vs. `volumeInputM3` en vivo. El hueco (`sinAtribuir`) se muestra, no se esconde |

### Timeline

| Fase | Cuándo | Gate |
|---|---|---|
| EXPAND (SQL + schema + DB + API + UI) | Deploy N | ensayo `exit 0` + `tsc` + `lint` + `node scripts/build-gate.mjs` + `forestal-ctp-backfill-verify.mjs` |
| CONTRACT | **NUNCA** (D2) | — |

Todo va en **un solo deploy**: al ser aditivo y nullable, el código viejo (que ignora tabla y columnas nuevas)
y el nuevo conviven. **Zero downtime por construcción, no por coreografía.**

---

## Plan de rollback

| Momento | Acción |
|---|---|
| SQL aplicado, código NO deployado | `scripts/forestal-ctp-fk-costos-rollback.sql` (dropea tabla + columnas). Seguro: nada las escribe |
| Código deployado, bug en UI | **Revert del deploy. Las columnas y la tabla se quedan** (nullable/vacía, inertes). No tocar la DB |
| Backfill atribuyó mal | `DELETE FROM "ForestCtpConsumo" WHERE "createdBy" = 'backfill:adr-134'` — quirúrgico y **sin tocar lo que cargó el operador**. El acta (`gtfIngreso`, `volumeInputM3`) nunca se tocó ⇒ **cero pérdida** |

> **rev. 2:** a diferencia de la rev. 1 (que sólo dropeaba columnas), `DROP TABLE ForestCtpConsumo` **sí borra
> datos propios** — la atribución. Por eso el `--snapshot` ahora la incluye. Aun así el libro fiscal sobrevive
> intacto: lo que se pierde es el índice (re-derivable con el backfill), nunca el acta. **D2 y D7 son también
> la red de rollback.**

---

## Observabilidad

`scripts/forestal-ctp-backfill-verify.mjs` — 18 queries, validadas contra el schema migrado.

| Métrica | Umbral |
|---|---|
| **I2 · Sobre-consumo de ingreso** (`Σ consumos > WoodEntry.volumeM3`) | **0 — alerta crítica.** Patrón de blanqueo. Postgres **no** lo previene (D7) |
| **I1 · Sobre-atribución de línea** (`Σ consumos > volumeInputM3`) | **0 — crítico** |
| **Fuga cross-tenant** (consumo ↔ línea ↔ ingreso) | **0 — crítico.** El FK **no** lo previene (D3, medido) |
| Consumos contra ingreso soft-deleted | 0 — el FK no ve el borrado lógico |
| Cobertura de atribución (m³ atribuidos / declarados) | Informativo hoy (100%); **>90% a 30 días** con datos reales. **<100% no es error** (D7) |
| Volumen sin atribuir | Cola de repesca manual |
| Lag de costo (consumos sin factura aún) | Informativo — si crece, la carga de facturas se atrasó (D6) |
| Congelados coherentes (`snap` ⇔ `congeladoAt`) | 0 incoherentes |
| Mezcla de monedas por línea | 0 |
| Ambigüedad latente (`gtfNumber`+especie duplicado) | >0 ⇒ el picker es la única vía; el backfill ya no aplica |

---

## Riesgos

| # | Riesgo | Prob. | Mitigación |
|---|---|---|---|
| R1 | Backfill ata la línea al ingreso equivocado (misma GTF, varias especies) | Media (futuro) | D1: sólo match único. `createdBy='backfill:adr-134'` ⇒ reversible quirúrgicamente |
| R2 | Fuga cross-tenant | Media | D3: guard en la capa DB + métrica crítica. **Medido: el FK deja pasar la fuga** |
| **R3** | **Doble consumo del mismo ingreso (blanqueo)** | **Media** | **D7/I2 en la capa DB + métrica crítica. Postgres no puede.** El riesgo es nuevo del modelo N:M — y la mitigación es la razón por la que el N:M vale la pena |
| R4 | `schema.prisma` editado antes del SQL ⇒ P2021/P2022 en prod | **Alta** (error humano) | Paso 2 explícito; `npm run db:sanity` post-deploy |
| R5 | `prisma migrate dev` corrido por costumbre ⇒ `CREATE TABLE` de todo lo forestal | **Alta** | B2 documentado; usar **sólo** el SQL manual |
| R6 | Costo mal calculado por mezcla de monedas | Baja | `costoDeLinea()` devuelve `null` si hay >1 moneda + métrica |
| R7 | Congelar un costo incompleto (factura de 1 de 3 ingresos) | Media | `congelarCosto()` rechaza si algún consumo tiene costo `NULL`: **no se congela lo que no se sabe** |
| R8 | El historial de migraciones sigue drifteado | Alta (preexistente) | **Fuera de scope.** Este ADR no lo empeora. Deuda aparte (`prisma migrate resolve` con DIRECT_URL desde red con acceso) |
| R9 | Doble fuente de verdad texto vs relación | Baja | D2: el texto es acta, la relación es índice. Jerarquía explícita, no competencia |

---

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| **FK escalar `woodEntryId`** (la rev. 1) | Refutado por el negocio: una corrida mezcla guías. Fuerza al operador a elegir un ingreso y mentir sobre el resto (D5) |
| **`Σ consumos == volumeInputM3` enforced** | Fabrica el fraude que D1 previene: sin atribución completa no se guarda ⇒ se inventa. Además no es enforceable en PG y rompe las filas demo (D7) |
| **`volumeInputM3` derivado (sin columna)** | Mismo problema que la igualdad estricta + rompe `saldos()` y la fila demo. El volumen declarado **es** el acta fiscal |
| **Constraint trigger `DEFERRABLE` para I1/I2** | Cero precedente en el repo; pelea con la filosofía app-level (D3). La capa DB ya es el único escritor |
| **Snapshot puro del costo al crear el consumo** | La factura llega después ⇒ congelaría NULL para siempre y exigiría un cron de repesca (D6) |
| **On-read puro sin congelado** | Una nota de crédito reescribiría el margen de períodos ya reportados (D6) |
| **Guardar `costoMateriaPrima` en la línea** | Con facturas tardías está **garantizado** a quedar podrido (D6) |
| **`WoodEntry.gtfNumber` UNIQUE + FK por número** | Imposible: 1 GTF ⇒ N ingresos (uno por especie). Rompería el ingreso multi-especie |
| **FK a `ForestGtf` en vez de a `WoodEntry`** | La GTF es el papel de transporte; el CTP consume el **ingreso físico** (`WoodEntry`), que es lo que tiene volumen y estado de validación |
| **`facturaRef` / `facturaAt` en `WoodEntry`** | Buena idea, **diferida**: sirve para medir el lag factura→costo, pero no la pide esta ronda y es aditiva después |
| **Borrar los 5 registros y arrancar limpio** | El tenant `main` es el de QA visual/Playwright — romperlo cuesta más que backfillear 1 fila |

---

## Referencias

- `scripts/forestal-ctp-fk-costos-migration.sql` · `…-rollback.sql` · `…-migration-rehearse.mjs` (ensayo) · `forestal-ctp-backfill-verify.mjs` (observabilidad)
- `prisma/schema.prisma:4919` (`WoodEntry`), `:5186` (`ForestGtf`), `:5225` (`ForestCtpEntry`), `:797` (`Supplier`)
- `lib/db/forest-ctp.db.ts` — `saldos()` (join por `speciesKey()`), `availableSource()` (sin `id`)
- `components/admin/forestal/WoodEntryForm.tsx:209` — 1 ítem de GTF ⇒ 1 `WoodEntry`
- ADR-127 — Libro CTP completo
- CLAUDE.md reglas 1 (nunca `prisma.*` directo), 2 (`safeParse`), 3 (`tenantId` 1er arg), 11 (raw SQL con `$1`), 12 (ADR), 14 (DIRECT_URL)
