---
name: session-handoff
description: Guarda estado completo de la sesion actual para que la siguiente sesion retome exactamente donde quedamos. Incluye tareas pendientes, archivos dirty, branch, contexto y plan.
user-invocable: true
model: sonnet
---

# /session-handoff — Transferencia de sesion completa

## Cuando usarlo
- Al terminar una sesion larga y querer continuar manana
- Cuando el contexto se esta comprimiendo y hay trabajo pendiente
- Cuando Brandon dice "guarda donde vamos", "session handoff", "retomamos manana"
- AUTOMATICO: el hook `stop-checkpoint.mjs` hace una version ligera, pero este skill hace la version COMPLETA

## Que guarda

El skill crea/actualiza `bodega-san-martin/.claude/session-state.json` con:

```json
{
  "timestamp": "2026-04-10T12:00:00Z",
  "branch": "feat/current-feature",
  "sprint": "Sprint 2",
  "tasksCompleted": ["task-1", "task-2"],
  "tasksPending": ["task-3", "task-4"],
  "filesModified": ["file1.ts", "file2.tsx"],
  "filesUncommitted": ["file3.ts"],
  "lastCommand": "npm run test (passed)",
  "contextNotes": "Estabamos implementando pgvector recommender, paso 3 de 5",
  "nextActions": [
    "Completar embedding generation en lib/ai/embeddings.ts",
    "Crear endpoint /api/recommendations",
    "Tests para recommender"
  ],
  "blockers": ["Necesita EXA_API_KEY para deep research"],
  "agentsUsed": ["database-engineer", "backend-platform-engineer"],
  "adrsCreated": ["ADR-042"],
  "memoryUpdates": ["Actualizado project_sprint_roadmap.md"]
}
```

## Flujo de ejecucion

### Al GUARDAR (/session-handoff save)

1. Capturar `git status` + `git diff --stat` + `git log -5 --oneline`
2. Leer TaskList para tareas pendientes
3. Leer ultimos 3 mensajes del usuario para contexto
4. Generar `session-state.json`
5. Actualizar memoria `session_sprint2_seo_kickoff.md` (o la sesion activa)
6. Generar resumen de 5 lineas para el MEMORY.md

### Al CARGAR (/session-handoff load)

1. Leer `session-state.json`
2. Verificar que el branch sigue existiendo
3. Verificar que los archivos uncommitted siguen ahi
4. Crear tareas de TaskCreate para las pendientes
5. Mostrar resumen al usuario: "Retomamos donde quedamos: [contexto]"
6. Proponer: "Arranco con [nextActions[0]] a menos que digas otra cosa"

## Integracion con /luis

Cuando Brandon escribe "luis", el skill `/luis` automaticamente:
1. Carga el session-state.json si existe
2. Usa el contexto para decidir la accion mas ambiciosa
3. Arranca sin pedir permiso

## Integracion con stop-checkpoint.mjs

El hook `stop-checkpoint.mjs` ya guarda un checkpoint ligero al terminar.
Este skill complementa con:
- Tareas pendientes detalladas
- Contexto narrativo de lo que estabamos haciendo
- Plan de siguiente sesion
- Agentes usados y su output
