---
name: ultra-impact
description: Modo ultra-high-effort para cambios grandes multi-archivo que requerirían semanas de trabajo humano. Aplica todos los patrones probados de una sesión pico — systematic debugging, parallel dispatch, atomic commits, baseline pre/post, worktree isolation, danger zone respect — sin sacrificar calidad profesional. Usar cuando Brandon diga "ultra-impact", "ambicioso máximo", "trabajo de varios empleados", "mega refactor", o cuando un sub-proyecto toque ≥5 archivos y ≥2 capas del stack.
user-invocable: true
model: opus
allowed-tools: Read, Edit, Write, Grep, Glob, Bash, Agent, TaskCreate, TaskUpdate, SendMessage
context: fork
---

# /ultra-impact — Ejecución de Alto y Ultra-Alto Impacto

Cuando la tarea es del tamaño de "esto le tomaría varias personas varios días", este skill activa el pipeline que probó Brandon+Claude en la sesión 2026-04-16 (27 commits, TSC 83→0, tests 71→27, 292 tests nuevos verdes, 1 sub-proyecto cerrado al 90%+).

## Regla de oro

> **Velocidad SIN sacrificar calidad.** Cada fix atomico. Cada commit revertible. Cada zona de peligro respetada. La ambición es en el ALCANCE, no en el atajo.

## Pre-flight — SIEMPRE antes de arrancar

Ejecutar en paralelo en un solo mensaje:

```
1. git status --short | wc -l        # cuántos archivos dirty
2. git log --oneline -10              # últimos commits
3. npx tsc --noEmit 2>&1 | grep -c "error TS"   # errores TS baseline
4. cat CLAUDE.md | head -30            # reglas vigentes
5. ls docs/adr/ | tail -10              # ADRs recientes
```

Si `git status` > 20 archivos → **Phase 1 primero (cleanup)** antes de cualquier feature work. No se pinta encima de paredes agrietadas.

## Las 4 fases del systematic debugging (obligatorias)

### Phase 1 — Cleanup workspace (Iron Law: entorno limpio)

```
a. gitignore lo que no debería estar versionado (screenshots, .claude/state, etc.)
b. git clean -fX para ignored files acumulados en disk
c. Commits atómicos por bloque temático (max 7-10 archivos c/u, nombres conventional-commits)
d. Resultado: git status limpio. Sin excepciones.
```

### Phase 2 — TSC errors (0 tolerancia)

```
a. Capturar baseline: npx tsc --noEmit > reports/baseline/YYYY-MM-DD/tsc.txt
b. Agrupar errores por causa raíz en CLUSTERS (no por archivo)
c. Cada cluster = 1 commit atómico
d. Verificar delta antes de cada commit (npx tsc --noEmit | grep -c "error TS")
e. Resultado: tsc sin errores. El TD-026 gate debe pasar.
```

### Phase 3 — Tests rojos (1 causa raíz por cluster)

```
a. Para cada cluster de fallos, identificar la CAUSA RAÍZ (no arreglar síntomas)
b. Mockear lo que falta (prisma, sentry, etc) — global en vitest.setup.ts si aplica a 3+ files
c. Refactor cuando tiene sentido: ej. crear método en DB class para que tests pasen tal cual
d. Zona de peligro (checkout/**, orders.db.ts) → DELEGAR a squad, NO tocar solo
e. Resultado: 0 tests de assertion fallando fuera de zona de peligro
```

### Phase 4 — CI gates + baseline final

```
a. Confirmar TD-026 gate activo y pasando
b. Capturar baseline final (tsc, test, lint, build)
c. Update spec con delta cuantitativo
d. Status del programa actualizado
```

## Patrones de paralelismo — 3-8x velocidad

### Parallel dispatch (1 mensaje, N Agents)

Usar cuando: N tareas INDEPENDIENTES sin shared state.

```javascript
// 1 mensaje con:
Agent({ subagent_type: "frontend-engineer", description: "Migrate admin modules", prompt: "..." })
Agent({ subagent_type: "backend-platform-engineer", description: "Add DB method", prompt: "..." })
Agent({ subagent_type: "qa-reliability-engineer", description: "Fix test mocks", prompt: "..." })
```

### TeamCreate + SendMessage (sprint coordinado con memoria)

Usar cuando: trabajo multi-turno donde los mismos agentes necesitan retomar contexto.

```javascript
TeamCreate({ name: "error-hunt-squad", members: [backend, frontend, qa] })
// Después de cada turno:
SendMessage({ to: "backend", content: "continuá con el siguiente cluster" })
```

### Background agents para tareas largas

Usar cuando: task > 5 min y main thread tiene otro trabajo útil.

```javascript
Agent({ run_in_background: true, subagent_type: "Explore", description: "Deep dive X", prompt: "..." })
// main sigue trabajando, notificación llega al terminar
```

### Worktree isolation para refactors peligrosos

Usar cuando: cambios grandes que podrían romper estado compartido.

```javascript
Agent({ isolation: "worktree", subagent_type: "frontend-engineer", ... })
// Si el agente no hace cambios, worktree se limpia solo — rollback gratis
```

## Model selection — cuándo usar cada uno

| Tarea | Modelo | Razón |
|---|---|---|
| Arquitectura, debugging duro, decisiones irreversibles | `claude-opus-4-7` (1M) | Razonamiento profundo |
| Feature bien especificada, implementación mecánica | `claude-sonnet-4-6` | 3-5x más barato, casi igual calidad |
| Formateo, rename, grep mental | `claude-haiku-4-5` | 10x más barato, instantáneo |
| Peer review cruzado | Modelo ≠ al implementador | Evita sesgos auto-consumidos |

## Extended thinking — cuándo "romper el vidrio"

| Cuándo | Config | Costo |
|---|---|---|
| Root cause no obvio, >3 hipótesis | `thinking: { enabled: true, budget: 10000 }` | Alto |
| Migración compleja, zona de peligro | `budget: 32000` + Opus 4.7 + 1M ctx | Muy alto |
| Tool use iterativo >10 steps | `interleaved_thinking: true` | Medio |

**No usar extended thinking para** formateo, búsquedas simples, o implementaciones mecánicas — es desperdicio.

## Commits atómicos — reglas duras

1. **Cada commit revertible independientemente** via `git revert`
2. **Mensaje Conventional Commits** (`feat|fix|docs|refactor|perf|test|chore`)
3. **Subject en lowercase** (pasa commitlint)
4. **Body con delta cuantitativo** cuando aplique: "TSC errors: 83 → 66"
5. **Footer con Co-Authored-By** cuando el asistente contribuyó
6. **No amendar** commits ya committeados — crear nuevo commit siempre
7. **Pre-commit gates** nunca se saltan con `HUSKY=0` excepto en remediación explícita documentada

## Danger zone — qué NO tocar solo

Per CLAUDE.md del proyecto:

| Zona | Por qué | Quién la toca |
|---|---|---|
| `components/checkout/**`, `CheckoutModal.tsx` | Pagos, idempotency | checkout-squad |
| `lib/db/orders.db.ts`, `app/api/orders/**` | State machine | checkout-squad + squad security |
| `lib/auth/role-permissions.ts` | RBAC 26×6 | backend + security |
| `proxy.ts`, `lib/middleware/**` | Auth + CSP | devops + security |
| `prisma/schema.prisma` | 177 modelos, DIRECT_URL | database-engineer |

**Si una tarea toca estas zonas, dispatch squad. Nunca solo.**

## Baseline pre/post — prueba cuantitativa

Para cada sub-proyecto mayor:

```
reports/baseline/YYYY-MM-DD-<nombre>/
├── tsc.txt
├── test.txt
├── lint.txt
├── build.txt
└── scope.md (metricas especificas del sub-proyecto)
```

Y después:

```
reports/baseline/YYYY-MM-DD-<nombre>-final/
├── tsc.txt
├── test.txt
└── delta.md (antes/después con números)
```

Sin baseline **no hay prueba de mejora**. Sin prueba, el programa no convence.

## Anti-patrones — lo que NO hacer en ultra-impact

| Anti-patrón | Costo | Alternativa |
|---|---|---|
| Subagent para leer 1 archivo | 20-50% overhead | `Read` directo |
| Múltiples mensajes para tools independientes | Serial en vez de parallel | 1 mensaje, N tools |
| Opus 4.7 para formateo | 10x caro innecesariamente | Haiku 4.5 |
| Inventar nombres de skill/agent | Fallo al invocar | Solo los listados en system-reminder |
| Commit gigante "fix everything" | Imposible de revertir | 1 commit por cluster |
| Modificar danger zone sin squad | Bugs en producción | Squad + canary deploy |
| Skip del TD-026 gate | Degradación silenciosa | Arreglar el error ANTES de commit |
| `rm -rf` para limpiar | Bash guard lo bloquea | `git clean -fX` o `git rm --cached` |

## Checklist ultra-impact

Antes de declarar "listo":

- [ ] Git status limpio
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm test` sin fallos de assertion (danger zone exceptuada con deferral documentado)
- [ ] Baseline pre/post capturado y committeado
- [ ] Spec actualizado con delta
- [ ] Roadmap maestro actualizado con estado del sub-proyecto
- [ ] Peer review (ideal: subagent code-reviewer)
- [ ] Todos los commits con Conventional Commits válidos
- [ ] Ningún `HUSKY=0` bypass sin justificación en el commit message

## Invocación

```
/ultra-impact [descripción del trabajo]
/ultra-impact dispatcha checkout-squad para cerrar los orders tests
/ultra-impact arranca sub-proyecto #1 design system
```

O simplemente decir "ambicioso máximo" / "ultra impact" / "trabajo de varios empleados" en contexto.

## Registro histórico — sesión de referencia

**2026-04-16**: Sub-proyecto #3 Error Hunt ejecutado con este patrón:
- 101 → 0 archivos dirty
- 83 → 0 errores TypeScript (5 clusters)
- 71 → 27 tests fallando (44 arreglados; 27 restantes en danger zone)
- 2543 → 2835 tests passing (+292)
- 27 commits atómicos, todos con mensaje Conventional Commits
- 1 subagent dispatch (frontend-engineer para 17 admin modules)
- 1 subagent dispatch (Code Reviewer para spec review)
- 0 regresiones introducidas
- 0 uso de HUSKY=0 bypass

Ese es el baseline de "alto impacto con calidad profesional".
