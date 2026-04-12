# ADR-034 — SLOs como Contrato Operacional

**Status:** Accepted
**Fecha:** 2026-04-09
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-025 (Phase 2 Autonomous OS), ADR-026 (Phase 3), ADR-033 (Level 5 Autonomy)

---

## 1. Contexto

Sin numeros, "calidad" es solo una opinion. El proyecto Buleje necesita metricas objetivas que definan que significa "el sistema esta funcionando bien" y mecanismos automaticos que protejan esa calidad.

Actualmente no hay definicion formal de que porcentaje de checkouts deben ser exitosos, cual es la latencia maxima aceptable, ni cuanto margen de error tenemos antes de que un deploy sea riesgoso. Esto lleva a decisiones basadas en intuicion en vez de datos.

Los Service Level Objectives (SLOs) con error budgets resuelven esto: definen umbrales numericos de calidad y crean un "presupuesto de errores" que se consume con cada fallo. Cuando el presupuesto se agota, los deploys se bloquean automaticamente hasta que la calidad se recupere.

## 2. Decision

Implementar 4 SLOs con error budgets, un gate automatico pre-deploy, y un calculador de presupuesto:

### 2.1 SLOs definidos

| SLO | Target | Ventana | Error Budget | Owner |
|-----|--------|---------|--------------|-------|
| `checkout_success_rate` | 99.5% | 30 dias | 21 min downtime/mes | sre-observability |
| `api_p99_latency` | <500ms (99.9%) | 7 dias | 0.1% slow requests | performance-engineer |
| `boleta_sunat_success` | 99.9% | 30 dias | 4 fallos/1000 | integration-specialist |
| `whatsapp_delivery` | 98% | 30 dias | 14 hrs degraded/mes | integration-specialist |

### 2.2 Componentes

1. **`slo/slo.yaml`** — Definicion declarativa de los 4 SLOs con umbrales de alerta (50%, 75%, 90%, 100%)
2. **`lib/slo/budget-calculator.ts`** — Modulo TypeScript que calcula burn rate, status, y decide si bloquear deploys
3. **`.claude/hooks/pre-deploy-slo-gate.mjs`** — Hook PreToolUse que bloquea deploys cuando >90% del budget esta consumido
4. **`.claude/skills/slo-status/SKILL.md`** — Skill `/slo-status` para consultar estado desde Claude Code
5. **Tests unitarios** — 8 tests en `lib/slo/__tests__/budget-calculator.test.ts`

### 2.3 Umbrales de alerta

| Nivel | Budget Consumed | Accion |
|-------|-----------------|--------|
| Info | 50% | Notificacion Slack |
| Warning | 75% | Slack + page oncall |
| Critical | 90% | **Bloqueo de deploys** + page oncall |
| Exhausted | 100% | Bloqueo total + canal de incidentes + page lead |

### 2.4 Bypass de emergencia

Variable `SLO_GATE_BYPASS=1` permite deployar con budget agotado. Se loguea como bypass de emergencia para auditoria.

## 3. Alternativas consideradas

### 3.1 Datadog SLOs
- **Pro:** Dashboard nativo, alertas integradas, historial
- **Contra:** $23/host/mes minimo, overkill para una bodega en Pucallpa
- **Veredicto:** Rechazado por costo

### 3.2 New Relic SLOs
- **Pro:** Tier gratis disponible, buen ecosistema
- **Contra:** $0.35/GB ingest, vendor lock-in, complejidad de setup
- **Veredicto:** Rechazado por costo y complejidad

### 3.3 Metricas custom sin concepto de budget
- **Pro:** Mas simple de implementar
- **Contra:** Sin budget no hay mecanismo objetivo de "cuando parar y arreglar"
- **Veredicto:** Rechazado — el budget es el valor diferencial de los SLOs

## 4. Consecuencias

### Positivas
- Los deploys se bloquean automaticamente cuando la calidad se degrada
- Cada SLO tiene un owner (agente) responsable
- El error budget da flexibilidad controlada — no es "zero tolerance" sino "tolerance with limits"
- El skill `/slo-status` permite consultar el estado en cualquier momento
- Los tests validan que la logica de calculo es correcta

### Negativas
- Requiere datos reales de Sentry/OTEL para ser util en produccion (sin datos = simulado)
- El archivo `slo/current-metrics.json` debe ser actualizado por un cron o pipeline
- Agrega un gate mas al proceso de deploy (mitigado con bypass de emergencia)

### Neutras
- Los SLOs iniciales son conservadores — ajustar targets despues de 30 dias de datos reales
- El calculador esta hardcoded por ahora — migrar a YAML parsing cuando haya dependencia de yaml parser

## 5. Checklist de verificacion

- [ ] `slo/slo.yaml` contiene 4 SLOs con targets, windows, y alerting thresholds
- [ ] `lib/slo/budget-calculator.ts` exporta loadSLOs, calculateBudgetBurn, getAllBudgetStatuses, shouldBlockDeploy, formatStatusTable
- [ ] `lib/slo/__tests__/budget-calculator.test.ts` tiene 8+ tests que pasan
- [ ] `.claude/hooks/pre-deploy-slo-gate.mjs` bloquea deploys con >90% budget burned
- [ ] `.claude/hooks/pre-deploy-slo-gate.mjs` permite bypass con SLO_GATE_BYPASS=1
- [ ] `.claude/hooks/pre-deploy-slo-gate.mjs` no bloquea cuando no hay datos
- [ ] `.claude/skills/slo-status/SKILL.md` esta registrado y es invocable
- [ ] Hook registrado en `.claude/settings.json` con matcher "Skill" y timeout 10
- [ ] ADR-034 existe en `docs/adr/`

---

> Este ADR establece el contrato operacional numerico del proyecto. Los targets se revisaran tras 30 dias de datos reales en produccion.
