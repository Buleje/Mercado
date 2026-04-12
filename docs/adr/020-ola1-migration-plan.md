# ADR-020: Plan unificado de migraciones Ola 1 (TD-019/020/021 + TD-030/031/032)

## Estado

🟡 **Propuesta — DRAFT** (pendiente aprobación de Brandon antes de ejecutar TD-030/031/032)

**Nota:** Las sub-decisiones sobre índices (TD-019/020/021) ya fueron ratificadas en ADR-017 y aplicadas a producción el 2026-04-09. Este ADR formaliza las 3 migraciones pendientes de la misma ola (TD-030, TD-031, TD-032) bajo un único marco estratégico.

## Fecha

2026-04-09

## Contexto

La "Ola 1" del plan maestro 24 semanas (ADR-016) agrupa 7 deudas técnicas heredadas del audit Supabase Best Practices del 2026-04-06 y del Sprint C Final Push del 2026-04-07:

| TD | Tipo | Estado al 2026-04-09 |
|----|------|----------------------|
| TD-018 | Float → Decimal(12,2) en 87 campos | ✅ Aplicado (plan propio, `docs/td018-consolidated-plan-2026-04-09.md`) |
| TD-019 | FK sin índice en `WholesaleOrderItem`/`StoreProduct` | ✅ Aplicado (ADR-017) |
| TD-020 | 4 compound indexes `(tenantId, status/createdAt)` | ✅ Aplicado (ADR-017) |
| TD-021 | `StorePermission.userId` single-column index | ✅ Aplicado (ADR-017) |
| **TD-030** | Modelo `LoyaltyTransaction` faltante + backfill | 🟡 Pendiente |
| **TD-031** | Campo `Review.imageUrls` faltante | 🟡 Pendiente |
| **TD-032** | Campo `Coupon.storeId` faltante + unique rebuild | 🟡 Pendiente |

Las 3 migraciones pendientes comparten un patrón común:

1. **Son schema gaps reales.** Los route handlers tenían código que referenciaba estructuras inexistentes en `prisma/schema.prisma`. Durante Sprint C Final Push (2026-04-07), al activar `tsc --noEmit` como gate (ADR-008), se aplicaron workarounds `Opción B` (remover los usos) con comentarios `TECH-DEBT` explícitos. Las features del UI siguen enviando los datos pero el backend los descarta.

2. **Son aditivas zero-downtime.** Columnas nullable con default, tabla nueva, FK opcional. Ningún cambio destructivo ni conversión de tipos.

3. **Requieren el mismo patrón de ejecución que TD-019/020/021:** SQL manual via pooler session mode (no `prisma migrate dev`), schema sync posterior, verificación contra `pg_indexes` y `information_schema`.

El objetivo de este ADR es establecer **un único marco de decisión** que cubra:
- La estrategia de ejecución (incremental vs big-bang)
- El orden relativo entre TD-030/031/032
- Los criterios de rollback y validación compartidos
- La política de schema sync y workflow Prisma

## Opciones consideradas

### Opción A — Un solo PR gigante con las 3 migraciones

- ✅ Menos overhead de review y deploy
- ✅ Cierra la ola de una sola vez
- ❌ Rollback atómico difícil si una parte falla
- ❌ Blast radius combinado si hay bugs en el código nuevo
- ❌ Mezcla 3 cambios lógicamente independientes en el historial de git

### Opción B — 3 PRs secuenciales en orden creciente de complejidad (TD-031 → TD-032 → TD-030)

- ✅ Cada PR es auditble independientemente
- ✅ Rollback quirúrgico — si TD-030 falla, TD-031 y TD-032 ya están en prod sin conflicto
- ✅ El más simple primero valida el pipeline (pooler session mode, schema sync, scripts)
- ✅ El más riesgoso (TD-030 con backfill de datos) entra último cuando ya hay confianza en el flujo
- ❌ Triple el overhead de CI/CD (3 deploys)
- ❌ Ventana total más larga (3 sesiones vs 1)

### Opción C — 3 PRs en paralelo (branches independientes)

- ✅ Velocidad máxima
- ❌ Merge conflicts en `schema.prisma` (los 3 editan el mismo archivo)
- ❌ Race conditions en DB si se ejecutan simultáneamente sin coordinación
- ❌ Difícil de revisar en isolación cuando el schema queda mezclado

### Opción D — Aplicar solo TD-031 y TD-032 ahora, diferir TD-030 al próximo sprint

- ✅ Menor blast radius inmediato
- ✅ Da tiempo para diseñar mejor el backfill de loyalty (ej: recuperar audit trail real del log de orders en lugar de `legacy-backfill` sintético)
- ❌ Mantiene el comentario TECH-DEBT abierto más tiempo
- ❌ El feature de historial de puntos sigue roto para los usuarios

## Decisión

**Elegimos la Opción B — 3 PRs secuenciales en orden TD-031 → TD-032 → TD-030.**

### Estrategia de ejecución

1. **Canal de ejecución.** Todas las migraciones de este ADR se aplican vía script TypeScript tipo `scripts/apply-td030-td031-td032.ts` (nuevo, siguiendo el patrón de `scripts/apply-ola1-indices.ts`) que usa pooler session mode (puerto 5432) vía `DIRECT_URL`. **Prohibido** usar `npx prisma migrate dev` porque envuelve cada migración en una transacción y rompe `CREATE INDEX CONCURRENTLY`.

2. **Schema sync.** Después de cada ejecución SQL exitosa, editar `prisma/schema.prisma` a mano con los cambios correspondientes y correr `npx prisma validate && npx prisma format && npx prisma generate`. NO correr `migrate dev` — el SQL ya está aplicado.

3. **Orden estricto:**
   - **Paso 1 (TD-031):** `Review.imageUrls String[] @default([])`. Es la más simple, valida el pipeline del paso 2.
   - **Paso 2 (TD-032):** `Coupon.storeId String?` + FK + rebuild del unique constraint. Requiere atención al DROP+ADD del `@@unique`, ejecutar en horario de baja carga.
   - **Paso 3 (TD-030):** Crear tabla `LoyaltyTransaction` + 3 índices + backfill histórico desde `Customer.loyaltyPoints`. Mayor complejidad, entra último cuando el pipeline está probado.

4. **Verificación obligatoria.** Crear `scripts/verify-ola1-schema-gaps.ts` (read-only) con 9 checks que validan existencia de tablas/columnas/índices/constraints/backfill consistency. Correr tras cada paso. Patrón tomado de `scripts/verify-pg-indexes-ola1.ts` del Paso 0 de ADR-017.

5. **Rollback policy.**
   - TD-031: `DROP COLUMN imageUrls` → zero data loss si se ejecuta antes del primer write real
   - TD-032: restaurar unique constraint original + `DROP COLUMN storeId` → zero data loss sobre cupones existentes; los `storeId` SET que hubieran entrado en el intervalo pasan a `NULL` (comportamiento POS legacy)
   - TD-030: `DROP TABLE LoyaltyTransaction CASCADE` → zero data loss sobre `Customer.loyaltyPoints` (queda intacto)

6. **Windows de ejecución.** Ninguna migración requiere ventana de mantenimiento con el tráfico actual (<10 rps en `Review`, `Coupon`, `Customer`). El único paso que toma un lock brevísimo es el DROP+ADD del unique constraint en TD-032 (<3s) — se ejecuta en horario bajo por precaución, no por necesidad.

7. **Schema drift protection.** Después de cada PR, correr el script de verificación contra prod (no solo staging) para detectar cualquier drift futuro. Patrón ya probado en ADR-017.

8. **Postgres version check.** TD-032 usa `UNIQUE NULLS NOT DISTINCT` que requiere Postgres 15+. Verificar con `SELECT version()` antes de ejecutar el paso. Si está en 14, usar la alternativa con dos unique partial indexes.

### Política general derivada de este ADR (aplica a migraciones futuras)

Este ADR deja establecido para la próxima ola:

- Toda migración de schema en este repo sigue el patrón **raw SQL manual + schema sync posterior**, no `prisma migrate dev`. Ver ADR-011 (delivery raw SQL pattern) y ADR-017 (indices ola 1) como precedentes.
- Toda columna nueva entra como **nullable-first con default** o usa `ADD COLUMN NOT NULL DEFAULT <constant>` (Postgres 11+ lo hace O(1)).
- Toda tabla nueva lleva al menos un `@@index` compuesto con `tenantId` como prefijo + ordenación por `createdAt DESC` para paginación.
- Todo backfill de datos va en `scripts/backfill-*.ts` con batches explícitos, `tenantId` always first, y commit por batch — nunca una sola transacción gigante.
- Todo modelo con datos financieros usa `Decimal @db.Decimal(12, 2)` desde el día 1 (ADR-018).
- Todo acceso a la DB pasa por `lib/db/*.db.ts` con cache + audit trail + `tenantId` como primer parámetro (CLAUDE.md regla 1).

## Consecuencias

### Positivas

- **Feature parity restaurada:** el UI del marketplace vuelve a poder subir fotos en reseñas, filtrar cupones por tienda, y mostrar historial de puntos al cliente.
- **Audit trail de loyalty:** por primera vez hay historial inmutable de movimientos de puntos. Base para reportes, disputes, y compliance.
- **Cupones bien aislados:** POS y marketplace dejan de confundirse. Elimina un vector de error donde un cupón "WELCOME20" del marketplace se aplicaba indebidamente en la caja POS.
- **Cierra 3 TECH-DEBT abiertas** que ensucian 5 route handlers con comentarios TODO.
- **Pipeline probado:** el patrón script TS + pooler session mode + schema sync queda reusable para futuras olas (D2, D3).
- **Alineado con Clean Code y Clean Architecture:** cada cambio es aditivo, reversible, testeable independientemente.

### Negativas

- **3 PRs en vez de 1** incrementa el overhead de review y CI/CD ~3x. Mitigación: los checklists del plan son replicables, no hay que pensar cada PR desde cero.
- **Ventana total más larga** (3 sesiones distribuidas en 1–3 días vs 1 sesión gigante). Mitigación: aceptable porque no hay dependencias cross-PR que bloqueen.
- **Schema drift temporal** entre `prisma/schema.prisma` y la DB real durante la ejecución del SQL raw — ya visto en ADR-017, mitigado con verificación post-ejecución.
- **Backfill sintético en TD-030** pierde auditoría histórica real. Los movimientos de puntos anteriores al 2026-04-09 quedan agrupados bajo `legacy-backfill` sin desglose. Mitigación: documentar explícitamente + ofrecer follow-up donde se reconstruyan movimientos desde `Order.total` si Brandon lo pide.

### Riesgos

1. **Lock durante DROP unique en TD-032** (~3s). Probabilidad media de impactar 1–2 writes concurrentes. Mitigación: horario bajo.
2. **Backfill de TD-030 rompe si `Customer.phone` tiene valores inválidos** (ej: duplicados por dirty data). Mitigación: validación previa con `SELECT phone, COUNT(*) FROM "Customer" GROUP BY phone HAVING COUNT(*) > 1`. Si hay duplicados, pausar y limpiar antes.
3. **Query leak en TD-032** donde alguna ruta de `lib/db/marketplace.db.ts` no agregue filtro por `storeId` y muestre cupones de otras tiendas. Mitigación: grep exhaustivo + tests + deploy a staging con datos de 2 stores diferentes.
4. **Postgres <15 en staging o prod** (poco probable en Supabase, pero posible). Mitigación: `SELECT version()` obligatorio antes del paso 5 de TD-032.
5. **Pooler se desconecta durante backfill largo** de TD-030 si hay >50k clientes. Mitigación: batches de 1000 con reconexión explícita entre batches.

## Referencias

- `docs/migration-plan-ola1-2026-04-09.md` — plan técnico unificado con SQL, checklists, validaciones y rollbacks
- `docs/migration-plan-indices-ola1-2026-04-09.md` — plan histórico de TD-019/020/021 (ya aplicado)
- `docs/td018-consolidated-plan-2026-04-09.md` — plan del TD-018 (fuera de scope de este ADR)
- `docs/TECH-DEBT.md` — registro de todas las TDs (hasta TD-034)
- `docs/adr/011-delivery-raw-sql-pattern.md` — precedente del patrón raw SQL
- `docs/adr/016-plan-maestro-24-weeks.md` — roadmap maestro que contiene la Ola 1
- `docs/adr/017-ola1-migrations-indices-strategy.md` — ADR hermano ya aceptado para TD-019/020/021
- `docs/adr/018-td018-float-to-decimal-strategy.md` — ADR hermano de TD-018
- `scripts/apply-ola1-indices.ts` — referencia del patrón script de aplicación
- `scripts/verify-pg-indexes-ola1.ts` — referencia del patrón script de verificación
- `app/api/marketplace/loyalty/route.ts` — código con TECH-DEBT de TD-030 (líneas 46–47, 101–102, 157–158)
- `app/api/marketplace/stores/[slug]/reviews/route.ts` — código con TECH-DEBT de TD-031 (líneas 48, 115, 143)
- `app/api/marketplace/coupons/route.ts` + `validate/route.ts` + `superadmin/marketplace/coupons/route.ts` — código con TECH-DEBT de TD-032
- CLAUDE.md reglas críticas 1, 3, 5, 9, 11 — aplicadas en las 3 migraciones
