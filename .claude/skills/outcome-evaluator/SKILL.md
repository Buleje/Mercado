---
name: outcome-evaluator
description: |
  Patrón Outcomes (Anthropic Code with Claude 2026) — self-grading loop con rubric
  externo. Un Generator produce el output, un Evaluator independiente lo califica
  contra una rubric concreta, y devuelve pass/fail + revise instructions hasta
  cumplir el bar. Usar cuando Brandon diga "evaluá esto", "auto-revisate",
  "outcomes", "self-grade", "checkeá vs rubric", o cuando una tarea no obvia
  necesite garantía de calidad sin que Brandon lea 1000 líneas.
user-invocable: true
model: opus
allowed-tools: Read, Edit, Write, Grep, Glob, Bash, Agent, TaskCreate, TaskUpdate
argument-hint: "[archivo|tarea] [rubric-name?]"
---

# /outcome-evaluator — Generator/Evaluator con rubric (Anthropic 2026)

**Qué hace (Feynman):** El cocinero hace el plato (Generator). Un chef independiente lo prueba con una lista de criterios (Evaluator). Si no llega al nivel, vuelve a la cocina con notas de qué arreglar. Loop hasta que pase.

## Cuándo usar

| Caso | Usar |
|---|---|
| Refactor de módulo crítico | ✅ rubric: lint + tsc + tests + no regression visual |
| Nuevo endpoint API | ✅ rubric: tenantId + safeParse + DB class + rate limit |
| Migración Prisma | ✅ rubric: revertible + DIRECT_URL + indices + audit log |
| Componente UI cliente | ✅ rubric: bsm-typography + dark mode + a11y |
| Fix de 1 línea, bug obvio | ❌ overkill, va directo |
| Pregunta conversacional | ❌ no aplica |

## Rubric base (heredable)

Cada tarea define su rubric. La rubric es un archivo JSON o markdown con criterios verificables (no opiniones).

### Estructura

```jsonc
// .claude/rubrics/api-endpoint.json
{
  "name": "API endpoint Buleje-compliant",
  "criteria": [
    { "id": "tenant-isolation",     "check": "grep -E 'tenantId.*=.*req' archivo", "weight": "critical" },
    { "id": "safeParse",            "check": "grep 'safeParse(' archivo && ! grep '\\.parse(' archivo", "weight": "critical" },
    { "id": "db-class",             "check": "! grep 'prisma\\.' archivo (excepto lib/db/)", "weight": "critical" },
    { "id": "rate-limit",           "check": "grep 'ratelimit' archivo", "weight": "high" },
    { "id": "rbac",                 "check": "grep 'requireAdmin' archivo", "weight": "high" },
    { "id": "audit-log",            "check": "grep 'logActivity' archivo", "weight": "medium" },
    { "id": "cache-invalidation",   "check": "grep 'invalidate' archivo (si hay write)", "weight": "medium" }
  ],
  "pass_threshold": "100% critical + 80% high"
}
```

Rubrics canónicas en `.claude/rubrics/`:
- `api-endpoint.json` — para `app/api/**/route.ts`
- `db-class.json` — para `lib/db/*.db.ts`
- `prisma-migration.json` — para `prisma/migrations/*/migration.sql`
- `ui-component.json` — para `components/**/*.tsx`

## Loop canónico

```ts
async function outcomeLoop({ task, rubric, maxIter = 3 }) {
  for (let i = 0; i < maxIter; i++) {
    // 1) Generator
    const output = await Agent({
      description: `Iter ${i+1}: implement ${task}`,
      subagent_type: "backend",  // o el agente que corresponda
      prompt: i === 0
        ? `Implementá: ${task}\nRubric: ${rubric}`
        : `Revisión iter ${i}: arreglá estos hallazgos:\n${lastEval.failed}`,
    });

    // 2) Evaluator (corre EN PARALELO con cualquier otra cosa pendiente)
    const evalResult = await Agent({
      description: `Grade iter ${i+1}`,
      subagent_type: "Code Reviewer",
      run_in_background: false,
      prompt: `
Vos sos un grader independiente. NO conocés el contexto del Generator.
Tu trabajo: aplicar esta rubric al archivo y devolver JSON.

Rubric: ${JSON.stringify(rubric)}
Archivos modificados: ${output.files}

Output (JSON estricto):
{
  "passed": [<ids>],
  "failed": [{ "id": <id>, "evidence": "<grep output>", "fix": "<sugerencia>" }],
  "score": 0-100,
  "pass": boolean (según pass_threshold de la rubric)
}
      `,
    });

    if (evalResult.pass) return { iter: i, output, eval: evalResult };
    lastEval = evalResult;
  }
  throw new Error(`Outcome no logrado tras ${maxIter} iters. Último eval: ${lastEval}`);
}
```

## 3 reglas duras

1. **Evaluator NUNCA es el mismo subagent que Generator.** Contextos separados garantizan honestidad. Generator: `backend`. Evaluator: `Code Reviewer` o `security` o `tester`.
2. **Rubric es verificable, no opinable.** Cada criterio debe ser un comando bash/grep que devuelve 0/1, no "está bien escrito".
3. **maxIter = 3.** Si en 3 iters no pasa, hay problema de diseño — escalá a humano. No loop infinito.

## Integración con skills existentes

| Skill | Cómo usa outcome-evaluator |
|---|---|
| `ultra-impact` | Cada fase del pipeline → outcome-loop con rubric correspondiente |
| `verify` | Genera el evaluator output. outcome-evaluator es 1 nivel arriba (loop) |
| `deploy-check` | Es la rubric pre-deploy. outcome-evaluator orquesta retries |
| `agentic-loops` | Patrón #4 (este). Reemplaza "dispatch + esperar y leer" por loop calificado |

## Cuándo NO usar

- Tareas <30s (lint fix, rename).
- Cuando no podés definir rubric verificable (UX subjetivo, decisión de diseño).
- Brainstorm / arquitectura — eso va `solution-architect`, no rubric.

## Bibliografía

- Anthropic Code with Claude 2026 — Outcomes feature (May 2026)
- Patrón clásico: Generator/Critic loop (Lewis et al. 2021)
- Adaptación Buleje: rubric-as-code en `.claude/rubrics/`

## Referencias cruzadas

- [[agentic-loops]] — patrones SOTA generales
- [[verify]] — gate de "antes de decir listo"
- [[deploy-check]] — gate pre-deploy
- [[ultra-impact]] — pipeline grande
