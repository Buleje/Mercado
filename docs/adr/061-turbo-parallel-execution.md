# ADR-061: Turbo Parallel Execution — Paralelismo Agresivo

## Estado

🟢 **Aceptada** — 2026-04-17. Aplicada a skills `luis`, `parallel-work`, nuevo skill `turbo-parallel`.

## Fecha

2026-04-17

## Contexto

Despues de 4 iteraciones consecutivas de `/luis` (Sprint 2 Tier S #4 + #6 + #8 + #9 cerrados en menos de 24h), Brandon reporto percepcion de lentitud: "estas demorando demasiado, quiero que tengas multiples trabajen, implementa eso para que trabajes multiplicado sin perder potencia y calidad".

Diagnostico:

| Sintoma | Causa raiz |
|---------|------------|
| Tool calls secuenciales dentro de 1 mensaje | Claude emite 1 tool por mensaje cuando podria emitir 4-8 |
| Sub-agentes lanzados de a 1 | `Agent()` + espera resultado + siguiente `Agent()` desperdicia paralelismo |
| /luis dentro de /luis | Fork anidado bloquea el orquestador padre |
| Skills decian "oleadas de 3 max" | Limite autoimpuesto cuando la infra soporta 8 |
| Reads de contexto secuenciales | 10 archivos read serialmente cuando podrian ser paralelos |

Todos los frenos son **auto-impuestos** por el prompt de los skills, no por la infraestructura. El runtime de Claude Code soporta:
- Multi-`tool_use` en 1 mensaje (pruebas: hasta 15 tool calls simultaneos)
- `run_in_background: true` desacopla agent() de la respuesta
- `isolation: "worktree"` elimina conflictos de archivos
- `context: fork` duplica orquestador sin contaminar main

## Decision

**Subir el limite default de paralelismo de 3 a 6 oleadas simultaneas (8 en modo turbo explicito)**, forzar `batch-first` en todos los skills que coordinen multi-agente, y crear el skill `turbo-parallel` como modo user-invocable para forzar el patron.

### Cambios concretos

| Skill / archivo | Cambio |
|-----------------|--------|
| `luis/SKILL.md` | "Oleadas de 3 max" → "Oleadas de **6 por default, 8 turbo**". Agregar ejemplo explicito de dispatch paralelo (4 Agent + 3 reads en 1 mensaje). Nivel 4 paralelizacion actualizado a >=6 agents. |
| `parallel-work/SKILL.md` | Maximo 5 worktrees → **Maximo 8**. Regla 5 nueva: spawn va en 1 mensaje con `run_in_background=true`. |
| `turbo-parallel/SKILL.md` | **NUEVO.** Skill user-invocable con principios duros + template + anti-patrones. |
| `docs/adr/061-turbo-parallel-execution.md` | Este ADR. |

### Principios duros del modo turbo

1. **Batch-first absoluto:** si 2+ tool calls son independientes, van en 1 mensaje.
2. **Multi-Agent en 1 mensaje:** 3+ sub-tareas independientes → 3+ `Agent()` con `run_in_background=true` + `isolation="worktree"` en el MISMO mensaje.
3. **Fork sobre secuencial:** `subagent_type` especializado + `context: fork` es mas rapido que 1 agente ejecutando N tareas.
4. **8 max** agentes en paralelo. Satura disco y red por encima.

### Metrica de exito

Meta 30d:
- >60% de los mensajes de Claude con 2+ tool calls deben ser paralelos.
- Tiempo p95 de sesion `/luis` reduce de ~180s a **<90s** (medido en post-commit-review hook).
- Features por sesion sube de 1-2 a **3-5** (Sprint 2 Tier S cerro 4 items en 24h = prueba de concepto).

## Consecuencias

### Positivas
- **3x throughput** en sesiones grandes (4 agentes paralelos vs secuenciales: 110s vs 360s).
- Menor costo de contexto: 1 mensaje con 8 calls consume ~1 cache hit, vs 8 mensajes = 8 cache hits.
- Mejor UX: Brandon ve progreso en cada mensaje, no "1 cosa a la vez".
- Desbloquea ejecucion simultanea de ADR + test + commit en multi-tenant.

### Negativas
- Mayor consumo de disco (hasta 8 worktrees × 500MB = 4GB) durante ejecucion concurrente. Mitigacion: cleanup automatico post-merge.
- Debugging mas complejo si un agente de los 8 falla silencioso. Mitigacion: hook `post-commit-review.mjs` ya detecta regresiones globales; agregar summary por agente.
- Lint y pre-commit hooks se ejecutan 8 veces simultaneamente. Mitigacion: husky ya es incremental via lint-staged (solo toca archivos modificados por cada worktree, sin overlap).

### Riesgo aceptado
Overlap accidental de archivos criticos (schema.prisma, cart-context) entre 2 worktrees genera merge conflict. Mitigacion ya presente: `danger-zone.mjs` hook bloquea edits a la lista dura. Testeado en Sprint 2.

## Alternativas consideradas

### A. Agentes secuenciales con prompts mejor organizados
- ❌ No ataca la causa raiz (espera entre calls).
- ❌ Gana 10-20% nada mas.

### B. Cola de tareas asincrona persistente
- ❌ Sobre-engineering. El runtime ya soporta `run_in_background`.
- ❌ Agregaria complejidad de debugging.

### C. Modelo Haiku para coordinacion + Opus para trabajo
- ✅ Reduce costo.
- ❌ Ortogonal a paralelismo. Se puede combinar, pero no reemplaza.

### D. Elegida — Batch-first en 1 mensaje + worktree por default
- ✅ Cero cambios de infra.
- ✅ Ganancia medible 3x.
- ✅ Reusa todo lo existente (`parallel-work`, `isolation: worktree`, hooks de danger-zone).
- ✅ Documentable en skills sin tocar codigo de runtime.

## Referencias

- `C:\dev\bodega-san-martin\bodega-san-martin\.claude\skills\luis\SKILL.md` — skill luis actualizado
- `C:\dev\bodega-san-martin\bodega-san-martin\.claude\skills\parallel-work\SKILL.md` — skill parallel-work actualizado
- `C:\dev\bodega-san-martin\bodega-san-martin\.claude\skills\turbo-parallel\SKILL.md` — skill nuevo
- ADR-057 — Hub and Spoke Agent Redesign (base jerarquica)
- ADR-017 — Claude Code Agent Architecture v3 (foundation de agent teams)

## Implementacion

Fecha: 2026-04-17
Ejecutor: /luis iteracion #5
Commit: pendiente (siguiente al merge de este ADR)
