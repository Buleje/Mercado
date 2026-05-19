# DR Drill — TEMPLATE

> Audit 2026-05-17 08-P1-5: CLAUDE.md regla 14 exige drill cada 35 días.
> Copiar este template como `drill-YYYY-MM-DD.md` y completar al ejecutar.

## Identidad

| Campo | Valor |
|---|---|
| Fecha | YYYY-MM-DD |
| Ejecutor | (nombre) |
| Tipo | full / partial / restore-only / failover |
| Duración total | (min) |
| Resultado | PASS / PARTIAL / FAIL |

## Escenario simulado

(Ej: "Supabase prod cae a las 14:00 — pgBouncer pool exhausted, queries fallan con timeout. Tenemos backup encriptado de las 02:00 + redo log hasta 14:00.")

## Pre-condiciones

- [ ] Backup vigente < 24h (ver `/api/cron/auto-backup`)
- [ ] DIRECT_URL accesible desde la máquina de ejecución
- [ ] Acceso a Vercel CLI con permisos de producción
- [ ] Healthcheck baseline (`npm run dev:health`) sin alertas

## Pasos ejecutados

### 1. Restore del backup
| Paso | Comando | Resultado | Tiempo |
|---|---|---|---|
| Descargar snapshot | `node scripts/dr-restore-snapshot.mjs --date=YYYY-MM-DD` | | |
| Crear staging branch | `gh supabase branch create dr-drill-{date}` | | |
| Aplicar dump | `psql $STAGING_URL < snapshot.sql.gz` | | |
| Verificar tablas | `SELECT count(*) FROM "Tenant"` | (esperado: N) | |

### 2. Validación de datos
- [ ] Orders ≥ N filas / sin huecos en `id`
- [ ] Tenants activos coinciden con prod
- [ ] StripeWebhookQueue vacío (replay-able)
- [ ] CronHealthLog últimas 24h cubre todos los crons (37+)

### 3. Failover de aplicación
| Paso | Comando | Resultado |
|---|---|---|
| Apuntar Vercel a staging DB | `vercel env pull --environment=preview` + edit | |
| Deploy preview | `vercel --prod=false` | |
| Smoke test crítico | curl `/api/health`, `/api/auth/login`, `/marketplace` | |

### 4. Reconciliación
- [ ] Webhook replay queue procesado sin pérdidas
- [ ] Diff de Orders entre prod-down-time y staging restaurado documentado
- [ ] Comunicación a tenants afectados drafteada

## Hallazgos

| # | Severidad | Descripción | Acción |
|---|---|---|---|
| 1 | | | |

## RTO/RPO medidos

| Métrica | Target | Medido |
|---|---|---|
| RTO (Recovery Time Objective) | 60 min | |
| RPO (Recovery Point Objective) | 1 hora | |

## Próximos pasos

- [ ] Crear issue para cada hallazgo P0/P1
- [ ] Programar próximo drill (≤35 días desde hoy)
- [ ] Actualizar runbook si el procedimiento cambió

## Firmas

- Ejecutor: ______________
- Revisor: ______________
- Fecha de cierre: ______________
