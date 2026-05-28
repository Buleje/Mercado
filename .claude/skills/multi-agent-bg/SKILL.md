---
name: multi-agent-bg
description: |
  Despacho de N agentes en background con isolation worktree y SendMessage para
  inter-comunicación. Patrón #5 de [[agentic-loops]] expuesto como slash command.
  Usar cuando hay 3+ tareas independientes que pueden correr en paralelo (audits
  por dominio, refactors módulo-por-módulo, scans cruzados). Reduce wall-clock
  3-5x vs serial. Brandon dice: "agent team", "fan out", "despliega N agents",
  "audit paralelo", "multi-agent".
user-invocable: true
model: opus
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, TaskCreate, TaskUpdate, SendMessage
argument-hint: "[N=3-8] [tipo-tarea]"
---

# /multi-agent-bg — Fan-out de agentes en background

**Qué hace (Feynman):** Un equipo de 5 personas cada una con su escritorio aparte (worktree) recibe una tarea independiente. Pueden mandarse mensajes ("oye, encontré X, ojo con eso"). Vos seguís trabajando. Cuando todos terminan, llega un mensaje y un sexto agente sintetiza el output combinado.

## Cuándo dispararse

| Caso | Vale | No vale |
|---|---|---|
| Audit security + perf + a11y en paralelo | ✅ | ❌ Si son secuenciales (perf depende de fix de security) |
| Refactor 5 módulos independientes | ✅ con worktree | ❌ Si comparten archivos sin worktree |
| Migrar 200 endpoints a withRlsTenant() en 4 batches | ✅ | ❌ Si la migration tiene orden lógico |
| Indexar 10K archivos en RAG | ✅ | — |
| Bug fix de 1 archivo | ❌ overkill | — |

## Anatomía del despliegue

```
                  ┌──────────────┐
   Tarea          │  Coordinator │  (vos / main agent — Opus)
                  └──────┬───────┘
              decompose en N sub-tareas independientes
        ┌──────┬─────────┼──────────┬──────┐
        ▼      ▼         ▼          ▼      ▼
      agent1 agent2   agent3     agent4  agent5
     (BG)   (BG)     (BG)       (BG)    (BG)
        │      │         │          │      │
        │      └────┐ SendMessage ┌──┘      │
        │           ▼             ▼         │
        │       agent3 recibe hallazgos     │
        ▼                                   ▼
     archivo                            archivo
   /tmp/r1.json                       /tmp/r5.json
        └─────────────────────┬─────────────────┘
                              ▼
                       ┌──────────────┐
                       │ Synthesizer  │ (Opus, NO BG, lee 5 archivos)
                       └──────┬───────┘
                              ▼
                       reporte final ranked
```

## Template canónico (copy-paste)

```ts
// 1) Decompose (Coordinator, sync — vos)
const subtasks = [
  { name: "audit-security",  dir: "lib/auth/",       agent: "Security Auditor" },
  { name: "audit-perf",       dir: "lib/db/",         agent: "performance-engineer" },
  { name: "audit-a11y",       dir: "components/",     agent: "dark-mode-auditor" },
  { name: "audit-deps",       dir: ".",                agent: "Security Pentester" },
];

// 2) Fan-out paralelo (BG, mismo mensaje)
const handles = [];
for (const st of subtasks) {
  const h = await Agent({
    description: st.name,
    subagent_type: st.agent,
    run_in_background: true,
    name: st.name,                          // referenciable via SendMessage
    isolation: editing ? "worktree" : undefined,
    prompt: `
Tu tarea: audit READ-ONLY de ${st.dir}.

Output: escribir /tmp/multi-agent/${st.name}.json con:
{
  "summary": "<3 líneas>",
  "critical": [...],
  "high": [...],
  "medium": [...],
  "stats": { "files_scanned": N, "time_ms": M }
}

Si encontrás algo que afecte a otros agents (ej. archivo X aparece en
varios dominios), mandá SendMessage al agent relevante.

Reporta SOLO el path del archivo + 1 línea de resumen al final.
    `,
  });
  handles.push(h);
}

// 3) Main agent sigue trabajando (NO sleep, NO poll).
//    El harness notifica automático cuando cada agent termina.

// 4) Cuando todos terminaron → Synthesizer (foreground, NO BG)
await Agent({
  description: "Synthesize multi-agent audit",
  subagent_type: "general-purpose",
  prompt: `
Leé los 4 archivos en /tmp/multi-agent/ y producí un reporte priorizado.

Formato:
| # | Tipo | Severidad | Archivo | Fix sugerido | Responsable |

Top-10 críticos primero. Después tabla completa.
Tiempo total acumulado y ahorro vs serial.
  `,
});
```

## Reglas duras

1. **NUNCA dos agents BG editando mismo archivo sin worktree.** Conflicto garantizado.
2. **Output por archivo, no por stdout.** Stdout limitado, archivo es retomable.
3. **SendMessage solo para hallazgos cross-dominio.** No para "ya terminé".
4. **maxN = 8.** Más que eso = saturación + costo descontrolado.
5. **Siempre Synthesizer al final.** Sin él, queda info dispersa.
6. **isolation: "worktree"** SOLO si los agents editan código. Si solo leen, cwd normal (más rápido).

## Anti-patterns

1. Despachar 5 agents BG para tarea que requiere orden secuencial → conflictos + work perdido.
2. Pedirle al main agent que `poll` el status → contra-pattern, el harness notifica solo.
3. Agents sin nombre (`name`) → no podés SendMessage entre ellos.
4. Synthesizer en BG → leés output incompleto.

## Modos de uso

### Modo audit (read-only, sin worktree)

```
/multi-agent-bg audit
```

Spawn: security + perf + a11y + deps + secrets en BG. Synthesizer al final con top-10.

### Modo refactor (editing, con worktree)

```
/multi-agent-bg refactor [modulos...]
```

Spawn: 1 agent por módulo en worktree separado. Cada uno commitea en su branch. Synthesizer prepara PRs separados.

### Modo bulk-migrate (idempotente, sin worktree)

```
/multi-agent-bg migrate-batches N
```

Spawn: N agents cada uno cubre rango de archivos. Migración idempotente (rerunnable).

## Métricas esperadas

| Sub-tareas | Serial | Multi-agent BG | Ahorro |
|---|---|---|---|
| 3 audits independientes | ~15 min | ~5 min | 3x |
| 5 refactors paralelos | ~50 min | ~12 min | 4x |
| 8 batches migration | ~80 min | ~15 min | 5x |

## Integración con skills hermanos

- [[agentic-loops]] — patrón base (#5)
- [[turbo-parallel]] — paralelismo dentro de 1 turno (sin BG)
- [[parallel-work]] — N worktrees pre-creados manualmente
- [[outcome-evaluator]] — cada agent puede llamar a éste con su rubric
- [[ultra-impact]] — pipeline mega-task, este es la fase de paralelismo

## Bibliografía

- Anthropic Code with Claude 2026 — Multiagent Orchestration (May 2026)
- Patrón clásico: MapReduce (Dean & Ghemawat, 2004)
- Adaptación Buleje: SendMessage + worktree + archivo handoff
