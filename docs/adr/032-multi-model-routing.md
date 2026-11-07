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

| Tier | Modelo | Precio (in/out por MTok) | Costo relativo | Uso |
|---|---|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | $1 / $5 | 25 % | Lint, format, rename, docs, imports |
| Sonnet 5 | `claude-sonnet-5` | $2 / $10 | 50 % | Code review, debug, tests, refactor |
| Opus 5.5 | `claude-opus-5-5` | $4 / $20 | 100 % (base) | Arquitectura, seguridad, checkout, fiado |

> Tabla al **2026-09-22**. El costo relativo es el cociente de precios de entrada contra el tier
> base, no una estimación. **Fable 5.1** (`claude-fable-5-1`, $10 / $50) queda fuera del router a
> propósito: es para razonamiento exigente, sale 2,5× Opus 5.5 y se pide explícitamente, nunca por
> keywords.

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

## 5. Historial de modelos

Cada vez que cambia la generación hay que tocar **tres** lugares, no uno (verificado 2026-09-22):
`lib/claude-router.ts` (`MODEL_IDS` + `COST_MULTIPLIERS`), `lib/llm-providers/anthropic.ts`
(`models.premium/balanced/cheap`) y `lib/ai/track-usage.ts` (`PRICING_PER_1M`, donde la fila vieja
**se queda**: el historial de uso ya grabado la cita y un modelo sin fila cae al `default`, que
cobraría de más). Los usos sueltos de `claude-sonnet-5` en visión/OCR (`lib/ai/*-vision.ts`,
`vision-extract`, `gtf-ocr`, `ocr/invoice`) son decisiones por capacidad, no por costo: no se mueven
con la generación.

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-09-11 | 4.6 → familia 5 (Opus 5 $5/$25, Sonnet 5 $2/$10) | Más capaces y más baratos que 4.6 |
| **2026-09-22** | Opus 5 → **Opus 5.5** (`claude-opus-5-5`, $4/$20) | Salió ese día; es la recomendación por defecto de Anthropic y cuesta 20 % menos. Al bajar el precio base, el ahorro de bajar de tier se achica: haiku pasó de 1/5 a 1/4 del tier opus |
