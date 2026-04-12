# AUDIT-PRE-SWARM.md — Auditoría del sistema Waves antes de migrar a SWARM

**Fecha:** 2026-04-10
**Auditor:** Orchestrator Principal
**Objetivo:** Evaluar estado actual, confirmar problemas, listar archivos a tocar

---

## 1. Estado actual — Lo que funciona

### Infraestructura base
| Componente | Estado | Nota |
|-----------|--------|------|
| 3 worktrees activos | OK | wt-1 (back), wt-2 (front), wt-3 (qa) |
| 31 agentes en .claude/agents/ | OK | 28 legacy + orchestrator + 3 frentes |
| COORDINATION.md | OK | Pizarra central con Ola 1 done y Ola 2 planificada |
| LOCKS.md | OK | Locks declarados para Ola 2, reglas claras |
| REPORTS/ | OK | 1 reporte (Ola 1) + README con formato estandar |
| orchestrator-config.json | OK | Squad worktree-parallel registrado |
| 11 hooks Claude | OK | Pre-deploy, post-deploy, danger-zone, etc. |
| Husky pre-commit + commit-msg | OK | lint-staged + commitlint |

### Ola 1 resultados
| Metrica | Valor |
|---------|-------|
| Items completados | 8/8 (100%) |
| TSC errores | 0 |
| Tests | 53/53 verdes |
| Conflictos de lock | 0 |
| Rollbacks necesarios | 0 |

### Agentes de frente
| Agente | Archivo | model | maxTurns | tools |
|--------|---------|-------|----------|-------|
| orchestrator | orchestrator.md | opus | 60 | Read,Grep,Glob,Bash,Agent(...) |
| frente-back | frente-back.md | sonnet | 45 | Read,Edit,Write,Grep,Glob,Bash |
| frente-front | frente-front.md | sonnet | 45 | Read,Edit,Write,Grep,Glob,Bash |
| frente-qa | frente-qa.md | sonnet | 45 | Read,Edit,Write,Grep,Glob,Bash |

---

## 2. Problemas confirmados

### a) Front arranca en paralelo con back pero deberia esperar contratos
**CONFIRMADO.** En COORDINATION.md las dependencias estan documentadas:
```
#9 back (schema + API) ──→ #9 front (UI) ──→ #9 qa (tests)
```
Pero NO hay mecanismo que FUERCE la espera. El orchestrator puede lanzar front
antes de que back termine el contrato. En Ola 1 no hubo problema porque los
agentes trabajaron en archivos distintos, pero con items que comparten API
(como #9 cupones) front podria consumir un endpoint que aun no existe.

**Fix requerido:** Fase de contrato explicita ANTES de paralelo. Architect genera
tipos TS + rutas API como contrato. Back y front trabajan contra ese contrato.

### b) No hay hook pre-commit que valide LOCKS.md automaticamente
**CONFIRMADO.** Los hooks existentes son:
- `pre-bash-guard.mjs` — bloquea comandos peligrosos
- `danger-zone.mjs` — alerta al tocar archivos criticos
- `post-commit-review.mjs` — review post-commit

Ninguno valida que un frente solo toque archivos declarados en LOCKS.md.
Un agente podria editar un archivo fuera de su lock sin que nadie lo detecte.

**Fix requerido:** Hook que lea LOCKS.md, detecte el frente actual por branch name,
y rechace staged files fuera del lock.

### c) No hay tags git antes de cada merge (sin rollback)
**CONFIRMADO.** `git tag --list` retorna 0 tags. No hay snapshots de seguridad
antes de merges. Si un merge de worktree rompe algo, no hay punto de rollback
rapido. Hay que hacer `git reflog` manual.

**Fix requerido:** Script que genere tag automatico pre-merge con timestamp.

### d) No hay smoke test post-merge
**CONFIRMADO.** El flujo actual es:
1. Agentes trabajan en worktrees
2. Orchestrator verifica TSC
3. Merge manual

No hay validacion automatica post-merge de que la app arranca, los tests
pasan y el build no rompe.

**Fix requerido:** Script post-merge que corra build + test smoke + health check.

---

## 3. Archivos a tocar para migrar a SWARM

### Crear (nuevos)
| Archivo | Proposito |
|---------|-----------|
| `.claude/hooks/pre-commit-lock-check.sh` | Validar locks antes de commit |
| `scripts/pre-merge-tag.sh` | Tag automatico pre-merge |
| `scripts/smoke-test.sh` | Build + test + health post-merge |
| `.claude/agents/architect.md` | Contract-first design |
| `.claude/agents/reviewer.md` | Peer review cruzado |
| `.claude/agents/scribe.md` | Documentacion automatica |
| `.claude/agents/optimizer.md` | Auto-mejora del sistema |
| `.claude/CONTRACTS/README.md` | Formato de contratos |
| `.claude/REVIEWS/README.md` | Formato de peer reviews |
| `.claude/BIDDING.md` | Sistema de asignacion dinamica |
| `.claude/LESSONS.md` | Aprendizajes acumulados |
| `.claude/HISTORY.md` | Dashboard de olas con metricas |
| `.claude/REPORTS/swarm-migration-resumen.md` | Reporte final de migracion |

### Modificar (existentes)
| Archivo | Cambio |
|---------|--------|
| `.claude/agents/orchestrator.md` | Agregar architect, reviewer, scribe, optimizer al tools |
| `.claude/agents/frente-back.md` | Agregar referencia a CONTRACTS/ |
| `.claude/agents/frente-front.md` | Agregar referencia a CONTRACTS/ |
| `.claude/agents/frente-qa.md` | Agregar referencia a REVIEWS/ |
| `.claude/COORDINATION.md` | Nuevo flujo SWARM de 10 pasos |
| `.claude/agents/orchestrator-config.json` | Agregar squad swarm |

### No tocar
| Archivo | Razon |
|---------|-------|
| Todo en `app/`, `lib/`, `components/` | Codigo de produccion del ERP |
| `prisma/schema.prisma` | No es sistema FLUJO_PRO |
| `CLAUDE.md` | Solo si se agrega regla nueva del SWARM |
