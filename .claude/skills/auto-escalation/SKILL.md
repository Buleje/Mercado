---
name: auto-escalation
description: Protocolo de escalacion automatica cuando un agente falla, se estanca o produce output de baja calidad. Escala a agentes mas capaces, squads o al Orquestador sin intervencion humana.
user-invocable: true
model: opus
---

# /auto-escalation — Escalacion automatica de agentes

## Cuando se activa

1. Un agente termina con error (exit code != 0 o output vacio)
2. Un agente tarda >5 minutos sin producir output (stall detection)
3. El output de un agente no pasa verificacion (tsc/lint/test fallan despues)
4. Un agente reporta "no puedo resolver esto" en su output

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

## Protocolo de escalacion

### Al detectar fallo de Nivel 1:

```
1. Capturar output del agente fallido
2. Identificar tipo de fallo:
   - ERROR: output contiene stack trace o exit code != 0
   - STALL: >5 min sin output nuevo
   - QUALITY: output no pasa tsc/lint/test
   - SURRENDER: agente dice "no puedo"
3. Preparar contexto para siguiente nivel:
   - Output del agente anterior (completo)
   - Error/razon del fallo
   - Archivos que toco (diff)
   - Lo que ya intento
4. Lanzar siguiente nivel con contexto enriquecido
```

### Formato de handoff entre niveles:

```markdown
## Escalacion Nivel [N-1] → Nivel [N]

**Agente anterior:** [nombre] (modelo: [sonnet/opus])
**Razon de escalacion:** [ERROR/STALL/QUALITY/SURRENDER]
**Detalle:** [1-2 lineas]

**Output del agente anterior:**
[resumen de lo que hizo/intento]

**Error capturado:**
[stack trace o descripcion]

**Archivos tocados:**
[lista de archivos con diffs parciales]

**Tu mision:** Resolver lo que el agente anterior no pudo.
Tienes TODO su contexto. No repitas lo que ya intento.
Enfocate en lo que fallo y por que.
```

## Integracion con self-heal v2

Si el fallo es de tipo QUALITY (tsc/lint/test fallan despues del agente):
1. Primero intentar `/self-heal` v2 (3 basicos + 2 especialistas)
2. Si self-heal converge → no escalar
3. Si self-heal no converge → escalar al siguiente nivel

## Integracion con agent-metrics

Cada escalacion registra:
- Agente que fallo
- Tipo de fallo
- Nivel alcanzado para resolver
- Tokens gastados en la escalacion
- Tiempo total de la escalacion

Esto alimenta las metricas para saber que agentes necesitan mejora.

## Limites

- Maximo 3 niveles de escalacion por tarea (evitar loops)
- Si llega a Nivel 5 (Brandon), SIEMPRE revertir cambios del agente fallido
- Nunca escalar tareas triviales (1 archivo, 1 linea) — mejor rehacerlas desde cero
- Cost cap: si la escalacion ya gasto >$5 en tokens, parar y escalar a Brandon
