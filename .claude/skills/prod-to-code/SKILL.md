---
name: prod-to-code
description: Pipeline autonomo que conecta errores de produccion con fixes automaticos. Lee logs de Vercel/Sentry, crea issues, despacha agentes, arregla, testea y deploya. Zero human intervention para errores conocidos.
user-invocable: true
model: opus
context: fork
argument-hint: "[scan|fix|status]"
---

# /prod-to-code — Pipeline Produccion → Codigo Automatico

## Que es

Un pipeline que cierra el loop completo:

```
Error en produccion
  → Detectar (Vercel logs / Sentry)
    → Clasificar (tipo + severidad + area)
      → Crear GitHub Issue automatico
        → Despachar agente correcto
          → Fix + test + verify
            → Deploy canary
              → Confirmar fix en produccion
```

**Zero intervencion humana para errores tipo P2-P3.**
**Confirmacion de Brandon solo para P0-P1 (criticos).**

## Comandos

- `/prod-to-code scan` — Escanea logs recientes, reporta errores encontrados
- `/prod-to-code fix [error-id]` — Arregla un error especifico
- `/prod-to-code status` — Estado del pipeline (errores pendientes, fixes en progreso)
- `/prod-to-code auto` — Modo autonomo completo (scan + fix + deploy)

## FASE 1: Deteccion

### Fuentes de datos

```bash
# Vercel runtime logs (ultimas 2 horas)
vercel logs [deployment-url] --since 2h

# Vercel function errors
vercel logs [deployment-url] --level error --since 24h

# Si Sentry esta configurado:
# curl -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
#   "https://sentry.io/api/0/projects/$ORG/$PROJECT/issues/?query=is:unresolved"
```

### Parsing de errores

```
Para cada linea de error en logs:
  1. Extraer: timestamp, tipo, mensaje, stack trace, URL, status code
  2. Deduplicar: agrupar errores identicos por fingerprint (tipo+mensaje+archivo)
  3. Contar: frecuencia en las ultimas 24h
  4. Output: lista unica de errores con frecuencia
```

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

```
Para cada error clasificado:

1. Crear branch: auto-fix/prod-[error-fingerprint]

2. Cargar contexto:
   /pre-task-intel [area del error]

3. Despachar agente:
   Agent({
     subagent_type: [agente de la tabla],
     prompt: "Error en produccion:
       Tipo: [tipo]
       Mensaje: [mensaje completo]
       Stack trace: [stack trace]
       URL afectada: [url]
       Frecuencia: [N] veces en 24h
       
       Tu trabajo:
       1. Localizar la causa raiz en el codigo
       2. Aplicar fix minimo y seguro
       3. Agregar test que reproduzca el error
       4. Verificar: npm run lint && npx tsc --noEmit && npm run test"
   })

4. Verificar resultado:
   - Si pasa verificacion → commit + push
   - Si falla → self-heal v2 → auto-escalation
```

## FASE 4: Deploy

```
Si P2-P3 (auto):
  1. Push branch
  2. Vercel auto-genera preview deployment
  3. Verificar preview (health check)
  4. Si OK → merge a master → canary deploy (5%→25%→100%)
  5. Monitorear 15 min post-deploy
  6. Si error persiste → auto-rollback

Si P0-P1 (requiere Brandon):
  1. Push branch
  2. Crear PR con titulo: "fix(prod): [error] — auto-fix by prod-to-code"
  3. Body del PR incluye: error, stack trace, fix aplicado, tests
  4. Notificar a Brandon: "PR listo para review"
```

## FASE 5: Confirmacion

```
Despues de deploy:
  1. Esperar 15 minutos
  2. Re-escanear logs buscando el mismo error
  3. Si error desaparecio → marcar como RESOLVED
  4. Si error persiste → marcar como UNRESOLVED, crear issue de follow-up
  5. Actualizar metricas en agent-metrics
```

## Modo Autonomo Completo (/prod-to-code auto)

Ejecuta las 5 fases en secuencia para TODOS los errores detectados:

```
1. Scan → encontrar N errores
2. Clasificar → separar P0/P1 (manual) de P2/P3 (auto)
3. Para P2/P3: fix en paralelo (max 5 simultaneos)
4. Para P0/P1: crear PRs, notificar Brandon
5. Deploy canary para P2/P3 fixes
6. Monitorear 15 min
7. Reportar resultado final
```

## Formato de reporte

```markdown
## Prod-to-Code Report

### Errores detectados
| # | Error | Severidad | Frecuencia | Area |
|---|---|---|---|---|
| 1 | TypeError in /api/orders | P2 | 23/24h | backend |
| 2 | 404 on /tienda/zona/X | P3 | 150/24h | seo |
| 3 | PrismaTimeout in /api/products | P2 | 8/24h | database |

### Fixes aplicados
| # | Error | Agente | Fix | Tests | Deploy |
|---|---|---|---|---|---|
| 1 | TypeError orders | bug-hunter | null check + fallback | +2 | canary OK |
| 2 | 404 zona URLs | seo-strategist | generate missing pages | +3 | canary OK |
| 3 | PrismaTimeout | db-engineer | add index + connection pool | +1 | canary OK |

### Estado post-deploy (15 min)
- Error 1: RESOLVED (0 ocurrencias)
- Error 2: RESOLVED (0 ocurrencias)
- Error 3: PARTIALLY RESOLVED (2 ocurrencias, -75%)
```

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
