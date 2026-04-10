# ADR-029 — Observabilidad Económica con OTEL

**Status:** 🟡 Proposed
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-026 (Phase 3)

---

## 1. Contexto

Plan Claude Code $200/mes. Sin visibilidad de cuánto cuesta cada sesión, agente o tarea. FinOps agent estima pero no tiene datos reales.

## 2. Decisión

Activar telemetría OTEL en Claude Code y configurar exportador a Grafana Cloud (free tier):

- `CLAUDE_CODE_ENABLE_TELEMETRY=1` en settings
- `OTEL_EXPORTER_OTLP_ENDPOINT` → Grafana Cloud
- `OTEL_SERVICE_NAME=bodega-san-martin-claude`
- Dashboard: tokens/día, costo/día, agente más caro, latencia
- Alerta: gasto diario > $15 USD

### Artefactos

- Env vars en `settings.json` (configuradas, endpoint pendiente)
- FinOps agent v2 conectado a métricas reales
- Reporte diario en `reports/finops/`

## 3. Consecuencias

✅ Visibilidad real de costos por sesión
✅ Datos para model routing (Opus vs Sonnet vs Haiku)
⚠️ Requiere cuenta Grafana Cloud (free tier: 50GB logs, 10k métricas)
⚠️ OTEL endpoint debe configurarse manualmente

## 4. Estado

- [x] Env vars configuradas en settings.json
- [x] FinOps agent v2 reforzado
- [ ] Crear cuenta Grafana Cloud
- [ ] Configurar OTEL endpoint real
- [ ] Dashboard inicial
- [ ] Alertas de costo
