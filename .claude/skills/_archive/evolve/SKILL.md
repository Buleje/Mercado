---
name: evolve
description: Sistema unificado de auto-evolucion + aprendizaje compuesto. Analiza rendimiento de agentes, detecta patrones repetidos, genera skills/hooks/squads nuevos, y auto-mejora prompts de agentes. Fusiona evolve + compound-learning-v2.
user-invocable: true
model: opus
context: fork
argument-hint: "[analyze|apply|scan|generate|history|reset]"
allowed-tools: Read, Edit, Write, Grep, Glob, Bash, Agent, TaskCreate, TaskUpdate
---

# /evolve — Auto-Evolucion + Aprendizaje Compuesto

## Que es

Un sistema dual que:
1. **Evoluciona agentes** — mejora sus prompts basado en datos de rendimiento
2. **Aprende patrones** — detecta repeticiones y genera automatizaciones nuevas

## Comandos

- `/evolve analyze` — Analiza rendimiento de agentes, propone mejoras a prompts
- `/evolve apply` — Aplica mejoras propuestas a agentes
- `/evolve scan` — Escanea sesion actual, detecta patrones repetidos
- `/evolve generate` — Crea artifacts (skills/hooks/squads) desde patrones
- `/evolve history` — Historial de evoluciones + aprendizajes
- `/evolve reset [agente]` — Revierte agente a version original

## PARTE 1: Evolucion de Agentes

### Fuentes de datos
- **agent-metrics** — tasa exito, tokens, tiempo por agente
- **self-heal history** — errores recurrentes por agente
- **A2A bus** — problemas de comunicacion inter-agentes

### Algoritmo
```
Para cada agente con >=5 sesiones:
  1. Calcular: tasa exito, eficiencia, errores recurrentes
  2. Identificar: que resuelve bien, que falla, que escala
  3. Proponer: reglas nuevas, model upgrade, pre-checks
  4. Aplicar cambios al .md del agente
  5. Medir impacto en 3 sesiones siguientes
  6. Si mejoro: mantener. Si empeoro: revert automatico.
```

### Safety
- Nunca eliminar reglas existentes, solo agregar/refinar
- Max 3 cambios por agente por sesion
- Revert automatico si tasa exito baja >10%
- Min 5 sesiones de datos antes de proponer

## PARTE 2: Aprendizaje Compuesto (ex compound-learning-v2)

### Motor de deteccion

| Patron | Deteccion | Artifact generado |
|---|---|---|
| Archivos co-editados 3+ veces | git log clusters | Skill con pre-carga |
| Error reparado 3+ veces | self-heal history | Regla en self-heal |
| Agentes usados juntos 3+ veces | agent-metrics | Squad preset |
| Verificacion repetida 5+ veces | command history | Hook automatico |
| Decision ADR repetida 3+ veces | ADR analysis | Template ADR |

### Pipeline
```
DETECTAR (git log, metrics, self-heal)
  → VALIDAR (>=3 ocurrencias reales)
    → DRAFT artifact
      → PREVIEW para review
        → CREAR archivo
          → REGISTRAR en CLAUDE.md/config
```

### Safety
- Solo aprender de exitos (ignorar tareas fallidas)
- Max 3 artifacts nuevos por sesion
- Validacion minima: 3 ocurrencias
- No aprender de archivos zona peligrosa

## Persistencia

- Evoluciones: `.claude/evolution-log.json`
- Patrones: `.claude/learning/patterns.json`

## Integraciones

| Sistema | Rol |
|---|---|
| agent-metrics | Fuente de datos |
| agente `healer` | Fuente de errores + destino de reglas |
| session-recap | Trigger automatico al final |
| director-config.json | Destino de cambios model/routing/squads |
