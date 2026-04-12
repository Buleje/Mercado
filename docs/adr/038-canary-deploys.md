# ADR-038 — Canary Deploys con Auto-Rollback OTEL-Driven

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-034 (SLOs), ADR-026 (Phase 3)

---

## 1. Contexto

Deploys directos = ruleta rusa. Sin canary, un bug en producción afecta al 100% de usuarios inmediatamente. Con SLOs definidos (ADR-034), ahora sabemos cuándo hacer rollback.

## 2. Decisión

Modificar el flujo de deploy a canary por defecto:
- Fase 1 (Canary): 5% tráfico, 5 min monitoreo
- Fase 2 (Beta): 25% tráfico, 10 min monitoreo
- Fase 3 (GA): 100% tráfico, 15 min post-monitoreo

Auto-rollback si: error rate >1%, p99 >800ms, 5xx en checkout, SLO burn >5%.

Modos: `--instant` (emergencia), `--canary-fast` (15 min), `--canary-slow` (1 hora).

## 3. Consecuencias

✅ Deploys sin miedo — rollback automático si algo sale mal
✅ Conectado a SLOs para decisión basada en datos
⚠️ Deploys más lentos (30 min vs instantáneo)
⚠️ Requiere monitoreo funcional (Vercel logs, health endpoint)
