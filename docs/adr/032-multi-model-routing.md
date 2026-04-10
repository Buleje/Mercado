# ADR-032 — Multi-Model Routing Económico

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-026 (Phase 3), ADR-029 (OTEL)

---

## 1. Contexto

Plan Claude Code $200/mes. Usando Opus para TODO — incluyendo tareas mecánicas como lint fixes, renames y docs. Desperdicio estimado: 40-60% del presupuesto.

## 2. Decisión

Crear `lib/claude-router.ts` con routing keyword-based a 3 tiers:

| Tier | Modelo | Costo relativo | Uso |
|---|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | 10% | Lint, format, rename, docs, imports |
| Sonnet 4.6 | `claude-sonnet-4-6` | 30% | Code review, debug, tests, refactor |
| Opus 4.6 | `claude-opus-4-6` | 100% | Arquitectura, seguridad, checkout, fiado |

### Reglas de routing
- Opus gana si detecta CUALQUIER keyword crítica (security, architecture, checkout, fiado, sunat)
- Haiku gana si la tarea es mecánica y no tiene keywords de Sonnet/Opus
- Sonnet es el default (balance costo/calidad)

### Script de worktrees paralelos
`scripts/spawn-claude-trio.sh` — ejecuta 3 sesiones Claude en worktrees git paralelos:
- Worktree Alpha, Bravo, Charlie
- Cada uno en su branch aislado
- Coordinador mergea al final

## 3. Consecuencias

✅ Ahorro estimado: 40-60% del presupuesto de tokens
✅ Worktrees 3x: mismo plan, triple output
⚠️ Routing keyword-based no es perfecto — puede subestimar complejidad
⚠️ Worktrees requieren Claude Code CLI instalado globalmente

## 4. Estado

- [x] `lib/claude-router.ts` creado con `routeModel()` y `estimateSavings()`
- [x] `scripts/spawn-claude-trio.sh` creado con 3 worktrees paralelos
- [x] ADR-032 documentado
- [ ] Integrar router con finops-guard para reportes
- [ ] Calibrar keywords con datos reales de sesiones
