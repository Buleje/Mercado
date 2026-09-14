# Agentes de Buleje (Bodega San Martín) — estado real 2026-09-14

> Reescrito 2026-09-14 sobre telemetría (`.claude/metrics/agents.jsonl`, 179 despachos entre
> 09-03 y 09-14) y el changelog de Claude Code hasta **v2.1.270**. La versión anterior describía
> un Hub & Spoke de 14 agentes con Director y TeamCreate que **no se usaba** (0 despachos en 5
> meses; `TeamCreate` ya ni existe en el CLI). Historia: `docs/adr/057-hub-spoke-agent-redesign.md`
> y `.claude/_archive-swarm/`.

## Cómo se despacha hoy (medido)

| Vía | Despachos 09-03→09-14 | Cuándo |
|---|---|---|
| `Workflow` (`audit-verificado` y fan-outs con verificador) | 62 | «auditá / migrá / revisá X»: cada hallazgo pasa por un refutador |
| `general-purpose` **con nombre** (`aserrio-backend`, `rrhh-frontend`, `revisor-lote-3`…) | ~110 | construir una feature grande o un lote; el nombre sirve para `SendMessage` |
| Agent defs de `.claude/agents/` | pocos | cuando el rol pesa: `security` antes de mergear zona de peligro, `reviewer` con contexto fresco, `architect` para el contrato |
| `Explore` / `fork` | 1 / varios | búsqueda amplia de solo lectura / continuar la conversación en paralelo |

**El router es el hilo principal** (Fast-Path ADR-058: HOTFIX → 1 subagente; FEATURE → 1-2;
AUDIT → Workflow; INITIATIVE → Workflow por fases; DANGER → + `security`). No hay `director`.

## Los 8 agent defs (`.claude/agents/*.agent.md`)

| Agente | Modelo | Herramientas | Preload (`skills:`) | Para qué |
|---|---|---|---|---|
| `architect` | inherit | lectura + Bash | multi-tenant-guard | contrato (tipos, Zod, Prisma + plan de migración, rutas, DB class, ADR) antes de construir |
| `backend` | inherit | edición + Bash | multi-tenant-guard | rutas, DB classes, RBAC, integraciones, IA |
| `frontend` | inherit | edición + Bash + **Playwright MCP** | bsm-design-system, bsm-typography-rules | UI al estándar del DS, screenshot light+dark 1280/400 |
| `database` | inherit | edición + Bash | multi-tenant-guard, db-sanity | schema, migraciones (`resolve --applied`), índices, drift |
| `tester` | inherit | edición + Bash + **Playwright MCP** | — | Vitest, VRT, e2e por el camino del usuario, k6 |
| `reviewer` | inherit | edición + Bash | multi-tenant-guard | review / diagnose / refactor con contexto fresco; refuta antes de reportar |
| `security` | inherit | lectura + Bash | multi-tenant-guard | OWASP + pentest contra el dev server; veto en críticos |
| `healer` | sonnet (effort medium) | edición + Bash | — | gates rojos → fix mínimo, 3 intentos |

Decisiones de frontmatter (v2.1.270):
- **`model: inherit`**: corren en el modelo de la sesión (el que Brandon elige con `/model`). Antes estaban clavados
  en `sonnet` y por eso se los esquivaba con `general-purpose`. Para trabajo mecánico se baja
  por invocación (`model: haiku|sonnet` en el `Agent` call), no en el def.
- **Sin `maxTurns`** en los constructores (una feature real usa 400-500 tool calls; el tope de 40
  cortaba a mitad). `architect`/`security` 40, `reviewer` 60, `healer` 20 — al llegar, el
  resultado vuelve marcado parcial y se continúa con `SendMessage`.
- **Sin `permissionMode`**: heredan el del hilo principal (bypass/acceptEdits según cómo arrancó
  Brandon); antes `acceptEdits` fijo hacía subir prompts de Bash al hilo.
- **`experimental.cacheTtl: 1h`** en los de larga duración (corridas de 2 h con cache caliente).
- **`memory: project`** en todos: `.claude/agent-memory/<nombre>/MEMORY.md` (200 líneas / 25 KB
  cargadas al arrancar). Los defs piden leerla al empezar y escribirla al terminar.
- **Sin `isolation: worktree`** (medido 2026-08-03: en ramas largas el worktree branchea de base
  vieja y se pierde lógica).

## Contexto que recibe TODO subagente

El hook `SubagentStart` → `.claude/hooks/subagent-start-context.mjs` inyecta en cada subagente
(menos `Explore`/`Plan`) el bloque que antes solo llevaban los defs: perfil de Brandon (ruta
absoluta de la memoria), tenant real vs QA, «nunca worktree», reglas duras, gates y el formato
del reporte. Un subagente **no** hereda la auto-memoria del hilo principal: por eso van rutas.

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0` (settings.json): un subagente con `name` es un
**subagente** (background, `skills:` del def, resumible con `/resume`), no un teammate
in-process (que corría en foreground, ignoraba `skills:` y no sobrevivía a un `/resume`).
El nombre sigue siendo dirección de `SendMessage`; los subagentes nombrados pueden hablarse.
Revertir a `"1"` si algún día hace falta un equipo con lista de tareas compartida.

## Protocolo de reporte (todos)

```
Qué cambió: archivo:línea · Evidencia: comando + salida · Qué queda / bloqueos
Para memoria: patrón o gotcha que un futuro agente no sabría (si no tiene memoria propia)
```

## Gates

| Momento | Gate | Si falla |
|---|---|---|
| durante | `tsgo --noEmit` (pre-check) · `npm run lint:fast` | el propio agente |
| antes de «listo» | `tsc --noEmit` · `npm run lint` · `npx vitest run <área>` · navegador/curl | `healer` (3 intentos) → hilo principal |
| Stop del hilo principal | `stop-evidence-gate.mjs` (determinista): edits sin evidencia ⇒ bloquea | volver a verificar |
| zona de peligro | `security` en modo audit antes del merge | veto |

## Archivos

- Defs activos: `.claude/agents/*.agent.md` (validar: `claude plugin validate .claude/agents/`)
- Archivados (no se cargan): `.claude/_agents-archive/` (director, observer, deployer, optimizer,
  integrator, data-qa, specialists…) · `.claude/_archive-swarm/` (Hub&Spoke, team-templates,
  CONTRACTS/REPORTS/REVIEWS de abril)
- Telemetría: `.claude/metrics/agents.jsonl` (hook `subagent-cost-log.mjs`), `.claude/agent-metrics.json`
- Workflows: `.claude/workflows/audit-verificado.js`
