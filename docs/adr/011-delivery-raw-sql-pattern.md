# ADR-011: Patrón raw SQL para el módulo Delivery (Bloque D1 del Marketplace)

## Estado
✅ Aceptada

## Fecha
2026-04-08

## Contexto

El Bloque D1 del Marketplace agrega 3 tablas nuevas (`DeliveryTracking`, `DeliveryRoute`, `DeliveryRouteStop`) y 8 campos nuevos al `Order` para implementar tracking de envíos en vivo (como Rappi) para bodegas familiares en Pucallpa.

La aplicación normalmente usa **Prisma Client tipado** para todas las queries vía las DB classes en `lib/db/*.db.ts`. Sin embargo, hay una fricción real en el flujo de migraciones:

1. **Prisma 7 + Supabase pooler (PgBouncer) no se llevan bien** — el CLI de Prisma cuelga o falla con "prepared statement does not exist" cuando corre contra el connection pooler de Supabase (ver `reference_prisma_pgbouncer_workaround.md` en memoria del usuario)
2. **`DIRECT_URL` es IPv6-only** para el proyecto Supabase actual → no resuelve en máquinas Windows del equipo sin reachability IPv6
3. El workaround del equipo es aplicar la SQL **manualmente** contra Supabase vía `psql $DIRECT_URL -f prisma/migrations/MANUAL-marketplace-bloque-*.sql`
4. Los bloques A, B, C del marketplace ya usaron este flujo manual — cambiar ahora rompería la consistencia

Teníamos que decidir: ¿cómo implementar las DB classes de delivery para que sean consistentes con el flujo manual de migraciones, pero sin perder type safety?

## Opciones consideradas

### Opción A: Prisma Client tipado (patrón normal del proyecto)

```typescript
const tracking = await prisma.deliveryTracking.create({
  data: { ...params, id: crypto.randomUUID() },
});
```

- ✅ Type safety end-to-end
- ✅ Consistente con el resto de las 34 DB classes
- ✅ Prisma maneja el escaping automáticamente
- ❌ Requiere `prisma migrate dev` o `prisma db push` para que las tablas existan
- ❌ Prisma CLI cuelga con el pooler en este equipo — no es viable en CI/local
- ❌ Si alguien corre `prisma migrate reset` por error, se pierden las tablas creadas manualmente
- ❌ Rompe la consistencia con el flujo de los bloques A, B, C del marketplace

### Opción B: Raw SQL via `$queryRawUnsafe` / `$executeRawUnsafe` (elegida)

```typescript
const id = crypto.randomUUID();
await prisma.$executeRawUnsafe(
  `INSERT INTO "DeliveryTracking" ("id","tenantId","orderId","status",...)
   VALUES ($1,$2,$3,$4,...)`,
  id, params.tenantId, params.orderId, params.status, ...,
);
```

- ✅ Funciona sin depender del estado del Prisma Client (los modelos SÍ están en el schema para type safety de retorno, pero las queries no pasan por el Query Engine)
- ✅ Compatible 100% con el flujo manual de migraciones del marketplace
- ✅ Parámetros posicionales `$1 $2 $3` previenen SQL injection (Postgres los escapa)
- ✅ Control total sobre el SQL — podemos usar `DISTINCT ON`, CTEs, window functions que Prisma no expone
- ❌ Menor type safety — los tipos de retorno son manuales (casts explícitos)
- ❌ Requiere disciplina — nunca string interpolation dentro del SQL, siempre params posicionales
- ❌ Patrón no familiar para nuevos desarrolladores

### Opción C: Prisma Migrate + aplicar el bypass de pgbouncer

- ✅ Mantiene el patrón estándar de Prisma
- ❌ Requiere reconfigurar el proyecto para que `DATABASE_URL` apunte al pooler y `DIRECT_URL` a `aws-1-us-east-2.pooler.supabase.com:5432` (no al `db.*` IPv6)
- ❌ Alto riesgo de regresión — esto no es un cambio quirúrgico del bloque D, es tocar la base de toda la infra de migraciones
- ❌ Bloqueado por tareas humanas que Brandon tiene pendientes (rotar password, configurar pooler en .env.local + Vercel)

## Decisión

**Elegimos Opción B — raw SQL con parámetros posicionales**, con las siguientes restricciones:

1. **Sólo el módulo Delivery** usa este patrón, de forma quirúrgica. El resto del proyecto sigue con Prisma Client tipado.
2. **Los modelos SÍ están sincronizados en `schema.prisma`** para que las relaciones desde `Order` (p. ej. `Order.deliveryTracking[]`) funcionen en queries tipadas del resto del código. Solo las DB classes internas de delivery son raw.
3. **Parámetros posicionales obligatorios** (`$1 $2 $3`) — nunca `${}` / template strings / concatenación. Revisado en code review.
4. **Tests unitarios con mocks específicos** para `$executeRawUnsafe`, `$queryRawUnsafe` y `$transaction` (ver `__tests__/delivery-db.test.ts`).
5. **Path de migración futura documentado** — cuando se resuelva el workaround de pgbouncer (Opción C arriba), se puede migrar las 3 DB classes a `prisma.deliveryTracking.*` sin cambiar las signatures públicas de los métodos.

## Consecuencias

### Positivas

- El bloque D1 se pudo implementar completo en una sesión (SQL + schema + DB class + routes + tests + seed) sin bloquearse por el workaround de Prisma/pgbouncer
- Los 16 tests unitarios mockean `$executeRawUnsafe`/`$queryRawUnsafe` con cobertura de multi-tenant isolation
- El flujo es 100% consistente con los bloques A, B, C del marketplace
- Las queries pueden usar features avanzadas de Postgres (`DISTINCT ON` para el feed vivo, por ejemplo) que reducen N+1 en 1 query

### Negativas

- **Deuda de type safety** — los tipos de retorno se declaran manualmente como `Array<{...}>` y se mappean a `DbDeliveryTracking[]`. Si cambio el schema Prisma sin actualizar los tipos internos, TS no me avisa
- **Mantenimiento especial** — los nuevos desarrolladores tienen que leer el header de `delivery.db.ts` para entender por qué este módulo es diferente
- **Riesgo de regresión futuro** — si alguien edita el SQL y olvida un param, la query puede ejecutar con datos sin escapar (prevenido por el code review + ESLint rule futura)

### Mitigaciones activas

| Riesgo | Mitigación |
|---|---|
| SQL injection por string interpolation | Code review + tests + ESLint rule pendiente (TECH-DEBT) |
| Type drift entre schema.prisma y los tipos internos | Sync manual en cada migración del bloque D; test `schema-db-sync` extenderlo futuro |
| Nuevos devs no entienden el patrón | Header explicativo en `delivery.db.ts` + sección "Módulo Delivery" en `CLAUDE.md` + este ADR |
| Pérdida de features tipadas de Prisma | Ninguna — las relaciones desde `Order` siguen tipadas (solo las queries del módulo delivery son raw) |
| Rollback del bloque D | Script documentado en `docs/rollback-delivery-d1.md` (< 5 min) |

## Path de migración futura

**Trigger de migración:** cuando se resuelva el workaround de pgbouncer (Brandon rotate password + update `.env.local` con pooler `aws-1-us-east-2` + re-test `prisma migrate dev`).

**Pasos:**
1. Verificar que `prisma migrate dev --create-only` no cuelga con el pooler nuevo
2. Reemplazar cada `$executeRawUnsafe("INSERT INTO ...")` por `prisma.deliveryTracking.create({...})`
3. Reemplazar cada `$queryRawUnsafe("SELECT ...")` por `prisma.deliveryTracking.findMany({...})` o equivalente
4. Mantener las signatures públicas intactas (los tests siguen pasando)
5. Borrar los casts manuales de tipos — ya no son necesarios
6. Actualizar el header de `delivery.db.ts` eliminando la nota del bypass
7. Crear un nuevo ADR-0XX "Migración de delivery a Prisma Client tipado"

**Estimación:** 1-2 horas de trabajo mecánico + correr tests existentes.

## Referencias

- `reference_prisma_pgbouncer_workaround.md` (memoria global del usuario)
- `prisma/migrations/MANUAL-marketplace-bloque-d1.sql` (SQL aplicado 2026-04-08)
- `lib/db/delivery.db.ts` (header explicativo)
- `__tests__/delivery-db.test.ts` (16 tests con mocks raw SQL)
- `CLAUDE.md` sección "Módulo Delivery — Bloque D1 del Marketplace (2026-04-08)"
- ADR-001 multi-tenancy row-level (tenantId primer param)
- ADR-003 fire-and-forget to BullMQ (BullMQ worker de delivery-notifications)
