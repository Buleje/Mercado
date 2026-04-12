---
name: sprint-autopilot
description: Ejecuta un sprint completo de forma autonoma. Recibe una lista de features/fixes, descompone en tareas, lanza agentes en paralelo con worktrees, coordina dependencias via A2A, verifica cada entrega, y genera PRs. Un boton = sprint hecho.
user-invocable: true
model: opus
context: fork
argument-hint: "[sprint-items como lista o referencia a ROADMAP]"
---

# /sprint-autopilot — Ejecucion Autonoma de Sprint

Le das una lista de items y el sistema: descompone en tareas, identifica dependencias, lanza agentes en paralelo, coordina via A2A, verifica (lint+tsc+test+build), auto-repara fallos, crea commits atomicos, y genera reporte.

## Uso

```
/sprint-autopilot
  1. pgvector recommender para productos similares
  2. 7 URLs programaticas de zona para SEO
  3. WhatsApp concierge para compradores frecuentes
```

O desde roadmap: `/sprint-autopilot from:ROADMAP-24-WEEKS.md sprint:2`

## Algoritmo

### FASE 0: Intake
- Parsear items, clasificar tipo (feature|fix|refactor|infra) y complejidad (simple|moderada|alta|enterprise)
- Identificar dominio y mapear via agent-router al agente/squad optimo
- Output: Sprint Backlog estructurado

### FASE 1: Arquitectura
- solution-architect produce: contrato global (interfaces TS compartidas), DAG de dependencias, mapa de archivos por item, items paralelos vs secuenciales
- Publicar contrato en A2A Bus (broadcast)
- Validar: zona peligrosa solo via squad designado

### FASE 2: Base de datos (si aplica)
- Si hay cambio de schema: database-engineer + migration-planner generan SQL (NO ejecutar)
- Publicar resultado en A2A Bus. Si no hay cambios DB → skip

### FASE 3: Ejecucion paralela
Para cada grupo de items independientes:
- **Simple** (1-3 archivos, 1 area) → Agent(especialista, background)
- **Moderado** (4-10 archivos, 1-2 areas) → Agent(especialista, worktree, background)
- **Alto/enterprise** (10+ archivos, 3+ areas) → Agent(squad, background)

Cada agente recibe: contrato arquitectonico, pre-task intel, resultados DB si depende. Al terminar publica en A2A Bus.

### FASE 4: Gating de dependencias (continuo)
- Leer A2A Bus para resultados → lanzar items dependientes cuando deps satisfechas
- Si agente falla → auto-escalation (5 niveles). Si no converge → BLOCKED, seguir con otros
- Al completar una ola → `lint && tsc --noEmit && test`. Si falla → self-heal v2

### FASE 5: Integracion
- Merge worktrees al branch principal (fast-forward o merge). Conflictos → refactoring-expert
- Verificacion COMPLETA: `lint && tsc --noEmit && test && build`
- Si falla → self-heal v2 → auto-escalation

### FASE 6: Entrega
- Commits atomicos (1 por item ideal, o 1 consolidado si entrelazados)
- security-pentester sobre diff total (Regla 14). CRITICAL → bloquear
- Si pasa → push. Generar Sprint Report con tabla items, verificacion global, metricas, bloqueados, commits, siguiente sprint sugerido.

## Limites de seguridad

1. **Nunca ejecutar migraciones DB** — solo generar SQL
2. **Nunca deploy auto a produccion** — solo push a branch
3. **Maximo 8 agentes simultaneos**
4. **Cost cap: $15 por sprint** — si excede, pausar
5. **>50% items fallan** → abortar sprint
6. **Zona peligrosa** → solo via squads especializados

## Integraciones

| Sistema | Rol |
|---|---|
| agent-router | Selecciona agente por item |
| pre-task-intel | Contexto por dominio pre-item |
| a2a-bus | Coordinacion inter-agentes |
| auto-escalation | Maneja fallos |
| self-heal v2 | Repara errores verificacion |
| agent-metrics | Trackea rendimiento |
| parallel-work | Worktrees para independientes |
| compound-learning-v2 | Aprende patrones del sprint |
