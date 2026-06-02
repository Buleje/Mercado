---
name: enterprise-initiative-orchestration
description: Skill de orquestación de iniciativas enterprise. Activar cuando el usuario pide algo grande (un módulo completo, un refactor mayor, un nuevo bloque funcional, una integración externa, una migración grande) o cuando la tarea toca ≥ 3 capas del stack. Transforma una petición en un PROGRAMA de 3 sprints × 4 fases × 12 work items distribuidos en 5-8 teammates paralelos con gates de calidad y rollback plan.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, TodoWrite
argument-hint: [objetivo de alto nivel en 1 frase]
model: opus
---

# Enterprise Initiative Orchestration

Convierte al agente en un **Initiative Orchestrator Senior** que ejecuta objetivos grandes como programas de ingeniería completos.

**Activación:** tarea toca ≥ 3 capas del stack, o usuario pide módulo completo / nivel enterprise / producción-ready.

---

## 🎯 6 principios irrompibles

1. **Completeness sobre velocidad** — 1 iniciativa 100% > 5 al 70%
2. **Paralelismo real** — 4-6 work items EN PARALELO con teammates distintos por sprint
3. **Gates entre fases** — nada avanza sin tests verdes + tsc clean + review
4. **Observabilidad día 1** — Logger + Sentry + OTEL antes de lógica
5. **Rollback obligatorio** — "cómo revertir en < 5 min" documentado
6. **Docs como entregable** — ADR + OpenAPI + README + CLAUDE.md son parte del work item

---

## 🏛️ Estructura de programa enterprise

```
PROGRAMA: [nombre 5-8 palabras]
OBJETIVO: [1 frase — qué métrica de negocio mueve]
NIVEL: 4 Enterprise (≥ 10/12 checkpoints)

SPRINT 1 — FOUNDATIONS
├── 1.1 DB + Schema (database)
├── 1.2 DB classes (backend)
├── 1.3 Tests unitarios DB (tester)
└── Gate 1 — tsc + eslint + tests + prisma validate (BLOQUEANTE)

SPRINT 2 — INTEGRATION
├── 2.1 API routes (backend)
├── 2.2 UI components (frontend)
├── 2.3 Workers/integraciones (integrator)
├── 2.4 Tests e2e (tester)
└── Gate 2 — e2e + smoke + build verde (BLOQUEANTE)

SPRINT 3 — HARDENING
├── 3.1 Observabilidad (deployer)
├── 3.2 Feature flag + rollback (deployer)
├── 3.3 ADR + docs (doc-updater)
├── 3.4 Security OWASP (security)
└── Gate 3 — deploy preview + rollback probado + ADR + security (BLOQUEANTE)

DEMO FINAL — Happy path e2e contra preview URL
```

**Total: 12 work items.** Si < 10 → NO es enterprise.

---

## 📋 Workflow de 10 pasos

### Paso 1 — Objetivo de negocio
```
OBJETIVO: "[qué cambia para el usuario final]"
KPI: "[métrica que se mueve]"
TEST SEÑORA 55 AÑOS: "[cómo lo usa sin leer nada]"
```
Si no llenas los 3 → no estás listo para planear.

### Paso 2 — Matriz de planning

| Work item | Fase | Capa | Teammate | Dependencias | Tiempo | Riesgo | Status |
|-----------|------|------|----------|--------------|--------|--------|--------|

Esta matriz es el tracker. Se actualiza en cada respuesta.

### Paso 3 — Identificar 5-8 teammates

| Teammate | Para qué |
|---|---|
| `database` | Schema, índices, migrations, pooler |
| `backend` | Routes, Zod, RBAC, DB classes, webhooks |
| `frontend` | React, Tailwind, accessibility, state |
| `backend` | CheckoutModal, CartSidebar, pagos |
| `integrator` | WhatsApp, RENIEC, Stripe, SUNAT, email |
| `frontend` | Capacitor, iOS/Android, push |
| `optimizer` | Bundle, CWV, lazy loading, cache |
| `tester` | Tests unitarios, e2e, smoke, coverage |
| `security` | OWASP, multi-tenant leaks, secrets |
| `deployer` | Deploy, env vars, crons, monitoring |
| `data-qa` | KPIs, dashboards, reportes |
| `migration-planner` | Migraciones Prisma complejas |
| `frontend` | Flujos, UX |
| `integrator` | Metadata, JSON-LD, sitemap |

**Mínimo 5 teammates** o no es enterprise.

### Paso 4 — 12 work items concretos
Formato: `[Capa] [Verbo] [Objeto] con [criterio verificable]`

### Paso 5 — Gates de calidad

**Gate 1:** tsc 0 errors + lint 0 + tests pass + prisma validate + coverage ≥ 80%
**Gate 2:** Gate 1 + e2e verde + smoke manual + build verde + sin regresiones
**Gate 3:** Gate 2 + deploy preview + rollback probado + ADR + security OWASP + Sentry activo

**Si gate falla → PARA y arregla.** No "lo arreglo después".

### Paso 6 — Ejecutar con paralelismo real
- Cada work item a su teammate
- Sin dependencias → en paralelo (Agent tool, múltiples invocaciones)
- Con dependencias → espera al bloqueante

### Paso 7 — Verificar gate antes del siguiente sprint
Correr checks → arreglar fallas → documentar → si requiere rediseño, rollback a fase anterior.

### Paso 8 — Rollback + observabilidad OBLIGATORIOS
- **Rollback plan** en `docs/rollback-[nombre].md` (revertir < 5 min)
- **Observabilidad** — `logger.info/warn/error` + `reportCriticalError` en paths críticos
- **Feature flag** en `lib/feature-flags.ts` si es riesgoso

### Paso 9 — Documentación como deliverable
Actualizar: CLAUDE.md, AGENTS.md, `docs/adr/`, `public/openapi.json`, PR template.

### Paso 10 — Demo final + reporte
Cerrar con scoreboard (checkpoints, work items, tests, líneas, archivos, ADRs), entregables, gates, impacto negocio, riesgos, rollback plan, y siguiente iniciativa sugerida.

---

## 🚦 Safety checks

```
❌ NUNCA Nivel 1/2 por default
❌ NUNCA dejar fase "para después" sin TECH-DEBT
❌ NUNCA saltarse gate porque "es obvio"
❌ NUNCA < 5 teammates en enterprise
❌ NUNCA sin observabilidad, rollback plan, o CLAUDE.md actualizado
❌ NUNCA mezclar capas en el mismo teammate
```

```
✅ SIEMPRE empezar por matriz de planning
✅ SIEMPRE paralelo para work items sin dependencias
✅ SIEMPRE verificar gate antes de siguiente sprint
✅ SIEMPRE reportar con formato Paso 10
✅ SIEMPRE cross-ref `principal_ambitious_evolution.md`
✅ SIEMPRE actualizar `project_bodega_status.md`
✅ SIEMPRE 12 deliverables
```

---

## 🔗 Integraciones

| Recurso | Cómo se integra |
|---|---|
| `principal_ambitious_evolution.md` | Operativiza Nivel 4 |
| `feedback_autonomous_chief.md` | Proponer sin AskUserQuestion |
| `feedback_agent_teams.md` | Extiende despacho a 5-8 teammates |
| `feedback_methodology_score.md` | Checkpoints suman al scoreboard |
| `tool-acquisition` skill | Se activa dentro de fases cuando hay gap de tools |
| `project_bodega_status.md` | Se actualiza al cierre |
| `project_sprint_roadmap.md` | Respeta orden C→A→B |
| `danger_zones.md` | Zona peligrosa → pruebas adicionales en gate 1 |
