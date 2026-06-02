# HISTORY.md — Dashboard de olas con metricas

> El agente `scribe` actualiza este archivo al cerrar cada ola.
> El agente `optimizer` lo lee para detectar tendencias.

---

## Resumen global

| Metrica | Valor |
|---------|-------|
| Olas completadas | 1 |
| Items totales completados | 8 |
| Items totales del roadmap | 84 |
| Progreso roadmap | 9.5% |
| Tests acumulados | 53+ |
| Agentes activos | 35 (31 + 4 SWARM nuevos) |

---

## Ola 1 — 2026-04-10 (pre-SWARM)

| Metrica | Valor |
|---------|-------|
| Items planificados | 8 |
| Items completados | 8 |
| Completion rate | 100% |
| TSC errores al cerrar | 0 |
| Tests totales | 53 |
| Tests verdes | 53 |
| Archivos creados | ~15 |
| Archivos modificados | ~12 |
| Reviews BLOCKER | 0 (no habia reviewer) |
| Reviews MAJOR | 0 (no habia reviewer) |
| Sistema usado | Waves (3 terminales ad-hoc) |
| Modelo principal | opus + sonnet agents |

### Desglose por agente (v2 format)

| Agente | Tiempo aprox | Tokens aprox | Items | Tests |
|--------|-------------|-------------|-------|-------|
| T1-orchestrator | ~30 min | ~50K | #4, #5 | 0 |
| T2-agent (MRR+RFM) | ~10 min | ~99K | #1, #7 | 49 |
| T3-agent (catalog+FEFO) | ~13 min | ~94K | #10, #12 | 0 |
| loyalty-ui agent | ~5 min | ~50K | (extra) | 0 |
| loyalty-earn agent | ~9 min | ~62K | (extra) | 4 |
| forecast-dash agent | ~9 min | ~64K | (extra) | 0 |

> Nota: tiempos y tokens son aproximados basados en duration_ms y total_tokens de los agents.
> A partir de Ola 2 el scribe registrara estos datos con precision.

### Items completados
| # | Tier | Item | Esfuerzo real |
|---|------|------|---------------|
| 1 | S | Fix MRR prices | S |
| 2 | S | Fix tenants fantasma | - (pre-existente) |
| 4 | S | Abandoned cart WhatsApp | S |
| 5 | S | Daily briefing WhatsApp | S |
| 6 | S | Churn engine cron | - (pre-existente) |
| 7 | S | CRM + RFM integration | S |
| 10 | S | Catalogo 201 productos | M |
| 12 | S | FEFO enforceado POS | M |

### Extras (no roadmap)
- Loyalty auto-earn + historial + tier WhatsApp
- Forecasting dashboard admin
- 5 zonas SEO nuevas (10 → 15)
- Tests auto-earn (4/4)
