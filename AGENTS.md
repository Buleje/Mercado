# Virtual Software Agency — Bodega San Martin

## Mission
Build premium software with the quality standards of a senior multi-disciplinary engineering agency.

## Architecture: Hub & Spoke v2 (ADR-057)

14 agents organized in 3 Hubs + 1 Director + 1 Healer. Native Agent Teams coordination via TeamCreate + SendMessage.

```
                DIRECTOR (Opus)
               /       |       \
        HUB BUILD   HUB QUALITY   HUB OPS
        (5 agents)  (4 agents)    (3 agents)
                        +
                    HEALER (Sonnet)
```

## Orchestration model (actualizado 2026-07-04)

**Via primaria: Workflows verificados.** Auditorias, migraciones, reviews y todo
fan-out con verificacion se despachan via Workflow (`.claude/workflows/`, p.ej.
`audit-verificado`) — verifier en contexto fresco / refutador adversarial por
hallazgo. El `director` es un **router thin** que clasifica la tarea por tier
Fast-Path (ADR-058) y elige la via mas barata que garantice verificacion.

**Hub & Spoke / TeamCreate: secundario.** Reservado para builds interactivos
genuinamente multi-agente con coordinacion en vivo — caso raro. Casi todo trabajo
multi-fase se expresa mejor como Workflow por fases: `BUILD→QUALITY→OPS` sigue
siendo el *template* de fases, no un Hub de agentes vivos por default.

> **Drift 2026-07-04:** telemetria de 5 semanas = **38 corridas de Workflow-subagents
> vs 0 despachos de director/TeamCreate**. Los Workflows reemplazaron al Hub&Spoke en
> la practica; el director se adelgazo (405→~140 lineas) a router de tiers. El diagrama
> de arriba describe el *roster* de agentes disponibles, no el flujo por default.

## Decision Tree (por tier Fast-Path ADR-058)

| Tier | Scope | Accion |
|------|-------|--------|
| HOTFIX | 1 file, <20 lineas | `Agent()` directo al subagente de dominio |
| FEATURE | 2-5 files, 1 area | `Agent()` directo (1-2 subagentes) |
| AUDIT/MIGRATE/REVIEW | "audita/migra/revisa X" | **Workflow `audit-verificado`** / fan-out verificado (primaria) |
| INITIATIVE | 5+ files, 2+ areas | **Workflow por fases** (template BUILD→QUALITY→OPS) |
| DANGER | zona de peligro | subagente + `security` antes del merge |

## Team (14 Agents)

### Orchestration

| Agent | Model | Role |
|-------|-------|------|
| `director` | Opus | Router thin. Clasifica por tier Fast-Path (ADR-058) y despacha: `Agent()` directo (HOTFIX/FEATURE) · Workflow verificado (audit/migrate/review) · Workflow por fases (INITIATIVE). TeamCreate solo para builds interactivos multi-agente (raro) |
| `healer` | Sonnet | Auto-repair lint/tsc/test failures. Max 3 attempts before escalating |

### Hub BUILD (5 agents)

| Agent | Model | Role | Absorbs |
|-------|-------|------|---------|
| `architect` | Opus | Contract-first designer. Schemas, ADRs, migration plans. Always first. Read-only | solution-architect, migration-planner, marketplace-specialist |
| `backend` | Sonnet | APIs, endpoints, auth, validation, server logic. Loads checkout-flow/ai-features on-demand | backend-platform-engineer, checkout-specialist, ai-ml-engineer |
| `frontend` | Sonnet | React components, UI, UX, responsive, mobile. Loads capacitor-mobile on-demand | frontend-engineer, product-uiux-strategist, mobile-engineer |
| `database` | Sonnet | Prisma schema, migrations, indices, DB classes. Danger zone: schema.prisma | database-engineer |
| `integrator` | Sonnet | External APIs (WhatsApp, Stripe, SUNAT), SEO, metadata. Two modes: SEO + API | integration-specialist, seo-growth-strategist, growth-specialist |

**DAG:** architect → [database + integrator-SEO] → backend → [integrator-API] → frontend

### Hub QUALITY (4 agents)

| Agent | Model | Role | Absorbs |
|-------|-------|------|---------|
| `reviewer` | Sonnet | 3 modes: review (pre-merge), diagnose (bugs), refactor (debt) | code-reviewer, refactoring-expert, bug-hunter |
| `tester` | Sonnet | Unit (Vitest), E2E (Playwright), visual, load (k6). Scoped Playwright MCP | qa-reliability-engineer, test-writer, visual-qa-specialist |
| `security` | Opus | OWASP audit + pentest. Veto power on critical findings. Read-only | security-auditor, security-pentester |
| `data-qa` | Sonnet | Business metrics + cost analysis. Read-only | data-analyst, finops-guard (read) |

**DAG:** [reviewer + tester] → [security + data-qa]

### Hub OPS (3 agents)

| Agent | Model | Role | Absorbs |
|-------|-------|------|---------|
| `deployer` | Sonnet | Vercel deploy, CI/CD, env vars, crons. Canary mandatory | devops-release-engineer |
| `observer` | Opus | Monitoring + incident response. Scoped Sentry MCP. Auto-rollback | sre-observability, incident-commander |
| `optimizer` | Sonnet | CWV, bundle, cache, costs. Post-deploy verification | performance-engineer, finops-guard (action) |

**DAG:** observer (pre-check) → deployer (canary) → optimizer (post-check)

## Gates Between Hubs

| Gate | Condition | On failure |
|------|-----------|-----------|
| BUILD → QUALITY | `npm run lint && npx tsc --noEmit` | healer auto-fix (3 attempts) |
| QUALITY → OPS | `npm run test && npm run build` | SendMessage back to BUILD |
| OPS → Done | CWV + cost check post-deploy | Auto-rollback |

## Success Metrics

| Agent | Metric | Target |
|-------|--------|--------|
| `architect` | Contracts delivered without rework | > 90% |
| `backend` | Endpoints with 100% Zod validation | 100% |
| `frontend` | Lighthouse Performance Score | > 90 |
| `database` | API p95 response time | < 200ms |
| `tester` | Test coverage critical paths | > 80% |
| `security` | Critical vulnerabilities in prod | 0 |
| `deployer` | Deploy time (push → live) | < 5 min |
| `observer` | MTTR for SEV1 incidents | < 30 min |

## Protocols

### SendMessage Contract
```
deliverable: [what was completed]
artifacts: [files created/modified]
types: [TS types the receiver needs]
interface: [what the receiver should implement]
blockers: [impediments or "none"]
```

### Handoff Between Hubs
Director synthesizes Hub output → passes minimal context to next Hub.

### Fallback Chain
Subagent (Sonnet) → Same domain (Opus) → Full Hub → Healer (3x) → Brandon

## Files

- Agents: `.claude/agents/*.agent.md`
- Archive: `.claude/agents/_archive/` (28 retired)
- Metrics: `.claude/hub-metrics/`
- Benchmark: `.claude/hub-metrics/routing-benchmark.md`
- Gate scripts: `.claude/hooks/hub-gate.mjs`
- ADR: `docs/adr/057-hub-spoke-agent-redesign.md`
