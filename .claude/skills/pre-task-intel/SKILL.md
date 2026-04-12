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
- **ADRs:** 015 (checkout confirmar step), 006 (strategy descuentos)
- **Archivos:** `components/CheckoutModal.tsx` (119KB, zona peligrosa), `components/checkout/**`, `lib/db/orders.db.ts` (state machine), `app/api/orders/route.ts`
- **Tests:** `__tests__/**/checkout*`, `__tests__/**/order*` | **Evals:** `/eval checkout`
- **Danger:** CheckoutModal.tsx, orders.db.ts — requiere `/checkout-squad`

### database
- **ADRs:** 017 (ola1 migrations), 018 (float-to-decimal), 020 (ola1 plan), 001 (multi-tenancy)
- **Archivos:** `prisma/schema.prisma` (131 modelos), `lib/db/*.db.ts`, `prisma/migrations/`
- **Tests:** `__tests__/**/db*`, `__tests__/**/migration*`
- **Danger:** schema.prisma — requiere DIRECT_URL + migration-planner. Ref: `reference_prisma_pgbouncer_workaround.md`

### auth
- **ADRs:** 002 (JWT sessions), 013 (chat public endpoint), 014 (middleware split)
- **Archivos:** `lib/auth/role-permissions.ts` (26 recursos x 6 roles), `proxy.ts` (398 lineas), `lib/middleware/**`, `app/api/auth/**`
- **Tests:** `__tests__/**/auth*`, `__tests__/**/role*`
- **Danger:** role-permissions.ts, proxy.ts — requiere security-squad

### seo
- **ADRs:** 041 (sprint2 programmatic SEO)
- **Archivos:** `app/(marketing)/**`, `app/sitemap.ts`, `components/seo/**`, `lib/seo/**`
- **Tests:** `__tests__/**/seo*`
- **Sprint:** Sprint 2 — Programmatic SEO es prioridad

### fiado
- **ADRs:** 021 (fiado digital ola2), 024 (loyalty transaction)
- **Archivos:** `lib/db/fiado*.db.ts`, `app/api/fiado/**` o `app/api/credits/**`, `components/fiado/**`
- **Tests:** `__tests__/**/fiado*`, `__tests__/**/credit*` | **Evals:** `/eval fiado`
- **Diferenciador:** #1 del negocio (VISION_2027.md)

### performance
- **ADRs:** 028 (performance budget CI gate), 029 (OTEL economics)
- **Archivos:** `next.config.ts`, `app/layout.tsx`, componentes >500 lineas, `lib/cache/**`
- **Tests:** `npm run test:load` (k6)
- **Targets:** LCP <2.5s, CLS <0.1, INP <200ms, Lighthouse >90

### integration
- **ADRs:** 003 (fire-and-forget BullMQ), 007 (domain events), 012 (chat polling vs realtime)
- **Archivos:** `lib/integrations/**`, `app/api/webhooks/**`, `lib/notifications/**`
- **Tests:** `__tests__/**/integration*`, `__tests__/**/webhook*`
- **Ref:** `reference_groq_platform_limits.md` (AI integrations)

### general
- **ADRs:** 016 (plan maestro 24 weeks) — siempre leer primero
- **Archivos:** `docs/ARCHITECTURE.md`, `docs/TECH-DEBT.md`
- **Git:** `git log --oneline -10`, `git branch --show-current`, `git status --short`
- **Sprint:** leer `session_sprint2_seo_kickoff.md` en memoria

## Formato de salida

Reportar para el dominio detectado: ADRs relevantes (titulo + 1 linea), archivos clave (path:lines + que hace), cambios recientes (ultimos 5 commits en area), tests existentes (N archivos en patron), danger zones (archivo + por que + agente recomendado), contexto de sprint (sprint actual + estado + prioridad).

## Integracion

| Sistema | Como se conecta |
|---|---|
| **agent-router** | Invoca pre-task-intel automaticamente antes de despachar |
| **orchestrator-config.json** | Campo `preTask` en cada route referencia dominios |
| **audit-first** | Si dominio es danger zone, sugiere /audit-first |
| **a2a-bus** | Publica Context Packet como broadcast para agentes del squad |

## Cache de sesion

- Context Packet se cachea en memoria durante la sesion
- Si mismo dominio se pide 2 veces, reusar cache (commits no cambian en 5 min)
- Invalidar cache si hay git commit nuevo en esa area
