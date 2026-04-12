---
name: a2a-bus
description: Bus de comunicacion inter-agentes. Permite que agentes se pasen contratos, resultados y errores via un estado compartido (.claude/a2a-state.json). El Orquestador lee todo; cada agente lee solo lo dirigido a el.
user-invocable: true
model: sonnet
---

# /a2a-bus — Bus de Comunicacion Inter-Agentes

Canal de comunicacion para squads/parallel-work: contratos, resultados, errores entre agentes.

## Persistencia cross-session (2026-04-11)

El estado A2A se guarda en 2 lugares:
- **Sesion activa:** `.claude/a2a-state.json` (volátil, se usa durante la sesion)
- **Persistente:** `~/.claude/projects/C--Users-Usuario/memory/a2a-last-state.json` (sobrevive entre sesiones)

Al inicio de cada sesion: si `a2a-state.json` no existe pero `a2a-last-state.json` sí, restaurar contratos con `status: "carried-over"`.
Al final de cada sesion: copiar contratos activos a `a2a-last-state.json`.

## Estado compartido

Archivo: `.claude/a2a-state.json`

Estructura top-level: `{ version, sessionId, messages[], contracts{}, results{}, errors[], lastUpdated }`

- **messages[]**: `{ id, timestamp, sender, recipient, type, payload, status }`
- **contracts{}**: keyed by feature — `{ definedBy, consumers[], interfaces, status }`
- **results{}**: keyed by agent — `{ task, status, files[], timestamp }`
- **errors[]**: `{ agent, error, severity (blocking|warning), timestamp, resolution }`

## Comandos

### POST un mensaje
```
/a2a-bus post --from [agente] --to [agente|broadcast] --type [contract|result|error|request] --payload [json]
```

### READ mensajes
```
/a2a-bus read --for [agente]     # mensajes dirigidos a este agente
/a2a-bus read --type [contract]  # todos los contratos activos
/a2a-bus read --all              # todo el estado (solo Orquestador)
```

### STATUS
```
/a2a-bus status                  # resumen: N mensajes, N contratos, N errores
```

### CLEAR
```
/a2a-bus clear                   # limpia todo para nueva sesion
```

## Flujo tipico (squad full-stack)

1. Orquestador: `clear` (nueva sesion)
2. Architect: post broadcast contract (interfaces + schemas + endpoints)
3. DB Engineer: read contract → implementa → post broadcast result (archivos creados)
4. Backend: read contract + DB result → implementa → post result a frontend
5. Frontend: read backend result → implementa UI
6. En error: post error a orchestrator → decide: self-heal, re-dispatch, o escalar

## Integracion

| Sistema | Conexion |
|---|---|
| **agent-router** | Lee contratos activos para saber que agentes ya trabajaron |
| **auto-escalation** | Lee errores del bus para decidir escalacion |
| **agent-metrics** | Cuenta mensajes por agente |
| **session-handoff** | Guarda snapshot del bus al cerrar sesion |
| **self-heal** | Si error es lint/tsc, intenta auto-repair |

## Reglas

1. Solo el Orquestador puede leer TODO (`--all`)
2. Agentes solo leen lo dirigido a ellos o broadcasts
3. Contratos son inmutables una vez publicados (versionar si cambian)
4. Errores blocking pausan la cadena hasta resolucion
5. Bus se limpia al inicio de cada sesion
6. Maximo 50 mensajes por sesion (evitar bloat)
