# Onboarding — Buleje

> **Objetivo:** que cualquier desarrollador (humano o agente Claude) sea productivo en < 1 hora.
> **No leas todo el repo. Leé solo esto y seguí el orden.**

---

## 🎯 Orden de lectura obligatorio (30 min)

1. **`Prueba 2/CLAUDE.md`** (raíz) — 10 min · stack, comandos, reglas críticas, glosario visual
2. **`docs/ARCHITECTURE.md`** (este directorio) — 10 min · capas, flujos end-to-end, módulos
3. **`docs/adr/README.md`** — 5 min · mapa de decisiones arquitectónicas (luego los ADRs que apliquen a tu tarea)
4. **`AGENTS.md`** (raíz) — 5 min · qué agente invocar para qué

---

## 🚀 Comandos mínimos para arrancar

```bash
cd bodega-san-martin
npm install
npx prisma generate
cp .env.example .env.local     # completar DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run dev                    # localhost:3000
```

Si los tests deben pasar antes de tocar código:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

---

## 🧭 "¿Dónde hago X?" (atajos frecuentes)

| Querés… | Vas a… |
|---|---|
| Agregar un endpoint nuevo | `app/api/**/route.ts` con el patrón de `docs/ARCHITECTURE.md` §2 |
| Tocar lógica de negocio | `lib/db/*.db.ts` — nunca Prisma directo |
| Agregar un tab al admin | `components/admin/XxxTab/` + registrar en `app/admin/_lib/tabs.types.ts` + `tab-data.ts` |
| Cambiar permisos de rol | `lib/auth/role-permissions.ts` (⚠️ zona de peligro) |
| Cambiar el schema | `prisma/schema.prisma` + `npx prisma migrate dev --name xxx` (requiere `DIRECT_URL`) |
| Agregar un feature flag | `lib/feature-flags.ts` + ver ADR 005 |
| Mandar un WhatsApp / email / PDF async | `lib/queue/` — encolar con `enqueueX()`, NO fire-and-forget |

---

## ⚠️ No toques sin leer antes

| Archivo | Leé antes de editarlo |
|---|---|
| `components/checkout/CheckoutModal.tsx` | `.github/instructions/checkout-flow.instructions.md` |
| `lib/auth/role-permissions.ts` | `.github/instructions/security-auth.instructions.md` |
| `lib/db/orders.db.ts` | `.github/instructions/database-migrations.instructions.md` |
| `prisma/schema.prisma` | `.github/instructions/prisma-schema.instructions.md` + ADR correspondiente |
| `contexts/cart-context.tsx` | `.github/instructions/state-management.instructions.md` |
| `proxy.ts` | `.github/instructions/security-auth.instructions.md` |

(El hook `.claude/hooks/danger-zone.mjs` te va a bloquear automáticamente si intentás editar estos archivos sin warning.)

---

## 🤖 Si sos un agente Claude

1. Empieza por **leer la memoria persistente** en `~/.claude/projects/.../memory/MEMORY.md` si existe — ahí hay reglas del usuario (Brandon) que deben respetarse.
2. Usa el **dashboard en vivo** en `http://localhost:3457/` — muestra qué está pasando con los otros agentes.
3. Para tareas grandes, despachá un **Agent Team** (`/agent-team`) en lugar de un subagente solo. Ver `AGENTS.md` §Team.
4. Antes de proponer código, **lee los ADRs relevantes**. Algo que parece obvio puede ir en contra de una decisión documentada.
5. Respeta la regla de **Conventional Commits** + DoD del `.github/PULL_REQUEST_TEMPLATE.md`. El CI y el pre-commit hook te van a rebotar si no.

---

## 🩺 Diagnóstico rápido cuando algo no funciona

| Síntoma | Primer check |
|---|---|
| Build rompe con error TS | `npx tsc --noEmit` · mirá `docs/TECH-DEBT.md` por si el archivo está marcado |
| Test e2e falla local pero pasa en CI | `npm run dev` en otra terminal, luego `npm run test:e2e:ui` |
| "Tenant not found" | Reviá §3 de `ARCHITECTURE.md` — probablemente falta `x-tenant-id` en el fetch |
| Migración Prisma cuelga | `reference_prisma_pgbouncer_workaround` en memoria del usuario — es un problema conocido de Prisma 7 + Supabase pooler |
| Redis not available | Opcional — el cache degrada a memoria local (`lib/cache.ts`) |

---

## 📞 Siguiente paso concreto

- **Nuevo en el proyecto:** leé los 4 docs de arriba, luego pedí a `/new-feature` una issue chiquita para calibrar.
- **Venís a continuar WIP:** `git branch -a | grep wip/` — ahí están los snapshots de trabajo pendiente.
- **Venís por un bug:** `/fix` + pegá el error o el comportamiento esperado.
