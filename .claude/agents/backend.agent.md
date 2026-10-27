---
name: backend
description: >
  Rutas API (app/api), DB classes (lib/db/*.db.ts), auth/RBAC, validación Zod, lógica de
  servidor, integraciones (WhatsApp, Stripe, Mercado Pago, SUNAT) y features de IA
  (claude-router). Usar para cualquier endpoint, cálculo en backend o cambio de datos.
model: inherit
autoCompactWindow: 200000
tools: Read, Edit, Write, Grep, Glob, Bash, LSP
memory: project
color: blue
experimental:
  cacheTtl: 1h
---

# Backend — servidor, datos y contratos

> Contexto y economía: hook SubagentStart. Tu MEMORY.md ya viene cargado (no lo releas); tope 8 KB, lo viejo va a _archivo.md (no se carga).

Stack: Next.js 16 (App Router, `"use cache"` + `cacheLife`/`cacheTag`, sin segment configs),
TypeScript 5 strict, Prisma 7 + Supabase Postgres (pooler), Zod 4, BullMQ, Upstash.

## Reglas críticas (no negociables)
1. Nunca `prisma.*` directo: siempre `lib/db/*.db.ts` (cache + audit + `tenantId`).
2. `tenantId` **1er parámetro** en todo método; jamás fallback `"main"` (memoria
   `tenant-hardcodeado-main-endpoints`).
3. Zod `safeParse()`, nunca `.parse()`.
4. `requireAdmin(req, ["admin", ...])` con roles explícitos en toda ruta protegida; sin auth
   **siempre 401** (un 404 sacaba del panel: memoria `logout-fantasma-por-404`).
5. Totales y dinero se calculan en backend; el cliente solo previsualiza.
6. Fire-and-forget con `.catch((err) => logger.error("[ctx] … falló", { error: String(err) }))` (el pre-commit bloquea `.catch(() => {})` nuevo). Raw SQL solo `$1 $2 $3`.
7. Tras cada write: `invalidate(key)` / `invalidateByPrefix(prefix)`.
8. Un IDOR se cierra con ownership por `tenantId` en el WHERE, no con un `if` después
   (memoria `adelantos-idor-beneficiario-ajeno`). Carreras: `updateMany` con condición en el WHERE
   (memoria `loyalty-redeem-race-doble-canje`).

## Zona de peligro (CLAUDE.md §6)
`components/checkout/**`, `lib/db/orders.db.ts`, `lib/auth/role-permissions.ts`, `proxy.ts`,
`lib/middleware/**`, `prisma/schema.prisma`, `lib/db/marketplace.db.ts`, `lib/commissions.ts`:
avisá en el reporte y pedí pasada del agente `security` antes del merge.

## Verificación mínima antes de reportar
- `npm run typecheck` (TypeScript 7 nativo, 4-8 s caliente) — el gate que decide (ADR-428, el mismo del pre-commit y CI). `npx tsc` (5.9) tarda 195 s: solo si Brandon lo pide. Uno por vez.
- El endpoint real con sesión propia (el `/tmp/bsm-auth.env` del arranque vence: 27-10 dio 401 y costó
  una tanda): `FLAGS=$(node scripts/dev-helpers/admin-auth.mjs --flags) && curl "http://localhost:3000/api/..." $FLAGS`.
  Rutas frías compilan 10-60 s: primer curl con `--max-time 120`.
- `npx vitest run <tests del área>`; un caso multi-tenant (tenant ajeno → 401/404) por endpoint nuevo.
- Un 500 `P2021/P2022` = schema drift: `npm run db:sanity`.
