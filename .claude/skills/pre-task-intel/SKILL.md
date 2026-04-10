---
name: pre-task-intel
description: Auto-carga contexto relevante (ADRs, tests, commits, danger zones) antes de cualquier tarea. Detecta el dominio por keywords y entrega un Context Packet listo para que el agente arranque informado.
user-invocable: true
model: sonnet
argument-hint: "[checkout|database|auth|seo|fiado|performance|integration|general]"
---

# /pre-task-intel — Inteligencia Pre-Tarea

## Cuando usarlo
- AUTOMATICO: el agent-router lo invoca antes de despachar trabajo
- MANUAL: `/pre-task-intel [dominio]`
- Cuando necesitas contexto completo de un area antes de tocar codigo

## Deteccion de dominio

| Keywords en la tarea | Dominio detectado |
|---|---|
| checkout, pago, yape, carrito, cupon, reserva | `checkout` |
| database, migracion, prisma, query, indice, schema | `database` |
| auth, seguridad, roles, permisos, login, session | `auth` |
| SEO, Google, metadata, sitemap, JSON-LD, ranking | `seo` |
| fiado, credito, deuda, cobro, cuaderno | `fiado` |
| lento, performance, bundle, lighthouse, cache, CWV | `performance` |
| WhatsApp, Stripe, SUNAT, webhook, API externa | `integration` |
| (cualquier otro) | `general` |

## Context Packet por dominio

### checkout
```
ADRs: 015 (checkout confirmar step), 006 (strategy descuentos)
Archivos clave:
  - components/CheckoutModal.tsx (119KB — zona peligrosa)
  - components/checkout/** (sub-componentes)
  - lib/db/orders.db.ts (state machine)
  - app/api/orders/route.ts
Tests: __tests__/**/checkout*, __tests__/**/order*
Git: git log --oneline -5 -- components/checkout/ components/CheckoutModal.tsx
Danger: CheckoutModal.tsx, orders.db.ts — requiere /checkout-squad
Sprint: verificar estado en ROADMAP-24-WEEKS.md
Evals: /eval checkout (10 tests)
```

### database
```
ADRs: 017 (ola1 migrations), 018 (float-to-decimal), 020 (ola1 plan), 001 (multi-tenancy)
Archivos clave:
  - prisma/schema.prisma (131 modelos)
  - lib/db/*.db.ts (DB classes)
  - prisma/migrations/ (historial)
Tests: __tests__/**/db*, __tests__/**/migration*
Git: git log --oneline -5 -- prisma/ lib/db/
Danger: schema.prisma — requiere DIRECT_URL + migration-planner
Referencia: memory/reference_prisma_pgbouncer_workaround.md
```

### auth
```
ADRs: 002 (JWT sessions), 013 (chat public endpoint), 014 (middleware split)
Archivos clave:
  - lib/auth/role-permissions.ts (26 recursos x 6 roles)
  - proxy.ts (398 lineas — auth + CSP + tenant)
  - lib/middleware/** (rate limit, tenant resolution)
  - app/api/auth/** (login, register, session)
Tests: __tests__/**/auth*, __tests__/**/role*
Git: git log --oneline -5 -- lib/auth/ proxy.ts lib/middleware/
Danger: role-permissions.ts, proxy.ts — requiere security-squad
```

### seo
```
ADRs: 041 (sprint2 programmatic SEO)
Archivos clave:
  - app/(marketing)/** (paginas publicas)
  - app/sitemap.ts
  - components/seo/** (si existe)
  - lib/seo/** (si existe)
Tests: __tests__/**/seo*
Git: git log --oneline -5 -- app/sitemap* app/(marketing)/
Sprint: Sprint 2 — Programmatic SEO es prioridad
```

### fiado
```
ADRs: 021 (fiado digital ola2), 024 (loyalty transaction)
Archivos clave:
  - lib/db/fiado*.db.ts
  - app/api/fiado/** o app/api/credits/**
  - components/fiado/** o components/credits/**
  - prisma/schema.prisma (modelos Fiado*, Credit*)
Tests: __tests__/**/fiado*, __tests__/**/credit*
Git: git log --oneline -5 -- lib/db/fiado* app/api/fiado* app/api/credits*
Evals: /eval fiado (5 tests)
Diferenciador: #1 del negocio (VISION_2027.md)
```

### performance
```
ADRs: 028 (performance budget CI gate), 029 (OTEL economics)
Archivos clave:
  - next.config.ts (bundle config)
  - app/layout.tsx (fonts, scripts)
  - components/** archivos >500 lineas
  - lib/cache/** (si existe)
Tests: npm run test:load (k6)
Git: git log --oneline -5 -- next.config* app/layout*
Herramientas: Lighthouse, Vercel Speed Insights, bundle-analyzer
Target: LCP <2.5s, CLS <0.1, INP <200ms, Lighthouse >90
```

### integration
```
ADRs: 003 (fire-and-forget BullMQ), 007 (domain events), 012 (chat polling vs realtime)
Archivos clave:
  - lib/integrations/** (WhatsApp, Stripe, SUNAT adapters)
  - app/api/webhooks/** (webhook handlers)
  - lib/notifications/** (email, push, WhatsApp)
Tests: __tests__/**/integration*, __tests__/**/webhook*
Git: git log --oneline -5 -- lib/integrations/ app/api/webhooks/
Referencia: memory/reference_groq_platform_limits.md (para AI integrations)
```

### general
```
ADRs: 016 (plan maestro 24 weeks) — siempre leer primero
Archivos: docs/ARCHITECTURE.md (resumen), docs/TECH-DEBT.md (deuda actual)
Git: git log --oneline -10 (ultimos 10 commits globales)
Sprint: leer session_sprint2_seo_kickoff.md en memoria
Branch: git branch --show-current
Status: git status --short
```

## Formato de salida

```markdown
## Pre-Task Intel — [dominio]

### ADRs relevantes
- ADR-XXX: [titulo] — [1 linea resumen]

### Archivos clave (leer antes de tocar)
- [path:lines] — [que hace]

### Cambios recientes (ultimos 5 commits en esta area)
- [hash] [mensaje]

### Tests existentes
- [N] archivos de test en [patron]

### Danger Zones
- [archivo] — [por que es peligroso] — agente recomendado: [nombre]

### Contexto de Sprint
- Sprint actual: [N]
- Estado de esta area: [del roadmap]
- Prioridad: [alta/media/baja]
```

## Integracion

| Sistema | Como se conecta |
|---|---|
| **agent-router** | Invoca pre-task-intel automaticamente antes de despachar |
| **orchestrator-config.json** | Campo `preTask` en cada route referencia dominios |
| **audit-first** | Si el dominio es danger zone, pre-task-intel sugiere /audit-first |
| **a2a-bus** | Publica el Context Packet como mensaje broadcast para que todos los agentes del squad lo lean |

## Cache de sesion

- El Context Packet se cachea en memoria durante la sesion
- Si el mismo dominio se pide 2 veces, reusar cache (los commits no cambian en 5 min)
- Invalidar cache si hay un git commit nuevo en esa area
