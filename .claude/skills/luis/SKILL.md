---
name: luis
description: Palabra clave de Brandon para despertar Claude Code con contexto completo. Cargar TODA la memoria, estado del squad, backlog, MCPs, tools, y arrancar la acción más ambiciosa del backlog SIN pedir permiso. Activar cuando el usuario escriba "luis" como primer mensaje de la sesión.
---

# /luis — Full Context Wake-Up + Autonomous Start (Level 5 Real)

## Qué hace este skill

Cuando Brandon escribe **"luis"** al iniciar sesión, este skill:

1. **Carga contexto completo** — CLAUDE.md, MEMORY.md, git log, estado de build/tests
2. **Verifica salud operacional** — SLOs, último DR drill, compliance status
3. **Diagnostica qué cambió** — desde la última sesión
4. **Arranca la acción más ambiciosa** — sin esperar confirmación

## Pasos de ejecución (SEGUIR EN ORDEN)

### Paso 1 — Cargar contexto (paralelo, 7 reads)

Ejecutar EN PARALELO:

```
1. Read CLAUDE.md (16 reglas críticas)
2. Read bodega-san-martin/docs/STATUS_LEVEL5_REAL.md (inventario completo)
3. Read bodega-san-martin/docs/VISION_2027.md (norte estratégico)
4. Bash: cd bodega-san-martin && git log --oneline -10
5. Bash: cd bodega-san-martin && git status --short | head -20
6. Bash: cd bodega-san-martin && npx tsc --noEmit 2>&1 | tail -5
7. Bash: cd bodega-san-martin && npm run test 2>&1 | tail -10
```

### Paso 2 — Verificar salud operacional (Level 5 checks)

```
8.  /slo-status all (verificar 4 SLOs: checkout, api, sunat, whatsapp)
9.  Verificar último DR drill: ls -t reports/dr-drills/*.md | head -1
10. Verificar compliance: ls app/api/compliance/*/route.ts | wc -l (debe ser 5)
11. Verificar runbooks: ls runbooks/*.md | wc -l (debe ser 8)
12. Verificar feature flags: grep -c "FLAG_DEFAULTS" lib/flags/index.ts
```

### Paso 3 — Reportar estado (tabla concisa)

```markdown
## 🏁 Estado al arrancar — [fecha]

| Check | Estado |
|-------|--------|
| Último commit | 🟢/🔴 <hash> <subject> |
| TypeScript | 🟢/🔴 tsc exit code |
| Tests | 🟢/🔴 N passing / N failing |
| SLOs | 🟢/🟡/🔴 budget burn % |
| Último DR drill | 🟢 (<35d) / 🔴 (>35d) |
| Compliance | 🟢 5 endpoints / 🔴 missing |
| Runbooks | 🟢 8 / 🔴 missing |
| Feature flags | 🟢 12 / 🔴 missing |

🔥 **Acción más ambiciosa:** [descripción]
```

### Paso 4 — Prioridades de arranque

1. 🔴 **Build/tsc roto** → `/self-heal build` (regla #13)
2. 🔴 **Tests rotos** → `/self-heal test`
3. 🔴 **SLO >90% burned** → investigar y mitigar (regla #16)
4. 🔴 **DR drill >35 días** → `/dr-drill latest`
5. 🟠 **HOTFIX pendientes** en backlog
6. 🟡 **Features** del roadmap VISION_2027
7. 🟢 **Mejoras** — optimización, refactoring, docs

### Paso 5 — Ejecutar (max ambition, zero input)

Per `feedback_max_ambition_default.md`:

1. Identificar tarea de **máximo impacto** del backlog/VISION_2027
2. Declarar: "🏛️ Orquestador Principal: voy a hacer X"
3. Declarar agencias + empleados (nivel 3 obligatorio)
4. **ARRANCAR INMEDIATAMENTE** — agents en background, no esperar
5. Usar routing económico: Haiku para tareas simples, Sonnet para dev, Opus para arquitectura

## Ecosistema disponible (Level 5 Real)

### 24 agentes
director, initiative, solution-architect, backend, frontend, database, qa, devops, checkout-specialist, security-auditor, security-pentester, performance, integration, data-analyst, product-uiux, seo-growth, mobile, migration-planner, bug-hunter, code-reviewer, visual-qa, finops-guard, sre-observability, growth-specialist

### 35 skills
luis, commit, deploy, new-feature, review, test-all, fix, checkpoint, bodega-context-loader, checkout-squad, audit-first, session-recap, self-improvement, enterprise-initiative-orchestration, tool-acquisition, self-heal, adr, token-optimizer, showcase, production-sync, optimize-context, infrastructure-map, showcase-auto, cost-kill, db-restore, eval, four-table-closing, slo-status, dr-drill, compliance-status, gdpr-export, audit-search, runbook, flag, chaos

### 4 MCPs
Playwright, Context7, Sequential-Thinking, Bodega San Martín (5 tools negocio)

### 16 reglas CLAUDE.md
1-12 (técnicas), 13 (autonomía), 14 (pentest), 15 (rentabilidad), 16 (SLO+canary+DR)

### Infraestructura operacional
- 4 SLOs con error budgets + hook bloqueante
- 8 runbooks ejecutables (P0-P2)
- Canary deploys 3 fases + auto-rollback
- 12 feature flags PostHog + env fallback
- Compliance Ley 29733 (5 endpoints + audit log + hash chain)
- DR drill mensual automático
- Chaos engineering nocturno (7 experimentos)
- 41 ADRs documentados
- 6 CI/CD workflows

## Reglas duras durante arranque

- **Nunca AskUserQuestion** — proponer con tabla
- **Español para Brandon**, inglés para código
- **Formato Feynman** — simple, tablas, emojis
- **Nivel 4 paralelización** — ≥3 agents simultáneos
- **Nivel 3 jerarquía** — ARQ → Backend/DB → Frontend → QA
- **Routing económico** — no Opus para lint fixes
- **Phase 2+3 OS activo** — self-heal, pentest, SLOs, canary

## Qué NO hacer

- NO recargar todo si backlog vacío — preguntar a Brandon
- NO `prisma migrate deploy` sin confirmación (irreversible)
- NO tocar zona peligrosa sin `/audit-first`
- NO deploy sin SLO healthy (regla #16)
- NO gastar >$10 en primer minuto

## Output esperado

```
🟢 Último commit: abc1234 feat(slo): add 4 SLOs with error budgets
🟢 tsc: exit 0
🟢 tests: 134 evals + 1400 unit passing
🟢 SLOs: 4/4 healthy (checkout 12%, api 5%, sunat 0%, whatsapp 8%)
🟢 DR drill: hace 3 días
🟢 Compliance: 5/5 endpoints activos
📋 Backlog VISION_2027: onboarding wizard, fiado Phase 2, SUNAT real
🔥 Acción: arrancar fiado Phase 2 (diferenciador #1)

🏛️ Orquestador: ejecutando fiado Phase 2
🏢 Agencias: BACKEND + DATABASE + FRONTEND + QA
📜 DAG: DB schema → backend API → frontend UI → evals
[Spawning 3 agents...]
```
