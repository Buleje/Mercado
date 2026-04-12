# Agent Hub & Spoke Redesign — Design Spec

**Date:** 2026-04-12
**Author:** Claude (Director) + Brandon
**Status:** Approved
**ADR:** Required BEFORE Phase 0 — create via `/adr Hub & Spoke Agent Redesign` (Rule 12)

---

## Problem Statement

El sistema actual tiene 38 agentes (35 individuales + 3 squads), 9 squads estaticos, 28 rutas de routing en un JSON, y una escalation chain con agentes fantasma. Agent Teams Level 3 esta habilitado pero mal configurado (`teammateMode` en env var en vez de `~/.claude.json`). El resultado: confusion sobre que agente usar, coordinacion pobre entre agentes, tokens desperdiciados en routing overhead, y squads rotos que referencian agentes eliminados.

## Solution

Redisenar la arquitectura multi-agente en un modelo **Hub & Spoke** con 3 Hubs permanentes (BUILD, QUALITY, OPS), un Director unico como router dinamico, y comunicacion nativa via Agent Teams (TeamCreate + SendMessage + Task list compartida).

### Goals

1. Reducir 38 agentes a 15 (-61%)
2. Eliminar config JSON estatico (28 rutas → decision tree dinamico)
3. Usar Agent Teams Level 3 nativamente (TeamCreate, SendMessage, shared tasks)
4. Pipeline de sprint streaming (features entran a siguiente fase sin esperar batch)
5. Escalation chain con agentes reales (eliminar fantasmas)
6. Reducir tokens por tarea simple en ~45%

### Non-Goals

- Cambiar la logica de negocio de ningun modulo
- Modificar hooks existentes (danger-zone, bash-guard, post-lint)
- Cambiar skills de dominio (checkout-flow, prisma-schema, etc.)
- Migrar agentes de `.github/agents/` (formato Copilot, sistema separado)

---

## Architecture

### Overview

```
                    +---------------------------+
                    |     Brandon / "luis"       |
                    +-------------+-------------+
                                  |
                    +-------------v-------------+
                    |       DIRECTOR            |
                    |   (Opus - Router unico)   |
                    |                           |
                    |   Decision Tree:          |
                    |   1 archivo → Subagente   |
                    |   2-4 arch → Teammates    |
                    |   5+ arch → Hub completo  |
                    |   Sprint → Pipeline       |
                    +--+----------+----------+--+
                       |          |          |
          +------------v+   +----v------+  +v-----------+
          |  HUB BUILD  |   | HUB       |  | HUB OPS   |
          |             |   | QUALITY   |  |            |
          |  architect  |   | reviewer  |  | deployer   |
          |  backend    |   | tester    |  | observer   |
          |  frontend   |   | security  |  | optimizer  |
          |  database   |   | data-qa   |  |            |
          |  integrator |   |           |  |            |
          +------+------+   +-----+-----+  +------+----+
                 |                |                |
                 +--- SendMessage mesh (intra-Hub) +
                 |                                 |
                 +-- Director bridges inter-Hub ---+
```

### Agents (15 total)

#### Orchestration (2)

| Agent | Model | Absorbs | Role |
|---|---|---|---|
| `director` | Opus | director-orchestrator + initiative-orchestrator | Unico punto de entrada. Router dinamico, coordinador, sprint lead. Decision tree para seleccion de agente/hub. Fallback chain para escalation. |
| `healer` | Sonnet | healer + skill self-heal | Auto-reparacion de lint/tsc/test failures. Max 3 intentos antes de escalar. |

#### Hub BUILD (5)

| Agent | Model | Absorbs | Role |
|---|---|---|---|
| `architect` | Opus | solution-architect + migration-planner + marketplace-specialist | Disena contratos, schemas, ADRs, migration plans. Siempre primero en el Hub. No implementa. |
| `backend` | Sonnet | backend-platform-engineer + checkout-specialist + ai-ml-engineer | APIs, endpoints, logica server, auth, validacion Zod. Carga skills `checkout-flow` y `ai-features` on-demand. |
| `frontend` | Sonnet | frontend-engineer + product-uiux-strategist + mobile-engineer | Componentes React, estado, UI, UX, responsive, Capacitor. Carga skill `capacitor-mobile` on-demand. |
| `database` | Sonnet | database-engineer (sin fusion) | Schema Prisma, migrations, indices, DB classes. Zona de peligro — requiere DIRECT_URL. |
| `integrator` | Sonnet | integration-specialist + seo-growth-strategist + growth-specialist | APIs externas (WhatsApp, Stripe, SUNAT, RENIEC), SEO, metadata, JSON-LD. |

**DAG interno Hub BUILD:**
```
architect (root)
  |
  +---> database (blockedBy: architect)
  +---> integrator [SEO/metadata mode] (blockedBy: architect, parallel con database)
  |
  +---> backend (blockedBy: database)
  +---> integrator [API mode: SUNAT/Stripe/WhatsApp] (blockedBy: backend)
  |
  +---> frontend (blockedBy: backend)
```
Note: `integrator` has two modes. SEO/metadata work can start after architect. API-dependent work (SUNAT, Stripe, WhatsApp) must wait for backend endpoints. Director specifies which mode at spawn time.

#### Hub QUALITY (4)

| Agent | Model | Absorbs | Role |
|---|---|---|---|
| `reviewer` | Sonnet | code-reviewer + refactoring-expert + bug-hunter | 3 modos: review (pre-merge), diagnose (bug), refactor (deuda tecnica). Director indica modo al spawnar. |
| `tester` | Sonnet | qa-reliability-engineer + test-writer + visual-qa-specialist | Tests unitarios, e2e, visuales, carga. Vitest + Playwright + k6. |
| `security` | Opus | security-auditor + security-pentester | OWASP audit + pentesting ofensivo. Veto power: hallazgo critico = bloquea merge. disallowedTools: [Edit, Write] para audit mode. |
| `data-qa` | Sonnet | data-analyst + finops-guard (lectura) | Valida metricas de negocio + costos. Solo lectura. disallowedTools: [Edit, Write]. |

**DAG interno Hub QUALITY:**
```
reviewer + tester (paralelo)
  |
  +---> security + data-qa (paralelo, blockedBy: reviewer + tester)
```
Note: `data-qa` validates business metrics and costs independently of security. Both run in parallel after reviewer+tester complete.

#### Hub OPS (3)

| Agent | Model | Absorbs | Role |
|---|---|---|---|
| `deployer` | Sonnet | devops-release-engineer | Deploy Vercel, CI/CD, env vars, crons. Canary obligatorio: 5% -> 25% -> 100%. |
| `observer` | Opus | sre-observability + incident-commander | Monitoreo + respuesta a incidentes. Health check pre/post deploy. Auto-rollback si degradacion. |
| `optimizer` | Sonnet | performance-engineer + finops-guard (accion) | CWV, bundle size, cache, costos. Verifica metricas post-deploy. |

**DAG interno Hub OPS:**
```
observer (pre-deploy health check)
  |
  +---> deployer (blockedBy: observer confirms healthy)
  |
  +---> optimizer (post-deploy verification)
```

### Director Decision Tree

```
STEP 1 — Scope assessment:
  1 file, 1 area    → DIRECT SUBAGENT (Sonnet/Haiku)
  2-4 files, 1-2    → PARTIAL TEAMMATES (only needed ones from relevant Hub)
  5+ files, 2+ areas → FULL HUB BUILD + auto QUALITY
  Sprint/initiative  → PIPELINE: BUILD -> QUALITY -> OPS

STEP 2 — Danger zone check:
  checkout/**        → backend MUST load skill checkout-flow, NEVER parallel
  schema.prisma      → architect designs first, database executes with DIRECT_URL
  role-permissions   → security MUST review BEFORE merge
  proxy.ts           → security MUST review BEFORE merge

STEP 3 — Model selection:
  Read/search only   → Haiku
  Implementation     → Sonnet
  Design/security    → Opus
  Sprint director    → Opus (self) + Sonnet (teammates)
```

### Fallback Chain (replaces phantom escalation)

```
Attempt 1: Direct subagent (Sonnet)
  | Failed/stuck?
Attempt 2: Same domain in Opus
  | Failed?
Attempt 3: Full Hub (TeamCreate with teammates)
  | Failed?
Attempt 4: Healer (auto-repair lint/tsc/test, max 3 tries)
  | Failed 3x?
Final: Escalate to Brandon with full context
```

### Communication Protocol

#### Intra-Hub: SendMessage (native)

Teammates within the same Hub communicate directly via SendMessage with structured contracts:

```
SendMessage fields:
  deliverable: what was completed
  artifacts: files created/modified (paths)
  types: exported TypeScript types the receiver needs
  interface: contract of what the receiver should implement
  blockers: anything preventing progress (or "none")
```

#### Inter-Hub: Director as bridge

Hubs do NOT communicate directly. The Director synthesizes BUILD output and passes relevant context when spawning QUALITY. Same for QUALITY -> OPS.

#### Legacy a2a-bus: ELIMINATED

The `.claude/a2a-state.json` file-based bus is replaced entirely by native SendMessage.

### Gates Between Hubs

| Gate | Condition | On failure |
|---|---|---|
| BUILD -> QUALITY | `npm run lint && npx tsc --noEmit` pass | healer auto-fix, retry gate |
| QUALITY -> OPS | `npm run test && npm run build` pass | SendMessage back to BUILD with specific errors |
| OPS -> Done | CWV + cost check post-deploy | Auto-rollback if degradation detected |

### Sprint Autopilot v2

Pipeline streaming architecture — features enter next phase individually, not as batch:

```
Phase 1: DESIGN (architect, sequential per feature)
  -> 1 contract + ADR per feature

Phase 2: BUILD (parallel, max 3 features simultaneously)
  -> Each feature: database -> backend -> frontend (internal DAG)
  -> Gate per feature: lint + tsc pass

Phase 3: QUALITY (parallel, features enter as they complete BUILD)
  -> Each feature: reviewer + tester parallel -> security -> data-qa
  -> Gate per feature: tests pass

Phase 4: OPS (sequential, 1 deploy per batch)
  -> observer pre-check -> deployer canary -> optimizer post-check
```

### Skills Consolidation

#### Eliminated (absorbed into Director logic)

| Skill | Replaced by |
|---|---|
| `agent-router` | Decision tree in director.agent.md |
| `auto-dispatch` | Director reads issue directly |
| `auto-escalation` | Fallback chain in Director |
| `a2a-bus` | SendMessage native |
| `agent-metrics` | TaskCompleted hook + auto logging |

#### Simplified (wrappers for Director)

| Skill | New function |
|---|---|
| `sprint-autopilot` | Tells Director: "execute these N features as BUILD->QUALITY->OPS pipeline" |
| `agent-team` | Simplified wrapper for manual hub spawning |

#### Unchanged (domain skills)

All domain-specific skills remain: `checkout-flow`, `prisma-schema`, `security-auth`, `state-management`, `capacitor-mobile`, `ai-features`, `seo-metadata`, `external-integrations`, etc.

### Skills On-Demand (replace dedicated agents)

| Context detected | Skill loaded | Previously was agent |
|---|---|---|
| Files in `components/checkout/` | `checkout-flow` | checkout-specialist |
| Files with `capacitor` or `android/` `ios/` | `capacitor-mobile` | mobile-engineer |
| Files with Groq/embeddings/AI | `ai-features` | ai-ml-engineer |
| Schema with 2+ new models | `prisma-schema` + `database-migrations` | migration-planner |
| Files SUNAT/WhatsApp/Stripe | `external-integrations` | integration-specialist |
| Metadata/JSON-LD/sitemap | `seo-metadata` | seo-growth-strategist |

### Agent Teams Native Configuration

#### Fix: teammateMode

```jsonc
// ~/.claude.json (correct location)
{
  "teammateMode": "in-process"
}
```

Remove `CLAUDE_CODE_TEAMMATE_MODE` from `.claude/settings.json` env vars.

#### Coordination Mechanism (Director-driven, not hook-based)

Claude Code does not expose `TeammateIdle`/`TaskCompleted`/`TaskCreated` as hook events. Coordination is handled by the Director's own turn logic:

| Mechanism | How it works |
|---|---|
| **Dependency unblocking** | Director polls task list after each SendMessage response. When a blocker task is marked `completed`, Director sends the next agent its assignment via SendMessage. |
| **Teammate cleanup** | Director checks task list periodically. If all tasks for a teammate are `completed` and no new tasks are pending, Director stops assigning work (teammate goes idle naturally). |
| **Duplicate prevention** | Director owns task creation exclusively. Teammates do NOT create tasks — they only update status on assigned tasks. |

#### Agent .md Format (simplified)

```yaml
---
name: backend
description: >
  APIs, endpoints, server logic, auth, Zod validation.
  Absorbs: backend-platform-engineer, checkout-specialist, ai-ml-engineer.
  Loads skills checkout-flow/ai-features on-demand by context.
model: sonnet
tools: Read, Edit, Write, Grep, Glob, Bash, LSP
maxTurns: 40
memory: project
permissionMode: acceptEdits
effort: high
color: blue
---
```

No `skills` in frontmatter (not applied to teammates). Skills load from project settings.

---

## File Structure (final state)

```
.claude/
  agents/
    director.agent.md
    healer.agent.md
    architect.agent.md
    backend.agent.md
    frontend.agent.md
    database.agent.md
    integrator.agent.md
    reviewer.agent.md
    tester.agent.md
    security.agent.md
    data-qa.agent.md
    deployer.agent.md
    observer.agent.md
    optimizer.agent.md
    _archive/              # 28 retired agents (backup)
  skills/
    sprint-autopilot.md    # Updated: Hub pipeline wrapper
    agent-team.md          # Simplified: Director wrapper
    ... (domain skills unchanged)
  settings.json            # Without CLAUDE_CODE_TEAMMATE_MODE in env

~/.claude.json             # teammateMode: "in-process"
```

### Complete Agent Disposition Table (all 38 current agents)

| # | Current agent file | Disposition | Absorbed by / Fate |
|---|---|---|---|
| 1 | `ai-ml-engineer.md` | ARCHIVE | → `backend` (loads `ai-features` skill on-demand) |
| 2 | `architect.md` | REWRITE | → new `architect.agent.md` (absorbs more roles) |
| 3 | `backend-platform-engineer.md` | ARCHIVE | → `backend` |
| 4 | `bug-hunter.md` | ARCHIVE | → `reviewer` (diagnose mode) |
| 5 | `code-reviewer.md` | ARCHIVE | → `reviewer` (review mode) |
| 6 | `compressor.md` | DELETE | One-off task, no agent needed |
| 7 | `data-analyst.md` | ARCHIVE | → `data-qa` |
| 8 | `database-engineer.md` | ARCHIVE | → `database` (rewrite) |
| 9 | `devops-release-engineer.md` | ARCHIVE | → `deployer` |
| 10 | `director-orchestrator.md` | ARCHIVE | → `director` |
| 11 | `docs-generator.md` | DELETE | One-off task, subagent ad-hoc |
| 12 | `finops-guard.md` | ARCHIVE | → `data-qa` (read) + `optimizer` (action) |
| 13 | `frontend-engineer.md` | ARCHIVE | → `frontend` |
| 14 | `full-stack-squad.md` | DELETE | Replaced by dynamic Hub BUILD composition |
| 15 | `growth-specialist.md` | ARCHIVE | → `integrator` |
| 16 | `healer.md` | REWRITE | → updated `healer.agent.md` |
| 17 | `incident-commander.md` | ARCHIVE | → `observer` |
| 18 | `initiative-orchestrator.md` | ARCHIVE | → `director` (sprint mode) |
| 19 | `integration-specialist.md` | ARCHIVE | → `integrator` |
| 20 | `marketplace-specialist.md` | ARCHIVE | → `architect` (design) + `backend` (impl) |
| 21 | `optimizer.md` | ARCHIVE | → new `optimizer.agent.md` (rewrite) |
| 22 | `orchestrator.md` | ARCHIVE | → `director` |
| 23 | `performance-engineer.md` | ARCHIVE | → `optimizer` |
| 24 | `performance-squad.md` | DELETE | Replaced by dynamic Hub OPS composition |
| 25 | `product-uiux-strategist.md` | ARCHIVE | → `frontend` |
| 26 | `qa-reliability-engineer.md` | ARCHIVE | → `tester` |
| 27 | `refactoring-expert.md` | ARCHIVE | → `reviewer` (refactor mode) |
| 28 | `reviewer.md` | REWRITE | → new `reviewer.agent.md` (absorbs more roles) |
| 29 | `scribe.md` | DELETE | One-off task, subagent ad-hoc |
| 30 | `security-auditor.md` | ARCHIVE | → `security` |
| 31 | `security-pentester.md` | ARCHIVE | → `security` |
| 32 | `security-squad.md` | DELETE | Replaced by Hub QUALITY with security agent |
| 33 | `seo-growth-strategist.md` | ARCHIVE | → `integrator` |
| 34 | `solution-architect.md` | ARCHIVE | → `architect` |
| 35 | `sre-observability.md` | ARCHIVE | → `observer` |
| 36 | `tenant-lifecycle.md` | ARCHIVE | → `database` + `backend` (tenant ops) |
| 37 | `test-writer.md` | ARCHIVE | → `tester` |
| 38 | `visual-qa-specialist.md` | ARCHIVE | → `tester` |

**Totals:** 28 ARCHIVED, 3 REWRITTEN (architect, healer, reviewer), 6 DELETED (compressor, docs-generator, scribe, full-stack-squad, performance-squad, security-squad) = 37 dispositions + 1 rewrite that is also archived (optimizer) = 38 total.

`_archive/` will contain 28 files (all archived agents as backup).

### Files to DELETE

| File | Reason |
|---|---|
| `orchestrator-config.json` | Replaced by Director decision tree |
| `.claude/a2a-state.json` | Replaced by SendMessage native |
| Skills: `agent-router.md` | Absorbed into Director |
| Skills: `auto-dispatch.md` | Absorbed into Director |
| Skills: `auto-escalation.md` | Absorbed into Director |
| Skills: `a2a-bus.md` | Replaced by SendMessage |
| Skills: `agent-metrics.md` | Replaced by TaskCompleted hook |

---

## Migration Plan

### Pre-requisite: Create ADR

Before any implementation, run `/adr Hub & Spoke Agent Redesign` to create the ADR documenting this architecture change (CLAUDE.md Rule 12).

### Phase 0: Critical fixes (no agent changes)

1. Create ADR via `/adr Hub & Spoke Agent Redesign`
2. Set `teammateMode` in `~/.claude.json`
3. Remove `CLAUDE_CODE_TEAMMATE_MODE` from settings.json env
4. Remove phantom agents from orchestrator-config.json (worktree-parallel squad, sonnet/opus-specialist)
5. Validate: TeamCreate works correctly
6. **Security gate:** Run old `security-pentester` on Phase 0 PR diff before merge (Rule 14)

### Phase 1: New Director (replaces 3 orchestrators)

1. Create `director.agent.md` with decision tree + fallback chain
2. Absorb initiative-orchestrator logic as sprint mode
3. Update `agent-team` and `sprint-autopilot` skills as wrappers
4. Move `director-orchestrator.md`, `initiative-orchestrator.md`, `orchestrator.md` to `_archive/`
5. Validate: simple task routing, cross-layer TeamCreate, sprint pipeline
6. **Security gate:** Run old `security-pentester` on Phase 1 PR diff before merge (Rule 14)

### Phase 2: Hub BUILD (5 new agents replace 14 old)

1. Rewrite `architect.agent.md` (absorbs solution-architect, marketplace-specialist)
2. Create `backend.agent.md` (absorbs backend-platform-engineer, ai-ml-engineer)
3. Create `frontend.agent.md` (absorbs frontend-engineer, product-uiux-strategist)
4. Create `database.agent.md` (absorbs database-engineer, with on-demand skills)
5. Create `integrator.agent.md` (absorbs integration-specialist, seo-growth-strategist, growth-specialist)
6. Delete squad files: `full-stack-squad.md`, `performance-squad.md`
7. Delete utility agents: `compressor.md`, `docs-generator.md`, `scribe.md`
8. Archive `tenant-lifecycle.md` (absorbed into database + backend)
9. Test each agent with tasks from their absorbed domains
10. Move 14 old agents to `_archive/`
11. Validate: Hub BUILD TeamCreate with SendMessage contracts
12. **Security gate:** Run old `security-pentester` on Phase 2 PR diff before merge (Rule 14)

### Phase 3: Hub QUALITY (4 new agents replace 9 old)

1. Rewrite `reviewer.agent.md` (absorbs code-reviewer, refactoring-expert, bug-hunter — 3 modes)
2. Create `tester.agent.md` (absorbs qa-reliability-engineer, test-writer, visual-qa-specialist)
3. Create `security.agent.md` (absorbs security-auditor, security-pentester — Opus, veto power)
4. Create `data-qa.agent.md` (absorbs data-analyst, finops-guard read-part — read-only)
5. Delete squad file: `security-squad.md`
6. Test each with representative tasks
7. Move 9 old agents to `_archive/`
8. Validate: Hub QUALITY with gate from BUILD
9. **Security gate:** CRITICAL — Phase 3 rewrites the security agent itself. Run the OLD `security-pentester` (from `_archive/`) on Phase 3 PR diff before merge. Chicken-and-egg: the reviewer is the agent being replaced. (Rule 14)

### Phase 4: Hub OPS + Cleanup

1. Create `deployer.agent.md` (absorbs devops-release-engineer)
2. Create `observer.agent.md` (absorbs sre-observability, incident-commander)
3. Rewrite `optimizer.agent.md` (absorbs performance-engineer, finops-guard action-part)
4. Update `healer.agent.md` (auto-repair consolidado)
5. Move 5 old agents to `_archive/` (devops-release-engineer, sre-observability, incident-commander, performance-engineer, finops-guard)
6. Update Sprint Autopilot v2 with streaming pipeline
7. Delete `orchestrator-config.json`
8. Delete `a2a-state.json` if exists
9. Delete eliminated skills (agent-router, auto-dispatch, auto-escalation, a2a-bus, agent-metrics)
10. Update CLAUDE.md with new architecture
11. Update AGENTS.md (38 -> 15)
12. Verify `_archive/` has all 28 retired agents
13. Validate: full sprint pipeline BUILD -> QUALITY -> OPS
14. **Security gate:** Run new `security` agent on Phase 4 PR diff before merge (Rule 14)

### Rollback

| If fails... | Action |
|---|---|
| New Director misroutes | Restore director-orchestrator from _archive/ |
| A Hub doesn't coordinate | Restore individual agents from _archive/ |
| Sprint Autopilot v2 fails | Git revert skill to previous version |
| Everything fails | Git checkout pre-migration branch |

Each phase runs in an isolated branch with separate PR.

---

## Success Metrics

| Metric | Before (estimated) | Target |
|---|---|---|
| Total agents | 38 | 15 |
| Tokens per simple task | ~15K | ~8K (-45%) |
| Tokens per cross-layer feature | ~80K | ~50K (-37%) |
| Routing decision time | ~5-8s | ~2-3s |
| Features reaching QUALITY without lint errors | ~60% | ~95% |
| Orchestration skills to maintain | 12 | 3 |
| Routing config files | 2 | 1 (AGENTS.md only) |
| Static squad configs | 9 | 0 (dynamic Hub composition) |

---

## Open Questions

1. Should `.github/agents/` be synced to 15 agents now or in a separate effort?
2. Should `agent-report` skill be updated to track Hub-level metrics instead of individual agents?
3. Should the `cost-kill` skill be updated to kill Hub teammates instead of individual agents?

---

## References

- [Claude Code Agent Teams docs](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Sub-agents docs](https://code.claude.com/docs/en/sub-agents)
- Current orchestrator-config.json (to be archived)
- Memory: feedback_agent_orchestration.md (Protocol v3)
- Memory: feedback_autonomous_operations.md (Autonomous Chief v3)
- Memory: principal_ambitious_evolution.md (Ambition Level 5)
