---
name: migration-planner
description: Planea migraciones de Prisma schema con patrón expand→migrate→contract para zero-downtime deploys. Evita pérdida de datos, downtime en runtime, y bugs en producción. Usar ANTES de cambios de schema (add/remove/rename columns, tablas nuevas, cambios de tipo) o cuando Brandon diga "plan de migración", "migrar schema", "zero downtime", "cambio de DB".
user-invocable: true
model: opus
context: fork
allowed-tools: Read, Write, Bash, Grep, Glob, TaskCreate, TaskUpdate
---

# /migration-planner — Migraciones Prisma zero-downtime

Las migraciones de schema en producción con usuarios activos son donde nacen los incidentes.
Este skill FUERZA el patrón expand→migrate→contract — 3 deploys separados, cada uno
backward-compatible con el anterior.

## Principio fundamental

> **En ningún momento el código y el schema deben ser incompatibles.**
> Nuevo código tiene que correr con schema viejo (y viceversa) durante la transición.

## El patrón en 3 fases

### Fase EXPAND (deploy N)

Agregar lo nuevo SIN tocar lo viejo. El código sigue usando lo viejo.

**Operaciones permitidas:**
- Agregar columna **NULLABLE** (nunca NOT NULL sin default)
- Agregar tabla nueva
- Agregar índice (concurrente, no bloquea)
- Agregar FK nullable
- Duplicar columna para rename (nueva con nombre nuevo, vieja intacta)

**Operaciones prohibidas:**
- DROP column / table / index
- Cambiar tipo
- Hacer column NOT NULL
- Rename directo

### Fase MIGRATE (deploy N+1 o cron)

Backfill + comenzar a usar lo nuevo. Código escribe a AMBOS lados (viejo + nuevo),
lee de viejo. Cron hace el backfill de rows existentes.

**Checklist:**
- [ ] Cron de backfill en batches (1000 rows, pausa 1s entre batches)
- [ ] Escrituras duales: código escribe a viejo AND nuevo
- [ ] Reads siguen en viejo (verificación)
- [ ] Monitoring: rate de backfill, errores, lag
- [ ] Verificar que columna nueva tiene datos completos antes de avanzar

### Fase CONTRACT (deploy N+2)

Cambiar reads a lo nuevo. Remover escrituras a viejo. Eventualmente DROP lo viejo.

**Pasos:**
1. Deploy con reads desde nuevo
2. Verificar 1-7 días (según criticidad)
3. Deploy que remueve escrituras duales
4. Verificar otros 1-7 días
5. DROP la columna/tabla vieja (último migration)

## Matrix de operaciones comunes

| Operación | Plan |
|---|---|
| **Agregar columna requerida** | 1. EXPAND: add nullable, 2. MIGRATE: backfill + escrituras duales, 3. CONTRACT: NOT NULL + remove old |
| **Renombrar columna** | 1. EXPAND: add nueva, 2. MIGRATE: copy viejo→nuevo, escribir en ambos, 3. CONTRACT: lectura desde nuevo, 4. DROP: remove vieja |
| **Cambiar tipo de columna** | 1. EXPAND: add con tipo nuevo (nombre distinto), 2. MIGRATE: cast + backfill + dual write, 3. CONTRACT: swap reads, 4. DROP vieja |
| **Tabla nueva referenciada por FK** | 1. EXPAND: create table + nullable FK, 2. MIGRATE: populate, 3. CONTRACT: NOT NULL FK si aplica |
| **DROP columna** | 1. EXPAND: nada, 2. MIGRATE: deploy código sin usar columna, 3. CONTRACT: DROP después de 1+ deploy exitoso |
| **Split tabla 1→N** | Casos extremos — requiere ADR dedicado + DBA review |
| **Cambiar primary key** | NO HACER sin downtime planificado + backup+restore test |

## Template de ADR para la migración

Al ejecutar este skill, genera automáticamente un ADR con:

```markdown
# ADR-NNN: Migración schema — <descripción>

## Contexto
<qué cambia, por qué ahora>

## Decisión
Fases expand→migrate→contract con timeline:
- Deploy N (expand): <fecha>, <deploy ID>
- Backfill completion: <fecha objetivo>
- Deploy N+1 (contract): <fecha mínima, +1 semana de observación>

## Plan detallado
<pasos con comandos exactos>

## Plan de rollback por fase
<qué revertir en cada fase si algo falla>

## Observabilidad
<qué métricas monitorear, umbrales de alerta>

## Riesgos
<análisis por riesgo con mitigación>
```

## Reglas duras

1. **DATABASE_URL vs DIRECT_URL** — `prisma migrate` requiere DIRECT_URL (sin pgBouncer). CLAUDE.md regla 12
2. **Nunca `prisma db push` en prod** — solo migrations versionadas
3. **Backup antes de migrar** — verificar que `pre-deploy-db-snapshot` corrió
4. **Staging primero** — migration corre en staging con snapshot de prod ≥ 48h antes
5. **Canary rollout** — 5% → 25% → 100% entre deploys de fase
6. **DR drill** reciente (<35 días per CLAUDE.md regla 14) antes de migración destructiva

## Checklist pre-ejecución

- [ ] ADR escrito y aprobado
- [ ] Staging migration corrió exitosamente
- [ ] Backup verificado (dr-drill reciente)
- [ ] Monitoring dashboards preparados
- [ ] Rollback procedure documentada y probada
- [ ] Team notificado del deploy window
- [ ] Feature flag si aplica (fase contract puede depender de flag)

## Invocación

```
/migration-planner add required column email to User table
/migration-planner rename Order.price to Order.priceCents and change to Int
/migration-planner drop unused column Product.oldInventoryId
```

El skill genera:
1. ADR markdown en `docs/adr/NNN-<slug>.md`
2. Plan paso a paso con comandos
3. Migration files draft en `prisma/migrations/`
4. Rollback plan explícito
5. Observability checklist

Antes de commit, pasa por review del database-engineer subagent.

## Anti-patrones explícitos

- ❌ `ALTER TABLE ... DROP COLUMN` en mismo deploy que remueve el uso en código
- ❌ Agregar NOT NULL sin default (rompe inserts existentes)
- ❌ Rename con `ALTER TABLE ... RENAME COLUMN` sin código dual-compatible
- ❌ Migration destructiva sin DR drill reciente
- ❌ Correr `prisma migrate deploy` con DATABASE_URL (pooler) — usar DIRECT_URL
- ❌ Skippear el Canary — full rollout directo 100%
