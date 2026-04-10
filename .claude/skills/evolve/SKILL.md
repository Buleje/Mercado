---
name: evolve
description: Sistema de auto-evolucion que analiza el rendimiento de agentes y auto-modifica sus prompts, reglas y configuraciones para mejorar resultados. Los agentes se hacen mas inteligentes con cada sesion.
user-invocable: true
model: opus
argument-hint: "[analyze|apply|history|reset]"
---

# /evolve — Auto-Evolucion de Agentes

## Que es

Un sistema que hace que los agentes mejoren automaticamente basado en datos reales:

```
Datos de rendimiento (agent-metrics)
  → Analizar patrones de exito/fallo
    → Identificar mejoras en prompts/config
      → Aplicar cambios al agente
        → Medir impacto en siguiente sesion
          → Repetir (loop infinito de mejora)
```

**Los agentes se vuelven mas inteligentes cada sesion sin intervencion.**

## Comandos

- `/evolve analyze` — Analiza rendimiento actual, propone mejoras
- `/evolve apply` — Aplica las mejoras propuestas
- `/evolve history` — Muestra historial de evoluciones
- `/evolve reset [agente]` — Revierte un agente a su version original
- AUTOMATICO: se ejecuta al final de `/session-recap` o `/compound-learning-v2`

## Fuentes de datos

### 1. Agent Metrics (cuantitativo)
```json
{
  "agent": "frontend-engineer",
  "sessions": 15,
  "successRate": 0.87,
  "avgTokens": 8200,
  "avgTime": 62,
  "commonFailures": ["snapshot mismatch", "missing import"],
  "bestAt": ["component creation", "responsive fixes"],
  "worstAt": ["state management bugs", "context providers"]
}
```

### 2. Self-Heal History (errores recurrentes)
```json
{
  "agent": "backend-platform-engineer",
  "recurringErrors": [
    {"type": "TS2304", "file": "app/api/*", "count": 5, "autoFixed": true},
    {"type": "missing tenantId", "file": "lib/db/*", "count": 3, "autoFixed": false}
  ]
}
```

### 3. Escalation History (cuando fallan)
```json
{
  "agent": "database-engineer",
  "escalations": 2,
  "escalationReasons": ["complex migration with rollback", "N+1 in nested query"],
  "resolvedBy": ["solution-architect", "orchestrator-direct"]
}
```

### 4. A2A Bus History (como se comunican)
```json
{
  "agent": "frontend-engineer",
  "contractsReceived": 8,
  "contractsMisunderstood": 1,
  "resultsRejected": 0
}
```

## Algoritmo de evolucion

### Paso 1: Analizar (por agente)

```
Para cada agente con >=5 sesiones de datos:

  1. Calcular metricas:
     - Tasa de exito (% tareas completadas sin escalacion)
     - Eficiencia (tokens usados / tarea completada)
     - Velocidad (tiempo promedio por tarea)
     - Errores recurrentes (top 3 por frecuencia)
     
  2. Identificar patrones:
     - Que tipo de tareas resuelve mejor?
     - Que tipo de tareas falla mas?
     - Que errores comete repetidamente?
     - Cuando necesita escalacion?
     
  3. Generar propuestas de mejora:
     - Agregar regla al prompt del agente para errores recurrentes
     - Ajustar model (Sonnet→Opus) para tareas donde falla
     - Agregar pre-checks antes de empezar (ej: "siempre verificar tenantId")
     - Reducir scope si el agente intenta hacer demasiado
```

### Paso 2: Proponer cambios

Formato de propuesta:

```markdown
## Evolucion propuesta: [agente]

### Metricas actuales
| Metrica | Valor | Target |
|---|---|---|
| Tasa exito | 87% | >95% |
| Tokens/tarea | 8.2K | <6K |
| Errores recurrentes | 3 | 0 |

### Cambios propuestos

1. **Agregar regla al prompt:**
   "SIEMPRE verificar que tenantId esta presente como primer parametro
   antes de escribir cualquier query en lib/db/. Si falta, agregarlo."
   
   Razon: 3 errores de missing tenantId en ultimas 5 sesiones.

2. **Cambiar model para state management:**
   Cuando la tarea involucra contexts/ o state management, usar Opus
   en vez de Sonnet.
   
   Razon: 2/3 fallos del agente fueron en state management.

3. **Agregar pre-check:**
   Antes de editar cualquier componente, correr:
   `npx tsc --noEmit -- [archivo]` para verificar estado base.
   
   Razon: 2 veces el agente "arreglo" algo que ya estaba roto.

### Impacto estimado
- Tasa exito: 87% → ~93%
- Errores recurrentes: 3 → ~1
- Tokens: puede subir 10% por pre-checks (trade-off aceptable)
```

### Paso 3: Aplicar cambios

```
1. Leer archivo del agente: .claude/agents/[nombre].md
2. Agregar las reglas nuevas en la seccion correspondiente
3. Actualizar orchestrator-config.json si cambio el model
4. Registrar la evolucion en .claude/evolution-log.json
5. NO eliminar reglas existentes — solo agregar/refinar
```

### Paso 4: Medir impacto

```
Despues de 3 sesiones con los cambios:
  1. Comparar metricas antes vs despues
  2. Si mejoro: mantener cambios, marcar como "proven"
  3. Si empeoro: revertir cambios (/evolve reset [agente])
  4. Si igual: mantener por 3 sesiones mas antes de decidir
```

## Evolution Log

Archivo: `.claude/evolution-log.json`

```json
{
  "evolutions": [
    {
      "id": "evo-001",
      "agent": "frontend-engineer",
      "date": "2026-04-10",
      "changes": [
        {"type": "rule_added", "content": "verificar tenantId..."},
        {"type": "model_change", "from": "sonnet", "to": "opus", "condition": "state-management"}
      ],
      "metricsBefore": {"successRate": 0.87, "avgTokens": 8200},
      "metricsAfter": null,
      "status": "applied",
      "provenAfterSessions": 0
    }
  ],
  "totalEvolutions": 1,
  "totalReverts": 0,
  "avgImprovementPercent": null
}
```

## Safety rails

1. **Nunca eliminar reglas existentes** — solo agregar o refinar
2. **Nunca cambiar el rol fundamental** del agente (un frontend-engineer no se convierte en backend)
3. **Maximo 3 cambios por agente por sesion** (evitar over-fitting)
4. **Revert automatico** si la tasa de exito baja >10% despues de cambios
5. **Backup automatico** del archivo original antes de editar
6. **Minimo 5 sesiones de datos** antes de proponer cambios (no reaccionar a 1 fallo)
7. **Brandon puede `/evolve reset [agente]`** para volver al original en cualquier momento

## Tipos de evoluciones

| Tipo | Ejemplo | Frecuencia |
|---|---|---|
| **Rule addition** | "Siempre verificar X antes de Y" | Comun |
| **Model upgrade** | Sonnet→Opus para tareas especificas | Moderada |
| **Pre-check addition** | "Correr tsc antes de editar" | Comun |
| **Scope restriction** | "No tocar archivos fuera de tu area" | Rara |
| **Tool preference** | "Usar Grep antes de Read para archivos grandes" | Moderada |
| **Error prevention** | "Si ves error X, la solucion es siempre Y" | Comun |

## Integraciones

| Sistema | Rol |
|---|---|
| agent-metrics | Fuente primaria de datos de rendimiento |
| self-heal | Fuente de errores recurrentes |
| auto-escalation | Fuente de fallos que necesitaron ayuda |
| a2a-bus | Fuente de problemas de comunicacion |
| compound-learning-v2 | Co-evolucion: learning genera skills, evolve mejora agentes |
| orchestrator-config.json | Destino de cambios de model/routing |

## Meta-evolucion

El sistema evolve TAMBIEN se auto-evalua:

```
Cada 10 sesiones:
  1. Cuantas evoluciones se aplicaron?
  2. Cuantas mejoraron metricas vs cuantas se revirtieron?
  3. El "hit rate" del sistema esta mejorando?
  4. Ajustar umbrales si es necesario (ej: subir minimo de 5 a 8 sesiones)
```

Si el hit rate de evoluciones exitosas es >80%, el sistema esta funcionando.
Si es <50%, algo esta mal — reducir agresividad de cambios.
