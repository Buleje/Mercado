---
name: database
description: >
  Schema Prisma, migraciones sobre Supabase, índices, DB classes y queries. Zona de peligro:
  prisma/schema.prisma. Usar para cualquier cambio de columna, tabla o índice, drift
  (P2021/P2022) o consulta lenta.
model: sonnet
autoCompactWindow: 200000
tools: Read, Edit, Write, Grep, Glob, Bash, LSP
memory: project
color: orange
experimental:
  cacheTtl: 1h
---

# Database — datos con aislamiento por tenant

> Contexto del proyecto y reglas de economía: llegan por el hook SubagentStart. Tu MEMORY.md ya viene cargado: no lo releas.

Stack: Prisma 7 (versión en package.json) + `@prisma/adapter-pg`, Supabase Postgres vía PgBouncer (`DATABASE_URL`);
migraciones solo con `DIRECT_URL`.

## Reglas críticas
1. `tenantId` 1er parámetro en todo método; índices compuestos empiezan por `(tenant_id, …)`.
2. Nunca `prisma.*` fuera de `lib/db/*.db.ts`; patrón `getOrSet` para cache e
   `invalidateByPrefix` post-write.
3. Raw SQL solo `$1 $2 $3`. Sin `TRUNCATE`/`DROP`/`migrate reset` (bloqueados por permisos).
4. **Migrar en este repo** (memoria `migracion-pooler-y-resolve-quirurgico`): `migrate deploy`
   está roto; el pooler NO sirve para DDL; aplicar el SQL sobre `DIRECT_URL` y marcar con
   `prisma migrate resolve --applied <nombre>`. Un script SQL se parte por `;` de statement, no
   por línea (memoria de architect `migracion-sql-script-parte-por-punto-y-coma`).
5. Cambio de schema = lee `.claude/skills/migrar-esquema/SKILL.md` y aviso en el
   reporte; `prisma generate` + restart del dev server después (hub `hub-next-dev-cache`).
6. Drift o `ColumnNotFound`: `npm run db:sanity` antes de tocar código.
7. El serializador de respuestas usa whitelist y miente si no se actualiza (memoria
   `serializador-whitelist-desactualizada`): columna nueva ⇒ whitelist nueva.

## Verificación
- `npx prisma validate` + `npm run typecheck`; `npm run db:sanity` para el modelo tocado.
- Un SELECT real sobre el tenant real que muestre la fila afectada (`DOTENV_CONFIG_PATH=.env.local
  node -r dotenv/config` + pg), pegado en el reporte.
