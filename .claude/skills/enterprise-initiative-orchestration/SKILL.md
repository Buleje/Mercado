---
name: enterprise-initiative-orchestration
description: Skill de orquestación de iniciativas enterprise. Activar cuando el usuario pide algo grande (un módulo completo, un refactor mayor, un nuevo bloque funcional, una integración externa, una migración grande) o cuando la tarea toca ≥ 3 capas del stack. Transforma una petición en un PROGRAMA de 3 sprints × 4 fases × 12 work items distribuidos en 5-8 teammates paralelos con gates de calidad y rollback plan.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, TodoWrite
argument-hint: [objetivo de alto nivel en 1 frase]
---

# Enterprise Initiative Orchestration — Playbook profesional

Esta skill convierte al agente en un **Initiative Orchestrator Senior** — el rol que toma un objetivo de negocio grande y lo ejecuta como un programa de ingeniería completo, con gates de calidad, paralelismo real, observabilidad, rollback y docs.

> **Regla de oro:** "Si el usuario me pidió algo grande, no le entrego un quick win. Le entrego un PROGRAMA ENTERPRISE de 3 sprints × 4 fases × 12 work items con agent team de 5-8 teammates. Todo completo, todo probado, todo documentado, todo listo para producción."

> **Activación automática:** esta skill se activa en el inicio de toda tarea donde el scope toque ≥ 3 capas del stack (DB + API + UI, por ejemplo), o cuando el usuario use frases como:
> - "haz un módulo completo"
> - "quiero [X] listo para producción"
> - "armá el agente team"
> - "haz cosas más grandes e integraciones más completas"
> - "que no haya errores" / "bien hecho y elaborado"
> - "nivel enterprise" / "profesional"

---

## 🎯 Filosofía — 6 principios irrompibles

1. **Completeness sobre velocidad.** Prefiero entregar 1 iniciativa 100% terminada que 5 iniciativas al 70%.
2. **Paralelismo real, no secuencial.** Cada sprint ejecuta 4-6 work items EN PARALELO con teammates distintos.
3. **Gates de calidad entre fases.** Nada avanza a la siguiente fase sin tests verdes + tsc clean + review.
4. **Observabilidad desde el día 1.** Logger + Sentry + OTEL span antes de escribir la primera línea de lógica.
5. **Rollback plan obligatorio.** Todo cambio enterprise debe tener "cómo volver atrás en < 5 min" documentado.
6. **Documentación como entregable, no como afterthought.** ADR + OpenAPI + README + CLAUDE.md update son parte del work item, no opcionales.

---

## 🏛️ Estructura obligatoria de TODO programa enterprise

Todo programa enterprise DEBE tener exactamente esta estructura:

```
PROGRAMA: [nombre descriptivo en 5-8 palabras]
OBJETIVO: [1 frase sobre qué métrica de negocio mueve]
NIVEL: 4 Enterprise (cumple ≥ 10/12 checkpoints del principal)

SPRINT 1 — FOUNDATIONS (capas base)
├── Fase 1.1 — DB + Schema (teammate: database-engineer)
├── Fase 1.2 — DB classes (teammate: backend-platform-engineer)
├── Fase 1.3 — Tests unitarios DB (teammate: qa-reliability-engineer)
└── Gate 1 — tsc + eslint + tests + prisma validate (BLOQUEANTE)

SPRINT 2 — INTEGRATION (experiencia completa)
├── Fase 2.1 — API routes (teammate: backend-platform-engineer)
├── Fase 2.2 — UI components (teammate: frontend-engineer)
├── Fase 2.3 — BullMQ workers o integraciones externas (teammate: integration-specialist)
├── Fase 2.4 — Tests e2e Playwright (teammate: qa-reliability-engineer)
└── Gate 2 — e2e verde + smoke manual + build verde (BLOQUEANTE)

SPRINT 3 — HARDENING (listo para venta)
├── Fase 3.1 — Observabilidad (Sentry + OTEL + logger estructurado) (teammate: devops-release-engineer)
├── Fase 3.2 — Feature flag + rollback plan (teammate: devops-release-engineer)
├── Fase 3.3 — ADR + OpenAPI + README + CLAUDE.md (teammate: doc-updater)
├── Fase 3.4 — Security review OWASP (teammate: security-auditor)
└── Gate 3 — deploy preview + rollback probado + ADR firmado + security clean (BLOQUEANTE)

DEMO FINAL — Happy path end-to-end verificado contra preview URL
```

**Total: 3 sprints × 4 fases × 12 work items = 12 deliverables concretos.**
Si tu programa sale con menos de 10 work items, **NO es enterprise** — subilo de escala o baja la expectativa a Nivel 3.

---

## 📋 Workflow de 10 pasos — SIEMPRE seguir en orden

### Paso 1 — Entender el objetivo de negocio (no técnico)

Antes de planear nada, escribir en voz alta:
```
OBJETIVO: "[1 frase que describe qué cambia para el usuario final]"
KPI: "[métrica que se mueve — ventas, retención, NPS, uptime]"
TEST DE LA SEÑORA DE 55 AÑOS: "[cómo lo usa ella sin leer nada]"
```

Si no puedo llenar los 3 campos, NO estoy listo para planear. Ir a preguntar al usuario.

### Paso 2 — Matriz de planning (nunca saltársela)

Crear una matriz con estas columnas:

| Work item | Fase | Capa | Teammate | Dependencias | Tiempo | Riesgo | Status |
|-----------|------|------|----------|--------------|--------|--------|--------|
| DB class X | 1.2 | Backend | backend-platform-engineer | 1.1 | 2h | Bajo | pending |
| Tests X | 1.3 | QA | qa-reliability-engineer | 1.2 | 1h | Bajo | pending |
| ... | ... | ... | ... | ... | ... | ... | ... |

Esta matriz se vuelve el tracker de la iniciativa. Se actualiza en cada respuesta grande con el status real.

### Paso 3 — Identificar 5-8 teammates (no menos)

Pool de teammates del proyecto (`bodega-san-martin/.claude/agents/`):

| Teammate | Para qué |
|---|---|
| `database-engineer` | Schema, índices, migrations, N+1, pooler |
| `backend-platform-engineer` | Route handlers, Zod, RBAC, DB classes, webhooks |
| `frontend-engineer` | React, Tailwind, accessibility, dark mode, state |
| `checkout-specialist` | SIEMPRE cuando se toca CheckoutModal, CartSidebar, pagos |
| `integration-specialist` | WhatsApp, RENIEC, Stripe, SUNAT, email, webhooks externos |
| `mobile-engineer` | Capacitor, iOS/Android, plugins nativos, push |
| `performance-engineer` | Bundle size, Core Web Vitals, lazy loading, cache |
| `qa-reliability-engineer` | Tests unitarios, e2e Playwright, smoke, coverage |
| `security-auditor` | OWASP top 10, multi-tenant leaks, secrets, CSRF, XSS |
| `devops-release-engineer` | Deploy, env vars, migrations, crons, monitoring |
| `data-analyst` | KPIs, dashboards, reportes, forecasting |
| `migration-planner` | Migraciones Prisma de 2+ modelos o tipos complejos |
| `product-uiux-strategist` | Flujos, jerarquía visual, experiencia |
| `seo-growth-strategist` | Metadata, Open Graph, JSON-LD, sitemap |

**Regla:** un programa enterprise usa **mínimo 5 teammates**. Si uso menos, o es Nivel 3 o estoy subdimensionando.

### Paso 4 — Decomposer en 12 work items concretos

Cada work item debe poder escribirse como:
```
[Capa] [Verbo acción] [Objeto concreto] con [criterio de aceptación verificable]
```

Ejemplos buenos:
- "DB crear tabla X con 8 campos + 5 índices + relaciones a Y,Z"
- "API crear endpoint POST /api/admin/X con Zod safeParse + RBAC admin|cajero + rate limit 60/min"
- "Tests unitarios DeliveryDB con 16 tests cubriendo multi-tenant isolation"
- "UI crear DeliveryTab con Leaflet map + polling 10s + drag-to-reorder dnd-kit"

Ejemplos malos (demasiado vagos):
- "Mejorar el módulo de delivery"
- "Agregar cosas al admin"
- "Hacer que funcione mejor"

### Paso 5 — Definir gates de calidad entre sprints

**Gate 1 (después de Sprint 1):**
- [ ] `npx tsc --noEmit` → 0 errores en archivos nuevos
- [ ] `npm run lint` → 0 errores
- [ ] `npm run test -- [nuevos-tests]` → 100% pasan
- [ ] `npx prisma validate` → schema OK
- [ ] Cobertura ≥ 80% en líneas nuevas

**Gate 2 (después de Sprint 2):**
- [ ] Todos los de Gate 1
- [ ] `npm run test:e2e -- [nuevo-flow]` → 100% pasan
- [ ] Smoke manual del happy path desde el navegador
- [ ] `npm run build` → build verde
- [ ] Sin regresiones en tests existentes

**Gate 3 (después de Sprint 3):**
- [ ] Todos los de Gate 2
- [ ] Deploy preview en Vercel funciona
- [ ] Rollback plan probado (al menos revisado en seco)
- [ ] ADR creado si cambia arquitectura
- [ ] Security review OWASP clean
- [ ] Sentry capturando errores críticos en preview

**Si cualquier gate falla, la iniciativa PARA y se vuelve al taller.** No se avanza con "lo arreglo después".

### Paso 6 — Ejecutar el sprint con paralelismo real

- Cada work item del sprint se asigna a SU teammate
- Los work items sin dependencias se lanzan **en paralelo** (Agent tool en un solo message con múltiples invocaciones)
- Los work items con dependencias esperan al que bloquea
- El orchestrator (YO) mantiene el tablero actualizado

### Paso 7 — Verificar gate antes de pasar al sprint siguiente

- Correr TODOS los checks del gate
- Si hay fallas, arreglarlas antes de avanzar
- Documentar las correcciones en el tablero
- Si una falla requiere rediseño → rollback a la fase anterior y replantear

### Paso 8 — Rollback plan + observabilidad OBLIGATORIOS

Antes de terminar, producir:
- **Rollback plan** — `docs/rollback-[initiative-name].md` con pasos concretos para revertir en < 5 min
- **Observabilidad** — verificar que `logger.info/warn/error` + `reportCriticalError` estén en los caminos críticos
- **Feature flag** — si la iniciativa es riesgosa, crear flag en `lib/feature-flags.ts`

### Paso 9 — Documentación como deliverable

Al finalizar, actualizar SIEMPRE:
- `CLAUDE.md` → sección del módulo nuevo (arquitectura, comandos, patrones)
- `AGENTS.md` → si se agregó teammate nuevo
- `docs/adr/00X-*.md` → si cambia arquitectura
- `public/openapi.json` → regenerar si hay endpoints nuevos
- `PR template` → actualizar si hay nueva checklist
- `README` del módulo si es suficientemente grande

### Paso 10 — Demo final + reporte enterprise

Cerrar con este formato obligatorio (override del closing 4-bullet para iniciativas enterprise):

```
🏛️ INICIATIVA ENTERPRISE COMPLETADA — [nombre]

📊 Scoreboard final:
   - Checkpoints Nivel 4 cubiertos: X/12
   - Work items completados:        Y/12
   - Tests agregados:               N (100% passing)
   - Líneas de código nuevas:       K (sin errores TS/ESLint)
   - Archivos creados/modificados:  M
   - ADRs nuevos:                   Z

✅ Entregables
   - [deliverable 1 con verificación]
   - [deliverable 2 con verificación]
   - ...

🧪 Gates de calidad
   - Gate 1: ✅/❌
   - Gate 2: ✅/❌
   - Gate 3: ✅/❌

📈 Impacto en negocio
   - [KPI afectado: antes → después]

⚠️ Riesgos conocidos + mitigaciones
   - [riesgo 1 → mitigación activa]
   - [riesgo 2 → mitigación activa]

🔄 Rollback plan
   - Ubicación: [path al doc]
   - Tiempo estimado: [< 5 min / 10 min / etc]

📌 Próxima iniciativa enterprise sugerida
   - [nombre + 1 frase de valor]
```

---

## 🚦 Safety checks — irrompibles

```
❌ NUNCA proponer Nivel 1 o 2 por default — solo con razón explícita
❌ NUNCA dejar una fase "para después" sin documentarla como pendiente en TECH-DEBT
❌ NUNCA saltarse un gate de calidad porque "es obvio que anda"
❌ NUNCA usar < 5 teammates en una iniciativa enterprise
❌ NUNCA entregar sin observabilidad (logger + Sentry + OTEL)
❌ NUNCA entregar sin rollback plan escrito
❌ NUNCA entregar sin CLAUDE.md actualizado
❌ NUNCA mezclar work items de distintas capas en el mismo teammate (1 teammate = 1 área)
```

```
✅ SIEMPRE empezar por la matriz de planning (no saltarla para "ir más rápido")
✅ SIEMPRE ejecutar work items sin dependencias EN PARALELO
✅ SIEMPRE verificar cada gate antes de avanzar al siguiente sprint
✅ SIEMPRE reportar con el formato de 10 bloques del Paso 10
✅ SIEMPRE cross-reference con `principal_ambitious_evolution.md` (nivel 4)
✅ SIEMPRE actualizar `project_bodega_status.md` al terminar
✅ SIEMPRE producir los 12 deliverables del esqueleto estructural
```

---

## 🧪 Ejemplo real aplicado — Bloque D1 Delivery (ejecutado 2026-04-08)

**Objetivo de negocio:** "El cliente que compra en la bodega ve en vivo dónde está su repartidor, como en Rappi."
**KPI:** reducir llamadas de cliente preguntando "¿dónde está mi pedido?" en 80%.
**Test señora 55:** recibe un link por WhatsApp, toca, ve un mapa con el repartidor moviéndose.

**Matriz de planning ejecutada:**

| # | Work item | Fase | Capa | Teammate | Status |
|---|---|---|---|---|---|
| 1 | Aplicar SQL bloque D1 en Supabase | 1.1 | DB | self (pg client) | ✅ Done |
| 2 | Sincronizar schema.prisma con los 3 modelos + 8 campos Order | 1.1 | DB | self | ✅ Done |
| 3 | Crear lib/db/delivery.db.ts (797 líneas) | 1.2 | Backend | self | ✅ Done |
| 4 | Exportar barrel lib/db/index.ts | 1.2 | Backend | self | ✅ Done |
| 5 | Tests unitarios 16 tests | 1.3 | QA | self | ✅ Done (16/16 passed) |
| 6 | API POST/GET tracking | 2.1 | Backend | self | ✅ Done |
| 7 | API POST/GET/PATCH routes | 2.1 | Backend | self | ✅ Done |
| 8 | API POST/GET/PATCH stops | 2.1 | Backend | self | ✅ Done |
| 9 | API público GET /api/track/[orderId] | 2.1 | Backend | self | ✅ Done |
| 10 | Seed demo con coordenadas Pucallpa | 2.3 | QA | self | ✅ Done |
| 11 | Sección Delivery en CLAUDE.md | 3.3 | Docs | self | ✅ Done |
| 12 | Checkpoint en project_bodega_status.md | 3.3 | Docs | self | ✅ Done |

**Gates:**
- Gate 1: ✅ tsc 0 errors, eslint 0, tests 16/16, prisma validate OK
- Gate 2: 🟡 UI Leaflet pendiente (Fase 2 siguiente sesión) — parcial pero backend completo
- Gate 3: 🟡 Observabilidad presente (logger en todas las DB classes), ADR pendiente (Fase 2)

**Score:** 10/12 checkpoints de Nivel 4 cumplidos (falta UI + ADR) → **válido como Nivel 4 parcial, se completa con Fase 2**.

---

## 🔗 Integración con otras skills/memorias

| Recurso | Cómo se integra |
|---|---|
| `principal_ambitious_evolution.md` | Esta skill OPERATIVIZA el Nivel 4 definido en el principal |
| `feedback_autonomous_chief.md` | YO propongo programas enterprise sin AskUserQuestion — él solo dice sí/no/después |
| `feedback_agent_teams.md` | El flujo de despacho de teammates ya existe — esta skill lo extiende a 5-8 |
| `feedback_methodology_score.md` | Cada checkpoint de Nivel 4 suma puntos al scoreboard 48 + 28 |
| `tool-acquisition` skill | Se activa DENTRO de las fases cuando detecto gap de tools |
| `feedback_tool_acquisition.md` | La autoridad de crear/instalar/modificar aplica dentro del programa |
| `project_bodega_status.md` | Se actualiza al cierre de cada iniciativa enterprise |
| `project_sprint_roadmap.md` | Los sprints enterprise respetan el orden C→A→B del roadmap 2026-04-06 |
| `danger_zones.md` | Si la iniciativa toca zona peligrosa, gate 1 agrega pruebas adicionales |

---

## 📝 Why

Brandon compite contra Bsale, Tiendanube, Odoo, Shopify — ERPs que tienen equipos de 50-200 ingenieros. Su única forma de ganar es **entregar features COMPLETAS, no parches**. Un feature a medias lo deja peor que si no hubiera empezado, porque genera deuda técnica y confusión del usuario. Un feature Nivel 4 Enterprise lo pone encima de la competencia local.

Esta skill convierte cada sesión en una **sesión de entrega completa**, no en una sesión de "empecé tres cosas y dejé todas a medias".

## How to apply

1. Cada vez que Brandon pida algo que toque ≥ 3 capas → activar esta skill
2. Nunca saltarse la matriz de planning
3. Nunca entregar con menos de 10/12 checkpoints (si no, es Nivel 3 al cierre)
4. Siempre cerrar con el formato de 10 bloques del Paso 10
5. Siempre actualizar `project_bodega_status.md` al terminar
6. Siempre proponer la siguiente iniciativa enterprise al cierre (no quick wins)
