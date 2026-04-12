---
name: auto-escalation
description: Protocolo de escalacion automatica cuando un agente falla, se estanca o produce output de baja calidad. Escala a agentes mas capaces, squads o al Orquestador sin intervencion humana.
user-invocable: true
model: sonnet
---

# /auto-escalation — Escalacion automatica de agentes

## Triggers de activacion

1. Agente termina con error (exit code != 0 o output vacio)
2. Agente tarda >5 min sin output (stall detection)
3. Output no pasa verificacion (tsc/lint/test fallan despues)
4. Agente reporta "no puedo resolver esto"

## Cadena de escalacion

```
Nivel 1: Agente especialista (Sonnet)
  ↓ falla
Nivel 2: Mismo agente con modelo Opus
  ↓ falla
Nivel 3: Squad especializado (3-4 agentes coordinados)
  ↓ falla
Nivel 4: Orquestador Principal toma control directo
  ↓ falla
Nivel 5: Escalar a Brandon con reporte completo
```

## Mapa de escalacion por agente

| Agente que falla | Nivel 2 (Opus) | Nivel 3 (Squad) |
|---|---|---|
| frontend-engineer | frontend-engineer (opus) | full-stack-squad |
| backend-platform-engineer | backend-platform-engineer (opus) | full-stack-squad |
| database-engineer | database-engineer (opus) | database-engineer + solution-architect |
| integration-specialist | integration-specialist (opus) | integration + backend + qa |
| test-writer | test-writer (opus) | qa-reliability-engineer + bug-hunter |
| bug-hunter | bug-hunter (opus) | security-squad |
| security-auditor | security-pentester (opus) | security-squad |
| seo-growth-strategist | seo-growth-strategist (opus) | seo + frontend + performance |
| performance-engineer | performance-engineer (opus) | performance-squad |

## Protocolo al detectar fallo

1. Capturar output del agente fallido
2. Clasificar fallo: **ERROR** (stack trace/exit!=0) | **STALL** (>5min) | **QUALITY** (tsc/lint/test) | **SURRENDER** (agente dice "no puedo")
3. Preparar contexto: output anterior, error, diff, intentos previos
4. Lanzar siguiente nivel con contexto enriquecido

## Integracion con self-heal

Si fallo tipo QUALITY: intentar `/self-heal` v2 primero (3+2 intentos). Si converge -> no escalar. Si no -> escalar.

## Integracion con agent-metrics

Cada escalacion registra: agente fallido, tipo fallo, nivel alcanzado, tokens gastados, tiempo total. Alimenta metricas de mejora.

## Limites

- Max 3 niveles de escalacion por tarea (evitar loops)
- Nivel 5 (Brandon): SIEMPRE revertir cambios del agente fallido
- Tareas triviales (1 archivo, 1 linea): rehacerlas desde cero, no escalar
- Cost cap: >$5 en tokens -> parar y escalar a Brandon
