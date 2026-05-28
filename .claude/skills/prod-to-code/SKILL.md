---
name: prod-to-code
description: Pipeline autonomo que conecta errores de produccion con fixes automaticos. Lee logs de Vercel/Sentry, crea issues, despacha agentes, arregla, testea y deploya. Zero human intervention para errores conocidos.
user-invocable: true
model: opus
context: fork
argument-hint: "[scan|fix|status]"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Agent, TaskCreate, TaskUpdate
---

# /prod-to-code — Pipeline Produccion → Codigo Automatico

## Que es

Pipeline de 5 fases: Error en produccion → Detectar → Clasificar → Auto-fix → Deploy canary → Confirmar.

- **Zero intervencion humana para P2-P3.**
- **Confirmacion de Brandon solo para P0-P1 (criticos).**

## Comandos

- `/prod-to-code scan` — Escanea logs recientes, reporta errores encontrados
- `/prod-to-code fix [error-id]` — Arregla un error especifico
- `/prod-to-code status` — Estado del pipeline (errores pendientes, fixes en progreso)
- `/prod-to-code auto` — Modo autonomo completo (scan + fix + deploy)

## FASE 1: Deteccion

**Fuentes:** `vercel logs [deployment-url] --since 2h` (runtime), `--level error --since 24h` (functions). Sentry si configurado.

**Parsing:** Para cada linea de error: extraer timestamp/tipo/mensaje/stack/URL/status → deduplicar por fingerprint (tipo+mensaje+archivo) → contar frecuencia 24h → lista unica.

## FASE 2: Clasificacion

| Patron de error | Severidad | Area | Agente |
|---|---|---|---|
| 500 Internal Server Error | P1 | backend | bug-hunter |
| TypeError: Cannot read properties of null | P2 | fullstack | bug-hunter |
| PrismaClientKnownRequestError | P2 | database | database-engineer |
| NEXT_NOT_FOUND (404 masivo) | P3 | frontend/seo | seo-growth-strategist |
| Rate limit exceeded | P3 | infra | devops-release-engineer |
| JWT expired / auth error | P2 | auth | security-squad |
| Timeout / function duration | P2 | performance | performance-squad |
| CORS / CSP violation | P3 | security | backend-platform-engineer |
| Unhandled promise rejection | P2 | backend | bug-hunter |
| Out of memory | P1 | performance | performance-squad |
| Multi-tenant data leak | **P0** | security | **security-squad + BLOQUEAR** |

### Reglas de severidad

| Severidad | Accion | Requiere Brandon? |
|---|---|---|
| **P0 CRITICAL** | Bloquear, notificar Brandon, NO auto-fix | SI — siempre |
| **P1 HIGH** | Auto-fix, confirmar antes de deploy | SI — para deploy |
| **P2 MEDIUM** | Auto-fix + auto-deploy canary | NO |
| **P3 LOW** | Auto-fix, batch con otros P3, deploy en siguiente ciclo | NO |

## FASE 3: Auto-Fix

Para cada error clasificado:
1. Crear branch: `auto-fix/prod-[error-fingerprint]`
2. Cargar contexto: `/pre-task-intel [area del error]`
3. Despachar agente de la tabla con: tipo, mensaje, stack trace, URL, frecuencia. Agente debe localizar causa raiz, aplicar fix minimo, agregar test, verificar con `npm run lint && npx tsc --noEmit && npm run test`
4. Si pasa verificacion → commit + push. Si falla → self-heal v2 → auto-escalation

## FASE 4: Deploy

**P2-P3 (auto):** Push branch → Vercel preview → health check → merge a master → canary (5%→25%→100%) → monitorear 15 min → auto-rollback si error persiste.

**P0-P1 (requiere Brandon):** Push branch → crear PR con titulo `fix(prod): [error] — auto-fix by prod-to-code` + error/stack/fix/tests en body → notificar Brandon.

## FASE 5: Confirmacion

Despues de deploy: esperar 15 min → re-escanear logs buscando mismo error → RESOLVED si desaparecio / UNRESOLVED + issue follow-up si persiste → actualizar agent-metrics.

## Modo Autonomo Completo (/prod-to-code auto)

1. Scan → encontrar N errores
2. Clasificar → separar P0/P1 (manual) de P2/P3 (auto)
3. P2/P3: fix en paralelo (max 5 simultaneos)
4. P0/P1: crear PRs, notificar Brandon
5. Deploy canary para P2/P3 fixes
6. Monitorear 15 min → reportar resultado final

## Integraciones

| Sistema | Rol |
|---|---|
| Vercel CLI | `vercel logs` para deteccion |
| agent-router | Selecciona agente por tipo de error |
| auto-escalation | Maneja agentes que no pueden resolver |
| self-heal v2 | Repara errores de verificacion post-fix |
| canary deploy | Deploy gradual con auto-rollback |
| slo-status | Verifica que el fix no rompa SLOs |
| runbook | Si el error matchea un runbook, ejecutar el runbook primero |
