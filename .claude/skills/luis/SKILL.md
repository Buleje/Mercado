---
name: luis
description: MODO MAXIMO — Arranque completo con todo el ecosistema. Carga 25 MCPs, 28 agentes, 47 skills, 11 hooks, auto-learning, sprint-autopilot. Diagnostica, propone y EJECUTA la accion mas ambiciosa sin pedir permiso.
user-invocable: true
model: opus
context: fork
---

# /luis — MODO MAXIMO (Level 5 Real + Sprint 2)

Cuando Brandon escribe **"luis"**, el sistema se despierta al 100% y arranca trabajo real.

## FASE 0.PRE — Confirmar bootstrap

**Atajo:** si existe `session_handoff_next_luis.md` con fecha reciente → SALTAR verificacion, solo leer handoff como primer read.

Si no hay handoff reciente, confirmar en 1 tabla: pixel-agents (3456), timbre ding-dong, pre-push pentest, pre-commit gitleaks, MCPs (25), Agent Teams, auto-learning, loop continuo — todos activos via SessionStart/hooks.

## FASE 0 — Cargar TODO (paralelo, 10 reads en 1 mensaje)

```
1. session_handoff_next_luis.md (PRIMERO — evita re-diagnostico)
2. CLAUDE.md (16 reglas)
3. ROADMAP-24-WEEKS.md (Sprint activo)
4. VISION_2027.md (norte: 100 bodegas)
5. feedback_continuous_improvement_loop.md (LOOP + Agent Teams)
6. MEMORY.md (indice memorias)
7. session-state.json (handoff interno)
8. patterns.json (patrones aprendidos)
9. evolution-log.json (evoluciones agentes)
10. Bash: git log --oneline -10
```

## FASE 1 — Diagnostico rapido (paralelo)

4 checks: `git status --short | wc -l`, `tsc --noEmit | tail -3`, `npm run lint | tail -3`, `git branch --show-current`

## FASE 2 — Tabla de estado (SIEMPRE mostrar)

Mostrar tabla con: Branch, TypeScript OK/FAIL, Lint OK/FAIL, Archivos dirty, Session anterior, Patrones aprendidos, Evoluciones.

Resumen ecosistema: 28 agentes, 47 skills, 11 hooks, 25 MCPs, 5 crons, 3 learning stores.

## FASE 3 — Detectar la accion mas ambiciosa

Prioridad:
1. **ROJO: Build/tsc roto** → `/self-heal` inmediato
2. **ROJO: Tests fallando** → `/self-heal test`
3. **NARANJA: Handoff pendiente** → continuar sesion anterior
4. **NARANJA: Patrones 3+ sin artifacts** → `/compound-learning-v2 generate`
5. **AMARILLO: Sprint items pendientes** → mayor impacto del ROADMAP
6. **VERDE: Todo OK** → feature de VISION_2027

## FASE 4 — Declarar y EJECUTAR con Agent Team Nivel 3

```
🏛️ Orquestador Principal: yo (Claude Opus)
Objetivo: [1 frase, mejora GRANDE — no refactor cosmetico]

Agencias: ARQ (solution-architect), DB (database-engineer),
BACKEND (backend + integration), FRONTEND (frontend + UX),
QA (qa + pentester), GOBERNANZA (reviewer + docs)

DAG: ARQ → (DB || BACKEND) → FRONTEND → (QA || GOBERNANZA)

MCPs: exa+firecrawl+context7 (research), github (historico),
ecc_memory (persistencia), playwright (e2e), vercel (deploy)
```

**Reglas:** oleadas de 3 max paralelo. NO esperar "si" de Brandon. SIEMPRE la opcion mas grande.

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
| `/agent-router [tarea]` | Auto-selecciona agente |
| `/compound-learning-v2 scan` | Patrones → skills |
| `/session-handoff save` | Guarda estado |

## Reglas duras

- **Español** para Brandon, ingles para codigo
- **Feynman** — palabras simples, tablas, emojis con proposito
- **Nivel 3** jerarquia (Orquestador → Agencias → Empleados)
- **Nivel 4** paralelizacion (>=3 agents, >=4 reads simultaneos)
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
