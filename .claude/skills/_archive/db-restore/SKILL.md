---
name: db-restore
description: |
  Restaura la base de datos desde un backup previo generado por el hook
  pre-deploy-db-snapshot. Lista backups disponibles y permite restaurar
  a un timestamp específico.
  Usar cuando Brandon diga "restaura la DB", "rollback DB", "db restore",
  "volvé la base", "recover database".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[list | latest | YYYY-MM-DD-HHMMSS]"
model: sonnet
---

# DB Restore — Restauración de base de datos desde backup

## ADVERTENCIA

Este skill toca datos de producción. Requiere DIRECT_URL (no pooler).
**Siempre confirmar con Brandon antes de restaurar en producción.**

## Subcomandos

### `/db-restore list`

```bash
# Listar backups disponibles (locales)
ls -la backups/db/ 2>/dev/null | grep ".sql.gz"

# Listar backups en Supabase Storage (si configurado)
# supabase storage ls bodega-backups/ 2>/dev/null
```

Output:
```
| # | Fecha | Tamaño | Schema hash | Tipo |
|---|---|---|---|---|
| 1 | 2026-04-10 03:00 | 45MB | abc123 | pre-deploy |
| 2 | 2026-04-09 15:30 | 44MB | def456 | pre-migrate |
| 3 | 2026-04-07 03:00 | 42MB | ghi789 | weekly |
```

### `/db-restore latest`

```
1. Identificar el backup más reciente
2. Mostrar metadata: fecha, tamaño, schema hash
3. Confirmar con Brandon (EXCEPCIÓN a regla de no preguntar — esto es irreversible)
4. Si confirma:
   a. Crear backup del estado ACTUAL antes de restaurar
   b. Ejecutar pg_restore con DIRECT_URL
   c. Verificar que las tablas tienen datos
   d. Correr prisma validate
   e. Reportar resultado
```

### `/db-restore [timestamp]`

Igual que latest pero con un backup específico.

## Proceso de restauración

```bash
# 1. Backup del estado actual (safety net)
pg_dump "$DIRECT_URL" --format=custom --compress=6 \
  -f "backups/db/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"

# 2. Restaurar desde backup seleccionado
pg_restore --clean --if-exists -d "$DIRECT_URL" \
  "backups/db/[archivo-seleccionado].sql.gz"

# 3. Verificar
npx prisma validate
npx prisma db pull --force 2>/dev/null  # verificar schema match

# 4. Smoke test
curl -s https://mercado.vercel.app/api/health
```

## Retención de backups

| Tipo | Frecuencia | Retención |
|---|---|---|
| pre-deploy | Cada deploy | Últimos 30 |
| pre-migrate | Cada `prisma migrate` | Últimos 30 |
| weekly | Domingos 3 AM | 1 año |
| pre-restore | Antes de cada restore | Últimos 10 |

## Reglas

1. **SIEMPRE crear backup del estado actual antes de restaurar.**
2. **SIEMPRE verificar con prisma validate después de restaurar.**
3. **Restaurar en producción REQUIERE confirmación explícita de Brandon.**
4. **En dev/staging → restaurar sin confirmación.**
5. **Si el restore falla → restaurar el pre-restore backup automáticamente.**

## Referencia

- Hook: `pre-deploy-db-snapshot.mjs` — genera los backups
- Regla CLAUDE.md: nunca `prisma migrate deploy` sin backup previo
- Memoria: `reference_prisma_pgbouncer_workaround.md` — usar DIRECT_URL para dumps
