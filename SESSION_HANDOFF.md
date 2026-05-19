# Session Handoff — 2026-05-19 (Sprint Final Producción)

> Brandon cerró sesión 2026-05-19. Este archivo orienta el arranque siguiente.

## Estado actual

- **Branch activa:** `chore/production-ready-final` (pusheada a GitHub ✅)
- **Sprint:** Sprint Final Producción Día 1→14 (mapa en `BACKLOG.md`)
- **Score global:** 14/20 → **17.6/20** (+3.6 hoy)
- **Working tree:** limpio ✅
- **Remote sync:** ✅ `origin/chore/production-ready-final` al día
- **Repo GitHub:** `git@github.com:Buleje/Mercado.git`
- **Supabase project:** `Mercado` (id `sofkgguriggocouiuamx`) us-east-2

## Lo primero que debe hacer la IA al arrancar

```bash
git status                  # confirmar working tree limpio
git log --oneline -15       # ver commits del sprint
git branch --show-current   # debe ser chore/production-ready-final
```

Si Brandon dice "seguí" o "continuá", **arrancar con la pregunta crítica:**

> ¿Ya configuraste Vercel `DATABASE_URL` + `DIRECT_URL` con `app_user`?

## Caminos posibles del próximo turno

### Caso A — Brandon configuró Vercel

1. Validar smoke test (login, /tiendas, checkout responden 200 en preview)
2. Aplicar migration RLS via Supabase MCP `apply_migration`
   - Project: `sofkgguriggocouiuamx`
   - SQL: `prisma/migrations/2026_05_18_add_rls_policies/migration.sql`
3. Smoke test cross-tenant final (replicar dry-run con app_user real)
4. Commit + push
5. Score eje SEGURIDAD: 18 → 19/20

### Caso B — Brandon NO configuró Vercel todavía

Avanzar EJES INDEPENDIENTES (sin esperar Brandon):

| Prioridad | Tarea | Eje | Tiempo |
|:-:|---|---|:-:|
| 🥇 | Migrar 8 callers más a `withRlsTenant()` (Día 6-7 completar) | Seguridad | 30 min |
| 🥈 | Dead code audit `knip` + `ts-prune` (Día 13) | Código | 45 min |
| 🥉 | Bundle analyze + CWV mobile (Día 11) | Performance | 40 min |
| 🏅 | Ejecutar tests E2E con `seed-e2e.mjs` + Playwright | Código | 1h (requiere DB local Brandon) |
| 5 | Cleanup 29 worktrees viejos `git worktree prune` | Operación | 15 min |

## Pendientes BRANDON antes de cerrar Sprint Final

1. **Configurar Vercel** (acción más crítica — desbloquea RLS efectiva):
   - Pass `app_user` y `prisma_migrator` están en `docs/security/rls-credentials-2026-05-18.md`
     (gitignored, en filesystem WSL local de Brandon)
   - URLs format en `docs/security/rls-credentials-TEMPLATE.md`
2. **Smoke test prod** post-cambio URLs (monitor Sentry 30 min)
3. **Decidir si convertir trials a pago** antes de 2026-06-12 (24 días)
4. **Ejecutar `node scripts/e2e/seed-e2e.mjs`** + `npx playwright test` cuando tenga DB lista

## Reglas del sprint (CLAUDE.md)

- ❌ CERO features nuevas durante el sprint
- ❌ NO tocar `schema.prisma` sin ADR + Brandon approval
- ❌ NO usar `apply_migration` a producción sin dry-run primero
- ✅ Branch única `chore/production-ready-final` hasta cerrar
- ✅ tsc + lint GREEN antes de cerrar cada día
- ✅ Commit por día mínimo

## Roles DB creados (Supabase Mercado)

| Rol | LOGIN | BYPASSRLS | Estado | Uso |
|---|:-:|:-:|---|---|
| `app_user` | ✅ | ❌ | Smoke OK | Conexión app (Prisma) — RLS efectiva |
| `prisma_migrator` | ✅ | ✅ | Smoke OK | Migrations DDL (DIRECT_URL) |
| `postgres` | ✅ | ✅ | Sin cambio | Admin Supabase (NO usar app) |

## Archivos clave del sprint

```
BACKLOG.md                                         — plan 14 días + reglas
docs/security/dr-drill-runbook-2026-05-19.md       — DR procedimientos 4 escenarios
docs/security/pentest-sprint-final-2026-05-18.md   — 0 P0/P1 nuevos
docs/security/rls-dry-run-results-2026-05-18.md    — 8 smoke tests OK
docs/security/rls-credentials-TEMPLATE.md          — formato URLs Vercel
docs/perf/n-plus-1-audit-2026-05-18.md             — 11 N+1 identificados
docs/e2e/README.md                                 — guía Playwright Brandon
lib/prisma-rls.ts                                  — withRlsTenant helpers
prisma/migrations/2026_05_18_add_rls_policies/     — migration + rollback SQL
```

## Commits del Sprint Final HOY (14)

```
abc57a3f  chore(dev): add ss-home-mobile.mjs dev helper screenshot
cd9b61ba  chore(sprint): p1-001 cross-check tenantid + dr drill runbook dia 14
c4609d8b  feat(security): adr-114 prerequisito — roles app_user + prisma_migrator
da1766c7  fix(security): dry-run rls validado + correcciones migration sql
6c0d8262  docs(security): pentest sprint final — 0 P0/P1 nuevos, 1 P1 backlog
b91fd6a5  perf(db): sprint final dia 9 — aplicar fixes n+1 P0
a67db0af  test(e2e): sprint final dia 12 — fixtures + seed + .env.test setup
283dd313  test(e2e): sprint final dia 12 — 8 happy paths scaffold
5d4e6975  feat(security): adr-114 fase 1 — rls postgres helpers + sql migration
a5efceac  feat(compliance): dia 2 — consent endpoints customer-facing
a800ac0a  docs(perf): sprint final dias 9-10 — audit n+1 + indices + bundle
6cdb432e  feat(compliance): sprint final dia 1 — ley 29733 derechos arco
```

## Memoria de la sesión

Path absoluto:

```
/home/usuario/.claude/projects/-home-usuario-proyectos-Mercado/memory/project_session_2026-05-19_sprint_final.md
```

Se carga automáticamente en próxima conversación vía `MEMORY.md`.

## Tono / estilo esperado por Brandon

- **Feynman:** analogías mundo real PRIMERO, técnica después
- **Tablas siempre**, prosa ≤100 palabras
- **Bilingüe ES-PE**, sin jerga inglesa
- **Acción rápida** > análisis largo
- **Honestidad brutal** > diplomacia

## TL;DR para el primer prompt de la próxima sesión

> Brandon: "seguí con el sprint"
>
> IA: Verifica si configuró Vercel.
>     Si sí → aplicar migration RLS efectiva.
>     Si no → avanzar callers + dead code + bundle.
