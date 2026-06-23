---
name: sprint-autopilot
description: Ejecuta un sprint completo via Hub pipeline streaming. Recibe features, el Director las descompone, lanza Hubs BUILD→QUALITY→OPS con gates automaticos. Features entran a siguiente fase individualmente sin esperar batch.
user-invocable: true
model: opus
context: fork
argument-hint: "[lista de features/fixes o referencia a ROADMAP]"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Agent, TaskCreate, TaskUpdate
---

# /sprint-autopilot v2 — Hub Pipeline Streaming

Le das una lista de items y el Director ejecuta un pipeline de 4 fases usando los 3 Hubs nativos (BUILD, QUALITY, OPS) con Agent Teams.

## Uso

```
/sprint-autopilot
  1. Modulo de fiado con scoring
  2. Facturacion SUNAT electronica
  3. Dashboard de ventas por tenant
```

O desde roadmap: `/sprint-autopilot from:ROADMAP-24-WEEKS.md sprint:3`

## Pipeline (4 fases)

### FASE 1: DESIGN (architect solo, secuencial)

Para cada feature:
1. architect genera contrato (tipos TS, schema, endpoints, Zod schemas)
2. architect crea ADR si cambia arquitectura (Rule 12)
3. Output: 1 contrato por feature con deliverable/artifacts/types/interface/blockers

### FASE 2: BUILD (paralelo, max 3 features simultaneas)

Para cada feature, TeamCreate("hub-build") con teammates necesarios:
- DAG interno: architect → [database + integrator-SEO] → backend → [integrator-API] → frontend
- Gate por feature: `npm run lint && npx tsc --noEmit`
- Si falla gate: healer auto-repair (max 3 intentos)
- Feature completada → entra a FASE 3 inmediatamente (streaming, no batch)

### FASE 3: QUALITY (paralelo, features entran al completar BUILD)

Para cada feature, TeamCreate("hub-quality") con teammates necesarios:
- DAG interno: [reviewer + tester] → [security + data-qa]
- reviewer en modo "review" (analiza diff)
- security con veto power (hallazgo critico = BLOQUEA)
- Gate: `npm run test && npm run build`
- Si falla: SendMessage back a BUILD con errores especificos

### FASE 4: OPS (secuencial, 1 deploy por batch)

Cuando QUALITY aprueba un batch:
1. observer → health check pre-deploy
2. deployer → canary 5% → 25% → 100%
3. optimizer → CWV + cost check post-deploy
4. Si degradacion: auto-rollback

## Coordinacion

- **Intra-Hub:** SendMessage nativo entre teammates
- **Inter-Hub:** Director sintetiza output de un Hub y lo pasa como contexto al siguiente
- **Task list:** Compartida, visible con Ctrl+T
- **Contrato format:**
  ```
  deliverable: [que se completo]
  artifacts: [archivos creados/modificados]
  types: [tipos TS exportados]
  interface: [lo que debe implementar el receptor]
  blockers: [impedimentos o "ninguno"]
  ```

## Reglas

1. Max 3 features en paralelo en BUILD (oleadas de 3)
2. Features independientes = paralelo. Con dependencias = secuencial
3. Cada feature tiene su propio pipeline (streaming, no batch)
4. Security gate obligatorio antes de deploy (Rule 14)
5. Commit atomico por feature completada
6. Si healer falla 3 veces → escalar a Brandon

## Metricas al cierre

Al terminar el sprint, reportar:
- Features completadas / total
- Tokens totales por Hub
- Tiempo por feature
- Issues encontrados por QUALITY
- CWV delta post-deploy
