---
name: a2a-bus
description: Bus de comunicacion inter-agentes. Permite que agentes se pasen contratos, resultados y errores via un estado compartido (.claude/a2a-state.json). El Orquestador lee todo; cada agente lee solo lo dirigido a el.
user-invocable: true
model: sonnet
---

# /a2a-bus — Bus de Comunicacion Inter-Agentes

## Para que sirve

Cuando multiples agentes trabajan en la misma tarea (squads, parallel-work), necesitan pasarse informacion:
- ARQUITECTURA define un contrato (interfaces TS) → BACKEND lo consume
- DATABASE reporta "migracion lista" → FRONTEND puede empezar
- Cualquier agente reporta error → Orquestador decide que hacer

El A2A Bus es el canal para todo esto.

## Estado compartido

Archivo: `.claude/a2a-state.json`

```json
{
  "version": 1,
  "sessionId": "current-session-id",
  "messages": [
    {
      "id": "msg-001",
      "timestamp": "2026-04-10T12:00:00Z",
      "sender": "solution-architect",
      "recipient": "backend-platform-engineer",
      "type": "contract",
      "payload": {
        "interfaces": "// TypeScript interfaces here",
        "endpoints": ["/api/recommendations"],
        "schemas": ["Recommendation"]
      },
      "status": "delivered"
    }
  ],
  "contracts": {
    "feat/pgvector-recommender": {
      "definedBy": "solution-architect",
      "consumers": ["database-engineer", "backend-platform-engineer"],
      "interfaces": "export interface RecommendationInput { ... }",
      "status": "active"
    }
  },
  "results": {
    "database-engineer": {
      "task": "Create embeddings table",
      "status": "completed",
      "files": ["prisma/migrations/xxx.sql", "lib/db/recommendations.db.ts"],
      "timestamp": "2026-04-10T12:05:00Z"
    }
  },
  "errors": [
    {
      "agent": "frontend-engineer",
      "error": "Cannot find module '@/lib/db/recommendations.db'",
      "severity": "blocking",
      "timestamp": "2026-04-10T12:10:00Z",
      "resolution": null
    }
  ],
  "lastUpdated": "2026-04-10T12:10:00Z"
}
```

## Comandos

### POST un mensaje

```
/a2a-bus post --from [agente] --to [agente|broadcast] --type [contract|result|error|request] --payload [json]
```

Ejemplo:
```
/a2a-bus post --from solution-architect --to broadcast --type contract --payload '{"interfaces": "...", "endpoints": ["/api/recs"]}'
```

### READ mensajes

```
/a2a-bus read --for [agente]        # mensajes dirigidos a este agente
/a2a-bus read --type [contract]     # todos los contratos activos
/a2a-bus read --all                 # todo el estado (solo Orquestador)
```

### STATUS del bus

```
/a2a-bus status                     # resumen: N mensajes, N contratos, N errores
```

### CLEAR (inicio de sesion)

```
/a2a-bus clear                      # limpia todo para nueva sesion
```

## Como lo usan los agentes

### Flujo tipico de un squad full-stack:

```
1. Orquestador: /a2a-bus clear (nueva sesion)

2. solution-architect termina:
   /a2a-bus post --from architect --to broadcast --type contract
   → payload: interfaces TS + schemas Prisma + endpoints

3. database-engineer lee contrato:
   /a2a-bus read --for database-engineer
   → ve el contrato del arquitecto
   → implementa la migracion
   /a2a-bus post --from database-engineer --to broadcast --type result
   → payload: archivos creados, migracion lista

4. backend-platform-engineer lee contrato + resultado DB:
   /a2a-bus read --for backend-platform-engineer
   → ve contrato + DB lista
   → implementa endpoints
   /a2a-bus post --from backend --to frontend-engineer --type result

5. frontend-engineer lee resultado backend:
   /a2a-bus read --for frontend-engineer
   → ve endpoints disponibles
   → implementa UI

6. Si hay error:
   /a2a-bus post --from frontend-engineer --to orchestrator --type error
   → Orquestador decide: self-heal, re-dispatch, o escalar
```

## Integracion con otros sistemas

| Sistema | Como se conecta |
|---|---|
| **agent-router** | Lee contratos activos para saber que agentes ya trabajaron |
| **auto-escalation** | Lee errores del bus para decidir escalacion |
| **agent-metrics** | Cuenta mensajes por agente para metricas de comunicacion |
| **session-handoff** | Guarda snapshot del bus al cerrar sesion |
| **self-heal** | Si un error en el bus es de tipo lint/tsc, intenta auto-repair |

## Reglas

1. Solo el Orquestador puede leer TODO (`--all`)
2. Agentes solo leen lo dirigido a ellos o broadcasts
3. Contratos son inmutables una vez publicados (versionarlos si cambian)
4. Errores blocking pausan la cadena hasta resolucion
5. El bus se limpia al inicio de cada sesion (/a2a-bus clear)
6. Maximo 50 mensajes por sesion (evitar bloat)
