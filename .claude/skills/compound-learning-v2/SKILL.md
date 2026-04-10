---
name: compound-learning-v2
description: Sistema de aprendizaje compuesto que auto-detecta patrones repetidos en el trabajo y genera nuevos skills, hooks, squads y reglas. Upgrade del self-improvement original.
user-invocable: true
model: opus
context: fork
argument-hint: "[scan|generate|history]"
---

# /compound-learning-v2 — Aprendizaje Compuesto Automatico

## Para que sirve

Despues de cada sesion productiva, este skill analiza lo que se hizo y detecta patrones que se pueden convertir en automatizaciones nuevas. Si algo se repite 3+ veces, deberia ser un skill/hook/squad, no trabajo manual.

## Comandos

- `/compound-learning-v2 scan` — Analiza sesion actual, detecta patrones
- `/compound-learning-v2 generate` — Crea artifacts desde patrones detectados
- `/compound-learning-v2 history` — Muestra lo aprendido en sesiones anteriores
- AUTOMATICO: se dispara al final de `/session-recap`

## Motor de deteccion de patrones

### 1. Patrones de archivos (File Clusters)

**Deteccion:** Analizar `git log --oneline -50` y agrupar archivos que siempre se editan juntos.

```bash
# Encontrar clusters de archivos co-editados
git log --oneline -50 --name-only | # ultimos 50 commits
  # agrupar archivos por commit
  # si 3+ archivos aparecen juntos en 3+ commits = cluster
```

**Output si detecta cluster:**
```
PATRON: Archivos [A, B, C] editados juntos en 4/50 commits
ACCION: Crear skill "cluster-[nombre]" que pre-carga estos 3 archivos
EJEMPLO: lib/db/orders.db.ts + app/api/orders/route.ts + components/checkout/OrderSummary.tsx
  → Skill: "order-flow" que carga todo el flujo de ordenes
```

### 2. Patrones de errores (Error Recurrence)

**Deteccion:** Leer historial de self-heal y agrupar errores por tipo.

```
Si el mismo tipo de error (ej: TS2304 en lib/db/) se reparo 3+ veces:
  → Agregar regla al self-heal classification table
  → O crear hook preventivo que valida antes de editar
```

**Output:**
```
PATRON: Error "Cannot find name 'logActivity'" reparado 3 veces en app/api/
ACCION: Agregar auto-import de logActivity en self-heal table
  O: Crear hook post-edit que verifica imports en app/api/**
```

### 3. Patrones de agentes (Agent Combinations)

**Deteccion:** Revisar agent-metrics y sesiones anteriores.

```
Si los mismos 3 agentes se usan juntos para el mismo tipo de tarea 3+ veces:
  → Crear nuevo squad preset en orchestrator-config.json
```

**Output:**
```
PATRON: database-engineer + backend-platform-engineer + test-writer usados juntos 4 veces para "nuevo endpoint con DB"
ACCION: Crear squad "api-endpoint-squad" en orchestrator-config.json
```

### 4. Patrones de verificacion (Verification Sequences)

**Deteccion:** Analizar secuencias de comandos que siempre se corren juntos.

```
Si la misma secuencia de verificacion se repite 5+ veces:
  → Crear hook que automatiza esa secuencia
```

**Output:**
```
PATRON: "npx prisma validate && npx prisma generate && npx tsc --noEmit" corrido 6 veces despues de editar schema
ACCION: Crear hook post-edit para schema.prisma que corre esta secuencia automaticamente
```

### 5. Patrones de ADR (Decision Recurrence)

**Deteccion:** Analizar ADRs creados y buscar patrones en las decisiones.

```
Si 3+ ADRs tienen la misma estructura de decision:
  → Crear template ADR especializado para ese tipo de decision
```

## Pipeline de generacion

```
1. DETECTAR — Escanear git log, agent-metrics, self-heal history, session state
     ↓
2. VALIDAR — El patron es genuino? (>=3 ocurrencias, no coincidencia)
     ↓
3. DRAFT — Generar el artifact (skill/hook/squad/regla)
     ↓
4. PREVIEW — Mostrar al Orquestador para review
     ↓
5. CREAR — Escribir el archivo en el lugar correcto
     ↓
6. REGISTRAR — Actualizar CLAUDE.md, orchestrator-config.json, MEMORY.md
     ↓
7. REPORTAR — Mostrar a Brandon: "Aprendi X, cree Y"
```

## Tipos de artifacts generados

| Patron detectado | Artifact generado | Donde va |
|---|---|---|
| Archivos co-editados 3+ veces | Skill con pre-carga | `.claude/skills/[nombre]/SKILL.md` |
| Error reparado 3+ veces | Regla en self-heal table | `.claude/skills/self-heal/SKILL.md` (edit) |
| Agentes usados juntos 3+ veces | Squad preset | `.claude/agents/[nombre]-squad.md` |
| Verificacion repetida 5+ veces | Hook automatico | `.claude/hooks/[nombre].mjs` |
| Decision ADR repetida 3+ veces | Template ADR | `docs/adr/templates/[nombre].md` |
| Memoria actualizada 5+ veces | Consolidacion de memoria | `~/.claude/projects/.../memory/` |

## Safety rails

1. **Nunca auto-commit** — presentar artifacts al Orquestador primero
2. **Nunca overwrite** — solo crear NUEVOS o PROPONER updates
3. **Solo aprender de exitos** — ignorar tareas que fallaron o se revirtieron
4. **Rate limit:** maximo 3 artifacts nuevos por sesion
5. **Validacion minima:** 3 ocurrencias del patron (no 1 ni 2)
6. **No aprender de archivos zona peligrosa** — esos tienen sus propios protocolos

## Formato de reporte

```markdown
## Compound Learning v2 — Reporte de sesion

### Patrones detectados
| # | Tipo | Patron | Ocurrencias | Confianza |
|---|---|---|---|---|
| 1 | File cluster | orders.db + orders/route + OrderSummary | 4/50 | Alta |
| 2 | Error recurrence | TS2304 logActivity en app/api/ | 3/20 | Media |
| 3 | Agent combo | db-eng + backend-eng + test-writer | 4/10 | Alta |

### Artifacts generados
| # | Tipo | Nombre | Estado |
|---|---|---|---|
| 1 | Skill | order-flow | DRAFT — pendiente review |
| 2 | Self-heal rule | auto-import-logActivity | APLICADO |
| 3 | Squad preset | api-endpoint-squad | DRAFT — pendiente review |

### Metricas de aprendizaje
- Patrones escaneados: 12
- Patrones validos (>=3 ocurrencias): 3
- Artifacts creados: 3
- Tasa de aprendizaje: 25% (3/12)
```

## Integracion

| Sistema | Conexion |
|---|---|
| `/session-recap` | Trigger automatico al final de sesion |
| `/self-improvement` | v1 del compound learning — v2 lo reemplaza con motor formal |
| `agent-metrics` | Fuente de datos para patron de agentes |
| `self-heal` | Destino de reglas aprendidas de errores |
| `orchestrator-config.json` | Destino de nuevos squad presets |
| `CLAUDE.md` | Se actualiza con nuevos skills/hooks registrados |

## Persistencia

Los patrones detectados se guardan en `.claude/learning/patterns.json`:
```json
{
  "patterns": [
    {
      "id": "pat-001",
      "type": "file_cluster",
      "files": ["a.ts", "b.ts", "c.ts"],
      "occurrences": 4,
      "firstSeen": "2026-04-08",
      "lastSeen": "2026-04-10",
      "artifactGenerated": "skill:order-flow",
      "status": "active"
    }
  ],
  "totalScanned": 50,
  "totalLearned": 3,
  "lastScan": "2026-04-10T12:00:00Z"
}
```
