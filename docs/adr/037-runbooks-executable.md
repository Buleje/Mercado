# ADR-037 — Runbooks como Código Operacional Ejecutable

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-034 (SLOs), ADR-025 (Phase 2)

---

## 1. Contexto

Sin runbooks, cada incidente a las 3 AM requiere que Brandon se despierte, diagnostique desde cero, y busque la solución. Con 24 agentes y SRE v2, Claude puede ejecutar runbooks automáticamente.

## 2. Decisión

Crear 8 runbooks ejecutables en `runbooks/` con formato estandarizado: Detección → Diagnóstico → Mitigación → Resolución → Prevención → Owner. Skill `/runbook [incidente]` ejecuta el diagnóstico y mitigación automáticamente.

### Runbooks creados

| Runbook | Severidad | SLO afectado |
|---|---|---|
| checkout-down | P0 | checkout_success_rate |
| db-connections-saturated | P0 | api_p99_latency |
| tenant-isolation-breach | P0 MAX | TODOS |
| sunat-api-failing | P1 | boleta_sunat_success |
| stripe-webhook-failing | P1 | checkout_success_rate |
| redis-down | P1 | api_p99_latency |
| whatsapp-rate-limited | P2 | whatsapp_delivery |
| disk-space-low | P2 | api_p99_latency |

## 3. Consecuencias

✅ Incidentes resueltos sin despertar a Brandon (mitigación automática)
✅ Cada runbook conectado a SLO específico
✅ SRE matchea Sentry patterns contra runbooks
⚠️ Runbooks deben mantenerse actualizados con cambios de infra
