---
name: deploy
description: Deploy completo de Buleje con verificación pre-deploy integrada. Modos: check (solo gates, sin deployar), quick (lint+tsc), full (gates + commit + push). Usar cuando el usuario quiera deployar, publicar cambios, o pregunte "está listo para deploy", "deploy check", "pre-deploy".
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
model: sonnet
argument-hint: "[check|quick|full]"
---

# /deploy — Deploy Buleje (pre-deploy check integrado)

## Modos

| Modo | Qué corre | Cuándo |
|---|---|---|
| `/deploy quick` | lint + tsc (~60s) | sanity rápido |
| `/deploy check` | TODOS los gates, SIN commit/push | "¿está listo para deploy?" |
| `/deploy` (full) | gates + schema + commit + push | deploy real |

## 1. Gates (en orden; cualquiera falla → BLOCKED)

```bash
npm run lint
npx tsc --noEmit             # pre-check rápido alternativo: tsgo --noEmit
npm run test
node scripts/build-gate.mjs  # gate autoritativo: mata dev → build limpio → veredicto → re-levanta dev
```

- `build-gate.mjs` reemplaza a `npm run build` a secas: atrapa errores de prerender y caché corrupto de `.next/dev` que tsc NO ve (regla E agentic-style).
- Lint falla → intentar autofix y re-correr; si persiste → ABORTAR.
- Tests fallando → ABORTAR. NUNCA deployar con rojo.

## 2. Salud de prod (solo check/full, si el dev server corre)

```bash
curl -s localhost:3000/api/superadmin/slo | head -5          # SLO >90% burned → BLOCKED
curl -s localhost:3000/api/superadmin/cron-health | head -5  # crons fallando → WARNING (no bloquea)
```

## 3. Schema (solo si `git diff --name-only HEAD | grep -q prisma/`)

- `npx prisma validate`
- Confirmar que la migración corrió con `DIRECT_URL`. Si no corrió → ADVERTIR antes de continuar (ver MEMORIA-PROYECTO.md flujo Supabase/pgBouncer).

## 4. Commit + push (solo full)

- Conventional Commits, español, subject ≤100 chars.
- NUNCA stagear `.env*` ni archivos con secrets — revisar staging antes del commit.
- `git push origin $(git branch --show-current)` → Vercel dispara el deploy.
- Canary 5%→25%→100% + monitorear en dashboard Vercel (regla 14 CLAUDE.md).

## Reporte final (siempre tabla)

| Gate | Estado | Detalle |
|---|---|---|
| Lint | ✅/❌ | N warnings |
| TSC | ✅/❌ | N errors |
| Tests | ✅/❌ | N passed / N failed |
| Build (build-gate) | ✅/❌ | duración |
| SLOs | ✅/🔴 | budget status |
| Crons | ✅/⚠️ | N failed 24h |
| Schema | ✅/—/⚠️ | migración status |
| Commit + Push | ✅/— | sha / branch |

**Veredicto: DEPLOY SAFE / DEPLOY BLOCKED** + tiempo total de verificación.
