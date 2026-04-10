---
name: parallel-work
description: Lanza N agentes en worktrees aislados para trabajar en features independientes en paralelo. Cada agente tiene su propia copia del repo sin conflictos.
user-invocable: true
model: opus
---

# /parallel-work — Trabajo paralelo en worktrees aislados

## Cuando usarlo
- 2+ features independientes que pueden desarrollarse al mismo tiempo
- Refactors grandes que tocan muchos archivos (aislar cada frente)
- Sprints con N iniciativas independientes
- Cualquier trabajo donde los agentes pisarian archivos del otro

## Flujo

### Paso 1: Descomponer en frentes independientes

Al recibir la tarea, el Orquestador:
1. Identifica N sub-tareas independientes (sin archivos compartidos)
2. Para cada sub-tarea, define: branch name, archivos que tocara, agente especialista
3. Valida que NO hay overlap de archivos entre frentes

### Paso 2: Lanzar agentes con isolation: "worktree"

```
Para cada frente independiente, lanzar:

Agent({
  description: "Frente N: [descripcion corta]",
  subagent_type: "[agente-especialista]",
  isolation: "worktree",
  prompt: "[instrucciones completas con contexto]",
  run_in_background: true
})
```

**CRITICO:** Usar `isolation: "worktree"` para que cada agente tenga su propia copia del repo. Sin esto, los agentes pisan archivos del otro.

### Paso 3: Mientras los agentes trabajan

El Orquestador:
- Trabaja en quick wins que no tocan los mismos archivos
- Prepara documentacion (ADRs, TECH-DEBT updates)
- Monitorea progreso via notificaciones

### Paso 4: Consolidar resultados

Cuando los agentes terminan:
1. Revisar el output de cada worktree
2. Si el agente hizo cambios, el worktree queda como branch
3. Merge cada branch al branch principal (secuencial para evitar conflictos)
4. Correr verificacion completa: `npm run lint && npx tsc --noEmit && npm run test && npm run build`
5. Commit consolidado o commits atomicos por frente

### Paso 5: Cleanup

Los worktrees sin cambios se limpian automaticamente.
Los que tienen cambios quedan como branches para merge.

## Ejemplo real

```
Brandon: "Necesito agregar pgvector recommender + WhatsApp concierge + billing metering"

Orquestador detecta 3 frentes independientes:

Frente 1 (DATABASE): pgvector extension + embeddings table + recommender DB class
  → Agent: database-engineer, worktree, branch: feat/pgvector-recommender

Frente 2 (INTEGRACIONES): WhatsApp Business API + webhook handler + concierge flow
  → Agent: integration-specialist, worktree, branch: feat/whatsapp-concierge

Frente 3 (BACKEND): billing metering endpoint + usage tracking + Stripe integration
  → Agent: backend-platform-engineer, worktree, branch: feat/billing-metering

Los 3 corren en paralelo. Cero conflictos.
```

## Limites

- Maximo 5 worktrees simultaneos (mas que eso degrada performance)
- Cada worktree consume ~500MB de disco (copia completa del repo)
- No usar para tareas que comparten archivos criticos (checkout, cart-context, schema.prisma)
- Para archivos compartidos, usar el flujo A2A con gating de dependencias (feedback_multi_agent_hierarchy_level3)

## Reglas

1. SIEMPRE declarar el arbol de frentes ANTES de lanzar agentes
2. SIEMPRE verificar que no hay overlap de archivos
3. SIEMPRE correr verificacion completa despues del merge
4. Si un frente falla, NO bloquear los otros — aislar y reportar
