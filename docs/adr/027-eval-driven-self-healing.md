# ADR-027 — Eval-Driven Self-Healing

**Status:** 🟡 Proposed
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-025 (Phase 2), ADR-026 (Phase 3)

---

## 1. Contexto

El `/self-heal` (ADR-025) arregla errores de lint/build/test automáticamente. Pero en zonas rojas (checkout 119KB, fiado, SUNAT), un fix ciego puede introducir bugs sutiles. El SRE loop (Sentry → bug-hunter → fix) tiene el mismo riesgo.

**Problema:** auto-fix sin validación = ruleta rusa en zonas críticas.

## 2. Decisión

Crear un **eval harness** en `evals/` con evaluaciones por zona. Regla: **no auto-fix en zona roja sin evals que validen el resultado.**

### Estructura

```
evals/
├── checkout/        (10 evals)
├── fiado/           (5 evals)
├── sunat/           (5 evals)
├── multi-tenant/    (5 evals)
└── runner.ts
```

### Reglas de integración

- Pre-fix: correr evals → capturar `score_antes`
- Post-fix: correr evals → capturar `score_despues`
- Si `score_despues < score_antes - 5` → ROLLBACK
- Si no hay evals para la zona → NO auto-fix, escalar a humano

### Artefactos creados

- Skill `/eval [zona]` — corre evals manualmente
- SRE agent v2 — requiere evals antes de auto-fix
- Dedup registry — 3 intentos máximo por error

## 3. Consecuencias

✅ Auto-fix validado por evals = seguro en zonas rojas
✅ Dedup evita loops infinitos
⚠️ Evals deben escribirse ANTES de las features (eval-driven development)
⚠️ 25 evals = ~30s adicionales pre-merge

## 4. Estado

- [x] Skill `/eval` creado
- [x] SRE agent v2 con dedup + eval requirement
- [ ] Evals reales por escribir (checkout, fiado, sunat, multi-tenant)
- [ ] CI workflow `evals.yml` por crear
- [ ] Integración con pre-commit hook
