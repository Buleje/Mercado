# Runbook: Deploy Rollback

> **Severidad**: P0 — incidente activo en producción
> **MTTR objetivo**: < 5 minutos desde detección

## Cuándo usar este runbook

Activar inmediatamente si **después de un deploy a `prod`**:
- Sentry recibe >10 errors/min en endpoints críticos (checkout, orders, login)
- `buleje.pe` retorna 500 o no carga
- Synthetics fallan en `/admin/health` o `/api/health`
- Usuarios reportan "no puedo pagar" o "no puedo entrar"

NO usar si:
- El bug es de datos (no se arregla con rollback — necesita data fix)
- La regresión es solo visual (usar feature flag, no rollback)

## Diagnóstico rápido (60 segundos)

```bash
# 1. ¿Está prod down completo o parcial?
curl -sI https://buleje.pe | head -3
curl -sI https://buleje.pe/api/health | head -3

# 2. Sentry últimos 10 minutos
gh api repos/Buleje/Mercado/deployments --jq '.[0]'

# 3. Vercel last deploy info
vercel inspect prod
```

## Decisión: Rollback vs Hotfix

| Síntoma | Acción |
|---|---|
| Login roto + auth | **Rollback inmediato** (no esperar diagnóstico) |
| Checkout falla pagos | **Rollback inmediato** (pérdida de dinero) |
| 500s en `/admin` | Rollback recomendado |
| Error UI pero datos OK | Feature flag desactivar + hotfix |
| 1 tenant solo afectado | Investigar primero (puede ser data, no código) |

## Rollback Vercel (manera oficial)

### Opción A: Vercel Dashboard (más rápido, 30 segundos)

1. Abrir https://vercel.com/buleje/mercado/deployments
2. Encontrar el deployment ANTERIOR al actual (verde, fecha anterior)
3. Click "..." → **"Promote to Production"**
4. Confirmar
5. Verificar `buleje.pe` cargando en ~30 segundos

### Opción B: Vercel CLI (con permisos prod)

```bash
# Listar últimos 10 deployments
vercel ls

# Promote un deployment específico
vercel promote <deployment-url> --scope=buleje --yes
```

### Opción C: Git revert (si dashboard no responde)

```bash
# Identificar commit que rompió
git log --oneline prod -20

# Revertir EL commit problemático (no merge)
git revert <sha-del-commit-malo> --no-edit
git push origin prod
# Vercel auto-deploy del revert (~2-3 min)
```

⚠️ Si fue un merge: `git revert -m 1 <merge-sha>`.

## Post-rollback (5 minutos)

1. **Confirmar prod sano**:
   ```bash
   curl -sI https://buleje.pe | head -3
   curl -sI https://buleje.pe/api/health
   ```

2. **Sentry**: verificar que error rate baja a baseline (<1/min)

3. **Notificar**:
   - Slack/Discord canal #incidentes
   - Brandon directo si fue P0
   - Twitter/status page si afectó >10% de usuarios

4. **Cerrar deploy bloqueado** en GitHub (si había PR mergeado):
   ```bash
   gh pr comment <pr-num> --body "Rollback ejecutado en $(date). Razón: <detalle>"
   ```

## Post-mortem (24 horas)

Crear ADR del incidente:

```bash
# /adr "Incidente YYYY-MM-DD: <breve descripción>"
```

Estructura del ADR:
1. **Qué pasó** (timeline minuto a minuto)
2. **Por qué** (root cause)
3. **Cómo se detectó** (alert / user report / monitoring)
4. **Cómo se mitigó** (rollback / hotfix / feature flag)
5. **Qué cambia para que no se repita** (test gate / monitoring / process)
6. **Métricas**: MTTD (mean time to detect), MTTR, % usuarios afectados

## Casos especiales

### Migration de DB ya aplicada

Si el commit malo incluyó `prisma migrate deploy` + cambio de schema:

1. Rollback de código NO revierte la migration
2. Si el schema nuevo es backward-compatible: solo rollback código, schema sigue
3. Si NO es compatible: crear migration "down" manual:
   ```sql
   -- prisma/migrations/YYYYMMDD_rollback_X/migration.sql
   ALTER TABLE ... DROP COLUMN ...;
   ```
4. Aplicar con `prisma db execute --file migration.sql`

### Stripe webhook desincronizado

Si rollback dejó webhooks en estado inconsistente:
- Ver runbook: `docs/runbooks/stripe-webhook-lost.md`

### Tenants afectados desigualmente

Si solo algunos tenants ven el error:
- Verificar feature flag activo
- Verificar custom domain config (algunos tenants pueden tener custom DNS)

## Contactos de emergencia

| Rol | Quién | Cuándo |
|---|---|---|
| Owner | Brandon (bulejebrandonluis7575@gmail.com) | Cualquier P0 |
| Vercel support | support@vercel.com | Si dashboard responde |
| Supabase support | support@supabase.io | Si DB no responde |
| Stripe support | stripe.com/contact | Si pagos rotos |

## Métricas SLO

Objetivo: rollback completo en **< 5 minutos** desde detección.

| Quartile | MTTR observado |
|---|---|
| Q1 2026 | 3.2 min |
| Q2 2026 | 2.8 min |
| Objetivo | < 5 min consistente |

## Chaos drill mensual

Realizar cada mes:
```bash
# Simular deploy malo en preview (NO prod)
gh workflow run "deploy-preview-broken-test"
# Practicar rollback en preview
# Documentar tiempo de detección + ejecución
```

## Referencias

- Vercel Rollback docs: https://vercel.com/docs/deployments/rollbacks
- ADR-058: Hub & Spoke v2 (incident response)
- ADR-099: Hardening patterns rounds 6-23
- Runbooks relacionados: `db-down.md`, `redis-down.md`, `stripe-webhook-lost.md`
