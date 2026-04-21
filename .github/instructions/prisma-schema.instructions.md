---
applyTo: "prisma/schema.prisma, prisma/migrations/**"
---

# prisma-schema — instrucciones para cambios de schema

131 modelos, producción viva. Un bug aquí = downtime + posible pérdida de datos.

## Invariantes

1. **Conexiones**:
   - `DATABASE_URL` = pgBouncer (puerto 6543) → solo para runtime/Prisma Client.
   - `DIRECT_URL` = directo a Postgres (puerto 5432) → **obligatorio** para `prisma migrate`.
   - Nunca correr `prisma migrate deploy` con DATABASE_URL — falla en transaction mode de pgBouncer.

2. **Patrón expand→migrate→contract** (zero-downtime):
   - **Expand**: agregar columna/tabla NUEVA como nullable o con default. Deploy. No rompe clientes viejos.
   - **Migrate**: backfill datos, dual-write desde la app. Monitorear.
   - **Contract**: remover columna vieja, marcar NOT NULL. Deploy. Ahora nuevos clientes no la usan.

3. **Never drop columns in one migration**. Siempre 2 migraciones mínimo (desuso → drop).

4. **Índices**: agregar índice con CONCURRENTLY cuando la tabla >10k filas. Prisma no lo hace nativo — escribir SQL raw en la migration.

5. **Constraints NOT NULL nuevas**: backfill default primero, luego ALTER. Nunca en 1 paso.

6. **Foreign keys con ON DELETE CASCADE** solo cuando la relación es "parte de" (ej. OrderItem → Order). Nunca en relaciones independientes.

## Proceso de cambio

```
1. /audit-first (mapear tablas/columnas afectadas)
2. Crear ADR con plan expand→migrate→contract
3. `prisma migrate dev --name <desc>` (local)
4. Probar en staging con DIRECT_URL
5. `DATABASE_URL=$DIRECT_URL npx prisma migrate deploy` (prod — con ventana de mantenimiento si hay contract)
6. Verificar queries rotas via lib/db/*.db.ts (type-check + runtime)
```

## Esperanzas rotas comunes

- **"Prisma migrate lo hace todo"**: no. Concurrent indexes, backfills, NOT NULL en tablas grandes requieren SQL raw.
- **"Puedo renombrar una columna en 1 migration"**: rompe clientes viejos. 2 migraciones: add new + dual-write, luego drop old.
- **"Prisma.dbml refleja la prod"**: solo después de deploy. Siempre `prisma db pull` para verificar.

## Tests obligatorios

- Migration corre en staging sin errores.
- App existente (sin rebuild) conecta a DB post-migration (compat hacia atrás).
- Rollback migration probado antes de merge.

## Cambios que requieren audit-first

- Cualquier DROP o ALTER TABLE.
- Cualquier constraint nueva sobre tabla existente con datos.
- Cambio de primary key.
- Rename de columna/tabla.
