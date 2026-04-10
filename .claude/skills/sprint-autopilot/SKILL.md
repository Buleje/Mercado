---
name: sprint-autopilot
description: Ejecuta un sprint completo de forma autonoma. Recibe una lista de features/fixes, descompone en tareas, lanza agentes en paralelo con worktrees, coordina dependencias via A2A, verifica cada entrega, y genera PRs. Un boton = sprint hecho.
user-invocable: true
model: opus
context: fork
argument-hint: "[sprint-items como lista o referencia a ROADMAP]"
---

# /sprint-autopilot — Ejecucion Autonoma de Sprint

## Que es

Le das una lista de cosas que hacer (features, fixes, mejoras) y el sistema:
1. Descompone cada item en tareas concretas
2. Identifica dependencias entre tareas
3. Lanza agentes en paralelo para lo independiente
4. Coordina lo dependiente via A2A Protocol
5. Verifica cada entrega (lint+tsc+test+build)
6. Auto-repara fallos (self-heal v2 + auto-escalation)
7. Crea commits atomicos por feature
8. Genera reporte final del sprint

**Un comando = sprint ejecutado.**

## Uso

```
/sprint-autopilot
  1. pgvector recommender para productos similares
  2. 7 URLs programaticas de zona para SEO
  3. WhatsApp concierge para compradores frecuentes
  4. Billing metering endpoint para tracking de uso
```

O referencia al roadmap:
```
/sprint-autopilot from:ROADMAP-24-WEEKS.md sprint:2
```

## Algoritmo completo

### FASE 0: Intake (30 segundos)

```
1. Parsear la lista de items del sprint
2. Para cada item:
   a. Clasificar tipo: feature | fix | refactor | infra
   b. Estimar complejidad: simple | moderada | alta | enterprise
   c. Identificar dominio: frontend | backend | database | integration | seo | fullstack
   d. Mapear a agent-router → agente/squad optimo
3. Output: Sprint Backlog estructurado
```

### FASE 1: Arquitectura (2-5 minutos)

```
1. Lanzar solution-architect para TODOS los items del sprint
2. El arquitecto produce:
   - Contrato global: interfaces TS compartidas entre items
   - DAG de dependencias entre items
   - Archivos que cada item tocara (para detectar conflictos)
   - Items que pueden ir en paralelo vs secuencial
3. Publicar contrato en A2A Bus (broadcast)
4. Validar: ningun item toca archivos de zona peligrosa sin squad designado
```

### FASE 2: Base de datos (si aplica, 3-5 minutos)

```
1. Si algun item necesita cambio de schema:
   a. Lanzar database-engineer + migration-planner
   b. Crear migracion SQL (NO ejecutar — solo generar)
   c. Publicar resultado en A2A Bus
2. Si no hay cambios de DB → skip directo a Fase 3
```

### FASE 3: Ejecucion paralela (5-20 minutos)

```
Para cada grupo de items independientes (sin deps cruzadas):

  Si item es simple (1-3 archivos, 1 area):
    → Agent(subagent_type=[especialista], run_in_background=true)
    
  Si item es moderado (4-10 archivos, 1-2 areas):
    → Agent(subagent_type=[especialista], isolation="worktree", run_in_background=true)
    
  Si item es alto/enterprise (10+ archivos, 3+ areas):
    → Agent(subagent_type=[squad], run_in_background=true)

Cada agente recibe:
  - Su porcion del contrato arquitectonico (de Fase 1)
  - Pre-task intel de su dominio (auto-cargado)
  - Resultados de DB si depende (de Fase 2)
  - Instruccion: "Al terminar, publica resultado en A2A Bus"
```

### FASE 4: Gating de dependencias (continuo)

```
Mientras hay items pendientes:
  1. Leer A2A Bus para resultados publicados
  2. Si un item dependiente tiene sus deps satisfechas:
     → Lanzar su agente con los resultados de las deps
  3. Si un agente falla:
     → Invocar auto-escalation (5 niveles)
     → Si no converge: marcar item como BLOCKED, seguir con otros
  4. Si todos los items de una ola estan completos:
     → Correr verificacion: npm run lint && npx tsc --noEmit && npm run test
     → Si falla: self-heal v2 sobre los archivos tocados
```

### FASE 5: Integracion (3-5 minutos)

```
1. Si se usaron worktrees:
   a. Para cada worktree con cambios:
      - Merge branch al branch principal (fast-forward o merge commit)
      - Si hay conflicto: lanzar refactoring-expert para resolver
   b. Cleanup de worktrees
2. Correr verificacion COMPLETA:
   npm run lint && npx tsc --noEmit && npm run test && npm run build
3. Si falla: self-heal v2 → auto-escalation si no converge
```

### FASE 6: Entrega (1-2 minutos)

```
1. Crear commit(s) atomicos:
   - 1 commit por item del sprint (ideal)
   - O 1 commit consolidado si los items estan muy entrelazados
2. Correr security-pentester sobre el diff total (Regla 14)
3. Si hay hallazgo CRITICAL → bloquear, reportar
4. Si pasa seguridad → push al remote
5. Generar Sprint Report
```

## Formato del Sprint Report

```markdown
## Sprint Autopilot Report

### Items completados
| # | Item | Tipo | Agente | Tiempo | Tests | Status |
|---|---|---|---|---|---|---|
| 1 | pgvector recommender | feature | database-engineer + backend | 8min | 12 new | DONE |
| 2 | 7 URLs programaticas | feature | seo-growth-strategist | 5min | 3 new | DONE |
| 3 | WhatsApp concierge | feature | integration-specialist | 12min | 8 new | DONE |
| 4 | Billing metering | feature | backend-platform-engineer | 6min | 5 new | BLOCKED |

### Verificacion global
- Lint: PASS
- TypeCheck: PASS  
- Tests: 28 new, 0 failures
- Build: PASS
- Security: PASS (0 critical, 1 low)

### Metricas
- Tiempo total: 23 minutos
- Agentes lanzados: 7
- Worktrees usados: 3
- Auto-repairs (self-heal): 2
- Escalaciones: 0
- Tokens estimados: ~180K

### Items bloqueados
| Item | Razon | Accion requerida |
|---|---|---|
| Billing metering | Stripe API key no configurada | Brandon: agregar STRIPE_SECRET_KEY |

### Commits
- c8eb69e feat(ai): pgvector recommender con embeddings
- a1b2c3d feat(seo): 7 URLs programaticas de zona
- d4e5f6g feat(whatsapp): concierge para compradores frecuentes

### Siguiente sprint sugerido
1. [item de mayor impacto pendiente]
2. [item bloqueado resuelto]
3. [mejora detectada por compound-learning]
```

## Limites de seguridad

1. **Nunca ejecutar migraciones de DB automaticamente** — solo generar SQL
2. **Nunca deploy automatico a produccion** — solo push a branch
3. **Maximo 8 agentes simultaneos** (performance + cost control)
4. **Cost cap: $15 por sprint** — si se excede, pausar y reportar
5. **Si >50% de items fallan** → abortar sprint, reportar al Orquestador
6. **Archivos zona peligrosa** → solo via squads especializados

## Integraciones

| Sistema | Rol |
|---|---|
| agent-router | Selecciona agente optimo por item |
| pre-task-intel | Carga contexto por dominio antes de cada item |
| a2a-bus | Coordinacion entre agentes durante ejecucion |
| auto-escalation | Maneja fallos de agentes |
| self-heal v2 | Repara errores de verificacion |
| agent-metrics | Trackea rendimiento por agente |
| parallel-work | Worktrees para items independientes |
| compound-learning-v2 | Aprende patrones del sprint para mejorar el siguiente |
