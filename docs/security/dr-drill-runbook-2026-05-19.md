# DR Drill Runbook — 2026-05-19

> **Eje:** Sprint Final Día 14 · Operación
> **Regla CLAUDE.md #14:** Deploy SLO healthy + canary 5%→25%→100% + **DR drill <35d**
> **Última ejecución:** Pendiente (primer drill)
> **Próximo drill obligatorio:** 2026-06-22 (35 días desde hoy)

## TL;DR — ¿Por qué este runbook?

Si Supabase cae 6h, Vercel se cae, o un attacker borra `Order`, Brandon
necesita un **procedimiento probado** para volver online en <2 horas.

Hoy NO hay procedimiento probado. Este runbook documenta:
1. Backup status actual
2. Procedimiento de restore paso a paso
3. RTO/RPO targets
4. Drill simulation (sin afectar prod) cada 35 días

## SLO targets

| Métrica | Target | Cómo medimos |
|---|:-:|---|
| **RTO** (Recovery Time Objective) | **<2h** | Tiempo desde detección incidente hasta servicio restaurado |
| **RPO** (Recovery Point Objective) | **<15min** | Cuánta data podemos perder máximo |
| **Disponibilidad mensual** | **99.5%** | Excluye mantenimientos planificados |

## Componentes críticos y su backup actual

### 1. Supabase Postgres (datos transaccionales)

| Aspecto | Estado |
|---|---|
| Backups automáticos | ✅ Supabase nativo: snapshots diarios (Free plan = 1 día retención, Pro = 7 días) |
| Backups manuales | ⚠️ Brandon NO tiene script de export programático |
| Point-in-time recovery | ❌ Sólo Pro plan + add-on |
| Replication / read replica | ❌ No configurada |
| Frecuencia recomendada | **Cada 6h** export a S3/Vercel Blob |

**Riesgo actual:** si Supabase cae, max RPO = 24h (snapshot diario).
Si attacker borra `Order`, RPO depende de cuándo se detecte.

### 2. Vercel (app + edge functions)

| Aspecto | Estado |
|---|---|
| Backups | ✅ Git history en GitHub `Buleje/Mercado` |
| Rollback deploy | ✅ `vercel rollback <deployment-id>` o panel UI |
| Env vars backup | ⚠️ NO automatizado — pendiente script |
| Preview URLs | ✅ funcionan ante caída de prod (canary) |

### 3. Upstash Redis (cache + rate limit)

| Aspecto | Estado |
|---|---|
| Persistencia | ⚠️ Sólo cache — no es source of truth |
| Backups | ❌ No críticos (datos efímeros) |
| Failover | Si Upstash cae, rate-limit deshabilita pero app sigue |

### 4. Vercel Blob (uploads images, comprobantes Yape)

| Aspecto | Estado |
|---|---|
| Backups | ⚠️ Vercel internal — no cross-region |
| Riesgo | Comprobantes Yape perdidos = no verificable pago manual |
| Mitigación | Sincronizar copy a S3 secundario (BACKLOG) |

## Procedimiento de Restore (escenario común)

### Escenario A — Supabase DB corrupta o snapshot needed

1. Identificar timestamp del último estado bueno (Sentry + audit log)
2. Login Supabase dashboard → Project `Mercado` → Database → Backups
3. Click "Restore" → seleccionar snapshot fecha buena
4. **OJO**: restore CREA nueva DB instance. La URL cambia.
5. Actualizar `DATABASE_URL` + `DIRECT_URL` en Vercel preview primero
6. Smoke test 15 min en preview URL
7. Si OK → actualizar prod env vars + redeploy
8. Anunciar status en grupo WhatsApp clientes

**RTO esperado:** 1h-2h dependiendo tamaño DB

### Escenario B — Vercel deployment con bug crítico

1. Detectar via Sentry / health check
2. Vercel dashboard → Deployments → seleccionar último deploy bueno
3. Click "..." → "Promote to production"
4. Espera 30s — el rollback es instant
5. Verificar `/health` endpoint responde 200
6. Crear hotfix branch + PR para reparar bug

**RTO esperado:** <5 min

### Escenario C — Attacker borró/modificó data (post-2026-05-19)

1. **Inmediato:** rotar TODAS las credentials
   - `AUTH_SECRET` (forza logout global)
   - `CRON_SECRET` (mata jobs sospechosos)
   - DB passwords (`app_user`, `prisma_migrator`, `postgres`)
2. Revisar `ActivityLog` con audit-chain-integrity cron — buscar gaps en el hash chain
3. Identificar timestamp + rows afectadas con queries SQL
4. Restore snapshot Supabase a último estado bueno
5. Re-aplicar cambios legítimos manualmente (si los hubo entre snapshot y attack)
6. Post-mortem documentado en `docs/security/incidents/`

**RTO esperado:** 2h-4h

### Escenario D — Pérdida total Supabase (raro)

1. Crear nuevo proyecto Supabase
2. `prisma migrate deploy` con la migration history
3. Restore data desde último export S3 (si existe — pendiente automatizar)
4. Actualizar env vars Vercel
5. Smoke test exhaustivo

**RTO esperado:** 4h-8h (sin backup S3 automatizado)

## Drill Simulation (sin afectar prod) — ejecutar cada 35 días

### Drill A: rollback Vercel deployment

```bash
# 1. Listar deployments
vercel list

# 2. Identificar el ÚLTIMO de ayer (no el actual)
PREVIOUS_DEPLOY=<id>

# 3. Promote a producción
vercel promote $PREVIOUS_DEPLOY --token=$VERCEL_TOKEN

# 4. Verificar
curl https://buleje.pe/health
# Expected: {"status":"ok","commit":"<previous>"}

# 5. Rollback al actual
vercel promote <current_id> --token=$VERCEL_TOKEN
```

**Tiempo esperado:** <3 min total. Sin downtime real (canary).

### Drill B: restore snapshot Supabase a branch staging

```
1. Supabase → Branches → Create branch "dr-drill-YYYY-MM-DD"
2. La branch arranca con datos current (no histórico)
3. Database → Backups → Restore to current branch (NO main)
4. Conectar Prisma a branch URL temporalmente
5. Validar queries básicas (login, /tiendas, orders)
6. Borrar la branch al cerrar drill
```

**Tiempo esperado:** 30 min. Costo: ~$0.30 mientras la branch existe.

### Drill C: rotación credenciales DB

```
1. Crear rol app_user_v2 con password nueva
2. GRANT mismas permissions que app_user
3. Test connection desde Vercel preview
4. Si OK, swap DATABASE_URL Vercel prod a v2
5. DROP ROLE app_user (anterior)
```

**Tiempo esperado:** 20 min.

## Checklist DR drill 35-day

Brandon debe ejecutar TODOS los pasos cada 35 días:

- [ ] Drill A — rollback Vercel deployment
- [ ] Drill B — restore snapshot a branch staging
- [ ] Drill C — rotación credentials DB (al menos `app_user`)
- [ ] Verificar Supabase snapshots están al día
- [ ] Verificar `audit-chain-integrity` cron corrió últimos 7 días sin gaps
- [ ] Documentar resultado del drill en `docs/security/dr-drills/`
- [ ] Actualizar "Última ejecución" arriba de este runbook

## Items críticos pendientes (gap → drill futuro)

| # | Item | Impacto | Prioridad |
|---|---|---|:-:|
| 1 | Script automatizado de backup DB a S3 cada 6h | RPO 24h → RPO 6h | P0 |
| 2 | Backup env vars Vercel automatizado (snapshot semanal) | Si pierdes env vars, recrear es 1h | P1 |
| 3 | Replicación cross-region Vercel Blob (uploads) | Comprobantes Yape: si Vercel falla, no verificable | P1 |
| 4 | `audit-chain-integrity` cron alertas Sentry si gap | Hoy logs solos — sin alerta automática | P1 |
| 5 | Read replica Supabase Pro (a 200+ tenants) | Distribución carga + failover | P2 |

## Métricas para tracking

```
RPO actual (backup diario):  24h
RPO target (con S3 6h):       6h
RTO actual:                  manual ~2-4h
RTO target:                   <2h con runbook entrenado
Última DR drill:             pendiente primera ejecución
Próximo drill obligatorio:   2026-06-22
```

## Referencias

- Regla CLAUDE.md #14 — deploy + DR drill <35d
- ADR-114 RLS Postgres híbrido
- `docs/security/rls-credentials-TEMPLATE.md`
- `docs/security/pentest-sprint-final-2026-05-18.md`
- `lib/cron/audit-chain-integrity.ts` (cron diario)

## Cambios necesarios para mejorar DR

| Cambio | Sprint Final | Post-sprint |
|---|:-:|:-:|
| Documentar runbook (este archivo) | ✅ | — |
| Script backup S3 6h | — | P0 backlog |
| Script env vars backup | — | P1 backlog |
| Configurar Sentry alert audit-chain-gap | — | P1 backlog |
| Vercel Blob cross-region | — | P1 backlog |
| Ejecutar primer DR drill REAL | — | A 2026-06-22 |
