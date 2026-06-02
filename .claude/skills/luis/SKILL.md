---
name: luis
description: MODO MAXIMO — Arranque completo con todo el ecosistema. Carga 23 MCPs, 17 agentes, 65 skills, 31 hooks, auto-learning, sprint-autopilot. Diagnostica, propone y EJECUTA la accion mas ambiciosa sin pedir permiso.
user-invocable: true
model: opus
context: fork
allowed-tools: Read, Edit, Write, Bash
---

# /luis — MODO MAXIMO (Level 5 Real + Sprint 2)

Cuando Brandon escribe **"luis"**, el sistema se despierta al 100% y arranca trabajo real.

## FASE 0.PRE — Confirmar bootstrap

**Atajo:** si existe `.claude/session_handoff.md` con fecha reciente → SALTAR verificacion, solo leer handoff como primer read.

Si no hay handoff reciente, confirmar en 1 tabla: pixel-agents (3456), timbre ding-dong, pre-push pentest, pre-commit gitleaks, MCPs (23), Agent Teams, auto-learning, loop continuo — todos activos via SessionStart/hooks.

## FASE 0 — Cargar TODO (paralelo, 10 reads en 1 mensaje)

```
1. .claude/session_handoff.md (PRIMERO — evita re-diagnostico)
2. CLAUDE.md (reglas criticas + power rules)
3. docs/ROADMAP-24-WEEKS.md (Sprint activo)
4. docs/VISION_2027.md (norte: 100 bodegas)
5. .claude/improvement-radar.md (mejoras pendientes)
6. MEMORY.md (indice memorias)
7. .claude/.state/session-state.json (handoff interno)
8. .claude/learning/patterns.json (patrones aprendidos)
9. .claude/metrics/agents.jsonl (costo/uso de agentes)
10. Bash: git log --oneline -10
```

## FASE 1 — Diagnostico rapido (paralelo)

4 checks: `git status --short | wc -l`, `tsc --noEmit | tail -3`, `npm run lint | tail -3`, `git branch --show-current`

## FASE 2 — Tabla de estado (SIEMPRE mostrar)

Mostrar tabla con: Branch, TypeScript OK/FAIL, Lint OK/FAIL, Archivos dirty, Session anterior, Patrones aprendidos, Evoluciones.

Resumen ecosistema: 17 agentes, 65 skills, 31 hooks, 23 MCPs, 5 crons, 3 learning stores.

## FASE 3 — Detectar la accion mas ambiciosa

Prioridad:
1. **ROJO: Build/tsc roto** → `/self-heal` inmediato
2. **ROJO: Tests fallando** → `/self-heal test`
3. **NARANJA: Handoff pendiente** → continuar sesion anterior
4. **NARANJA: Patrones 3+ sin artifacts** → `/evolve generate`
5. **AMARILLO: Sprint items pendientes** → mayor impacto del ROADMAP
6. **VERDE: Todo OK** → feature de VISION_2027

## FASE 4 — Declarar y EJECUTAR con Agent Team Nivel 3

```
🏛️ Orquestador Principal: yo (Claude Opus)
Objetivo: [1 frase, mejora GRANDE — no refactor cosmetico]

Agencias: ARQ (architect), DB (database),
BACKEND (backend + integration), FRONTEND (frontend + UX),
QA (qa + pentester), GOBERNANZA (reviewer + docs)

DAG: ARQ → (DB || BACKEND) → FRONTEND → (QA || GOBERNANZA)

MCPs: exa+firecrawl+context7 (research), github (historico),
ecc_memory (persistencia), playwright (e2e), vercel (deploy)
```

**Reglas (ADR-061 turbo):**
- Oleadas de **6 agentes paralelos por default** (8 en turbo-parallel). `isolation: "worktree"` OBLIGATORIO si >=3 frentes tocan dominios distintos.
- **Batch-first:** todo Read/Glob/Grep/Bash independiente VA en 1 solo mensaje. Jamas 2 tool calls secuenciales si pueden ir en paralelo.
- **Agent dispatch en bloque:** si detectas 3+ sub-tareas independientes, lanza los 3 Agent() en el MISMO mensaje (multi tool_use blocks). No esperes el primero.
- NO esperar "si" de Brandon. SIEMPRE la opcion mas grande.

### Ejemplo turbo obligatorio (FASE 4)

```
[MISMO mensaje, 4 Agent calls + 3 reads]:
  Agent(subagent_type: database, isolation: worktree, run_in_background: true, prompt: [DB layer])
  Agent(subagent_type: backend, isolation: worktree, run_in_background: true, prompt: [API routes])
  Agent(subagent_type: frontend, isolation: worktree, run_in_background: true, prompt: [UI components])
  Agent(subagent_type: tester, isolation: worktree, run_in_background: true, prompt: [tests])
  Read(ROADMAP) + Read(session-state) + Read(ADR anterior)

→ 4 agentes trabajan en worktrees aislados mientras Claude lee contexto.
→ Tiempo real: max(agent_time) + sync_merge, NO sum(agent_time).
```

## FASE 5 — Loop continuo post-task

1. Timbre ding-dong (auto via hook Stop)
2. Tabla 3-5 mejoras GRANDES: `| # | Mejora | Impacto $ | Esfuerzo | Agencias | ☐Si ☐No ☐Despues |`
3. Marcar #1 con ⭐
4. ScheduleWakeup(60s) auto-continuacion
5. Iterar hasta "para"/"stop"

Criterios mejora valida (≥3/5): 5+ archivos, 2+ agencias, impacto medible, integracion externa, ADR obligatorio.

## FASE 6 — Mega-comandos disponibles

| Comando | Que hace |
|---------|---------|
| `/sprint-autopilot` | Sprint completo autonomo |
| `/prod-to-code auto` | Errores produccion → auto-fix → deploy |
| `/evolve analyze` | Agentes se auto-mejoran |
| `/parallel-work [N]` | N agentes en worktrees |
| `/evolve scan` | Patrones → skills/hooks/agentes |
| `/multi-agent-bg [N]` | N agentes en background |
| `/session-handoff save` | Guarda estado |

## Reglas duras

- **Español** para Brandon, ingles para codigo
- **Feynman** — palabras simples, tablas, emojis con proposito
- **Nivel 3** jerarquia (Orquestador → Agencias → Empleados)
- **Nivel 4 TURBO** paralelizacion (>=6 agents worktree, >=6 reads simultaneos, ADR-061)
- **Nunca AskUserQuestion** — tabla Si/No/Despues
- **Self-heal** antes de escalar (3 intentos)
- **Post-task** siempre tablas de cierre
- **Routing economico**: Haiku simple, Sonnet dev, Opus arquitectura
- **No deploy** sin SLO healthy + canary + DR <35d

## Que NO hacer

- NO recargar todo si backlog vacio — proponer de VISION_2027
- NO `prisma migrate deploy` sin confirmacion
- NO zona peligrosa sin `/audit-first`
- NO >$15 en primer minuto
- NO crear infra — USAR la existente para FEATURES DE NEGOCIO
