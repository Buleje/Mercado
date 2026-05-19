# Sprint 3 Arquitectura — SLO + DR Runbook

> **Brandon 2026-05-18**. Sprint 3 del audit profundo arquitectura.
> Esta página documenta los 2 items que requieren config externa
> (Sentry alerts + Supabase DR drill). Los otros 2 items del Sprint 3
> (ConsentEvent + Yape reconciliation) ya están commiteados.

## ✅ 1. SLOs Sentry + alertas

### Objetivo

3 SLOs mínimos para que Brandon reciba **alerta pageable** cuando algo
crítico rompe en producción, antes de que un cliente reporte.

| SLO | Métrica | Target | Alerta cuando |
|---|---|---|---|
| **Latencia API** | p95 response time en `/api/**` | < 500ms | p95 > 1500ms por 5min |
| **Error rate** | 5xx ratio sobre total requests | < 1% | error rate > 5% por 5min |
| **Cron health** | Crons exitosos / total ejecuciones | > 95% | 3+ crons consecutivos fallan |

### Setup en Sentry dashboard

1. **Crear alertas** (Sentry UI → Alerts → Create Alert):

   **Alert 1: API latency**
   ```
   Type: Metric Alert
   Dataset: transactions
   Condition: p95(transaction.duration) > 1500ms WHERE transaction:"http.server"
   Window: 5 minutes
   Action: Slack to #buleje-alerts + Email Brandon
   ```

   **Alert 2: Error rate**
   ```
   Type: Issue Alert
   Condition: failure_rate() > 5% WHERE level:error
   Window: 5 minutes
   Action: Slack + WhatsApp via Twilio webhook
   ```

   **Alert 3: Cron failures**
   ```
   Type: Custom Metric Alert
   Source: lib/cron/with-cron-health.ts (custom event "cron.failed")
   Condition: count() > 3 WHERE event:cron.failed GROUP BY jobName
   Window: 10 minutes
   Action: PagerDuty (P2 incident) + Slack
   ```

2. **Slack webhook**:
   - Crear canal `#buleje-alerts` en Slack workspace
   - Webhook URL: Slack app → Add to Channel → Incoming Webhook
   - Configurar en Sentry → Settings → Integrations → Slack

3. **PagerDuty** (opcional, $0 free tier hasta 5 usuarios):
   - Crear service "Buleje Production"
   - Routing: Brandon (primary) + un colaborador (backup)
   - Escalation: 15min sin ack → escalar al backup

### Verificación

Forzar un error en staging:
```bash
curl https://staging.buleje.pe/api/test-error-500 # endpoint que devuelve 500
# Esperar 5min → Slack debería recibir el alert
```

## ✅ 2. DR Drill — Restore backup a staging

### Objetivo

Probar que el restore de backups funciona. Sin esto, un backup que no se
puede restaurar = ningún backup.

**RTO objetivo (Recovery Time Objective):** ≤ 2 horas
**RPO objetivo (Recovery Point Objective):** ≤ 24 horas

### Pre-requisitos

- ✅ Supabase Pro plan (Sprint 1) — backups diarios automáticos + 7 días retención
- ⏳ Crear proyecto **staging** en Supabase (gratis, free tier)
- ⏳ Acceso a Supabase Dashboard (Brandon)

### Procedimiento (45min Brandon)

1. **Supabase Dashboard → Production → Database → Backups**
   - Seleccionar backup de hace 1-2 días
   - Click "Download" (formato `.sql.gz`)

2. **Crear DB de staging**:
   - Supabase Dashboard → Create new project
   - Name: `buleje-staging-dr-drill-YYYY-MM-DD`
   - Region: misma que producción
   - Plan: Free tier (es solo para drill)

3. **Restaurar el backup**:
   ```bash
   gunzip backup.sql.gz
   psql "postgresql://postgres:STAGING_PASSWORD@staging-host:5432/postgres" < backup.sql
   ```

4. **Smoke test 10 queries críticas**:
   ```sql
   -- Verifica que datos están
   SELECT COUNT(*) FROM "Order" WHERE "createdAt" > NOW() - INTERVAL '7 days';
   SELECT COUNT(*) FROM "Customer";
   SELECT COUNT(*) FROM "Tenant" WHERE active = true;

   -- Verifica integridad de relaciones
   SELECT COUNT(*) FROM "OrderItem" oi
     LEFT JOIN "Order" o ON o.id = oi."orderId"
     WHERE o.id IS NULL;  -- debería ser 0 (sin huérfanos)

   -- Verifica audit log chain
   SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" IS NOT NULL;
   ```

5. **Apuntar staging-env a la DB restaurada**:
   - `DATABASE_URL` apunta al staging DB
   - Levantar `npm run dev` localmente
   - Login con superadmin → verificar `/superadmin/tenants` muestra los datos esperados

6. **Documentar el tiempo total** (cronometrar desde paso 1 al 5):
   - Si > 2 horas: investigar dónde está el cuello (download, restore SQL, smoke)
   - Si < 2 horas: ✅ RTO cumplido

7. **Eliminar staging project** después del drill (no acumular costos)

### Frecuencia recomendada

- **Mensual** (primer viernes del mes) — Brandon o equipo ops
- **Tras cada migration grande** (Prisma migrate con cambios destructivos)
- **Cuando Supabase plan cambie** (free → pro, pro → team)

### Checklist post-drill

| ✅ | Item |
|---|---|
| ☐ | Backup descargado en < 5min |
| ☐ | Restore SQL ejecutó sin errores |
| ☐ | Smoke test 10 queries devolvió resultados esperados |
| ☐ | App levantó contra staging DB |
| ☐ | RTO total < 2 horas |
| ☐ | Staging project eliminado |
| ☐ | Documento de drill firmado y guardado en `docs/dr-drills/YYYY-MM-DD.md` |

## TODO bloqueante para Brandon

| # | Tarea | Tiempo | Costo |
|---|---|---|---|
| 1 | Crear Sentry alerts (3 SLOs) + integración Slack | 1h | $0 (Sentry team plan ya tiene) |
| 2 | Setup PagerDuty free tier (opcional) | 30min | $0 |
| 3 | DR drill #1 (restore staging) | 1.5h | $0 (free Supabase staging) |
| 4 | Documentar resultado del drill en `docs/dr-drills/2026-05-XX.md` | 15min | — |
| 5 | Apply migration `prisma migrate dev --name add_consent_event` cuando red lo permita | 10min | — |

**Score arquitectural esperado tras Sprint 3 completo: 8.5/10 → 9.0/10.**
