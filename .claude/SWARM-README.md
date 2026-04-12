# FLUJO_PRO SWARM — Guia rapida

SWARM es un sistema multi-agente con 3 worktrees paralelos que ejecuta items del roadmap en olas. Cada ola tiene contrato, locks, reviews y smoke tests automaticos. Escala a 100+ olas sin perder contexto.

---

## Los 8 agentes core

| Agente | Rol | Lee | Escribe |
|--------|-----|-----|---------|
| **orchestrator** | Jefe de jefes, coordina todo | todo | COORDINATION, LOCKS, BIDDING |
| **architect** | Genera contratos TS antes de cada ola | roadmap, codigo | CONTRACTS/ola-N.md |
| **frente-back** | Backend: API, DB, Prisma, lib/ | CONTRACTS, LOCKS | lib/db, app/api, prisma |
| **frente-front** | Frontend: componentes, pages, UI | CONTRACTS, LOCKS | components/, app/(store) |
| **frente-qa** | Tests: Vitest, e2e, coverage, TSC | CONTRACTS, REVIEWS | __tests__/, e2e/ |
| **reviewer** | Peer review cruzado post-implementacion | codigo de todos | REVIEWS/ola-N-review.md |
| **scribe** | Documenta: lessons, history, reportes | REPORTS, REVIEWS | LESSONS, HISTORY, REPORTS |
| **optimizer** | Auto-mejora: analiza tendencias, sugiere | HISTORY, LESSONS | sugerencias (read-only) |

## Los 10 pasos de una ola

1. optimizer analiza olas pasadas → sugerencias
2. architect genera CONTRACTS/ola-N.md
3. orchestrator publica items en BIDDING.md
4. orchestrator asigna + actualiza LOCKS.md
5. back + front arrancan en PARALELO (contra contrato)
6. qa arranca cuando back y front entregan
7. reviewer corre peer review cruzado
8. Si reviews OK → tag pre-ola → merge → smoke test
9. scribe actualiza LESSONS + HISTORY + reporte
10. orchestrator entrega tabla sugerencias a Brandon

## Comando para lanzar una ola

```bash
# Desde el proyecto principal (bodega-san-martin/)
# El orchestrator (Claude) ejecuta automaticamente al decir:
#   "lanza ola 2" o "luis" + indicar items

# Manualmente, el flujo es:
# 1. Architect genera contrato
# 2. Orchestrator asigna en LOCKS.md
# 3. Agentes trabajan en sus worktrees
# 4. Al terminar:
bash scripts/pre-merge-tag.sh ola2
git merge wt/roadmap-bugs
git merge wt/roadmap-features
git merge wt/roadmap-tier-a
bash scripts/smoke-test.sh
```

## Como hacer rollback

```bash
# Ver tags disponibles
git tag --list 'pre-*'

# Rollback a un tag especifico
git reset --hard pre-ola2-20260410-1445

# Verificar que todo funciona
bash scripts/smoke-test.sh
```

## Archivos clave

| Archivo | Para que sirve |
|---------|---------------|
| `.claude/COORDINATION.md` | Plan de la ola activa + historial |
| `.claude/LOCKS.md` | Que archivos toca cada frente (evita conflictos) |
| `.claude/CONTRACTS/ola-N.md` | Tipos TS + APIs + Zod (contrato de la ola) |
| `.claude/REVIEWS/` | Peer reviews del reviewer |
| `.claude/REPORTS/` | Reportes finales por ola |
| `.claude/LESSONS.md` | Aprendizajes acumulados |
| `.claude/HISTORY.md` | Metricas de cada ola |
| `.claude/BIDDING.md` | Sistema de asignacion de tareas |
| `scripts/smoke-test.sh` | Validacion post-merge (TSC + tests + build) |
| `scripts/pre-merge-tag.sh` | Tag de rollback antes de merge |
