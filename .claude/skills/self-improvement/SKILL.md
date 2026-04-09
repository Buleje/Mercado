---
name: self-improvement
description: |
  Compound Engineering loop para Bodega San Martín. Activar AUTOMÁTICAMENTE al final
  de cada sesión productiva o cuando Brandon diga "mejora tu setup", "qué aprendiste
  hoy", "auto-mejora", "evoluciona", "self-improvement", "compound", "aprendé de esta
  sesión". Este skill hace que Claude Code aprenda de cada sesión y codifique las
  lecciones como nuevos skills, agents, hooks o updates a CLAUDE.md. Inspirado en el
  patrón Compound Engineering de EveryInc — convertir cada error pasado en una
  lección permanente del sistema.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate
argument-hint: "[session-summary-opcional | score-only | dry-run | apply]"
context: fork
agent: Plan
model: opus
---

# Self-Improvement — Compound Engineering loop para Bodega San Martín

Este skill es el **motor de auto-mejora** del sistema Claude Code de Brandon.
Cada vez que corre, el sistema se vuelve más inteligente sobre el proyecto
Bodega San Martín y más resistente a los errores del pasado.

## Filosofía — Compound Engineering (EveryInc)

**Regla dura:** cada unidad de ingeniería debe **hacer más fácil la siguiente,
no más difícil**. La mayoría de los codebases se degradan con el tiempo porque
cada feature inyecta complejidad. Compound Engineering invierte esa ecuación:

- Cada error pasado → lección permanente en el sistema
- Cada patrón repetido → skill codificado
- Cada mala decisión → regla en CLAUDE.md o hook bloqueador
- Cada acierto → documentado en EVOLUTION_LOG para replicar

**Meta ambiciosa:** después de 30-50 ciclos de este skill, el sistema debería
ser indistinguible de tener un equipo senior de 5 devs que llevan 2 años en
Bodega San Martín.

## Cuándo se activa

### Activación automática (recomendada)

- Al final de una sesión con ≥ 2 commits productivos
- Al final de una sesión donde se corrigió ≥ 1 error de Claude que repitió un patrón
- Cuando se completó un sprint del Plan Maestro 24 semanas
- Después de un agent team exitoso (para capturar qué funcionó de la orquestación)

### Activación manual

Brandon puede invocar explícitamente con:

```
/self-improvement
/self-improvement dry-run          # ver propuestas sin escribir nada
/self-improvement apply            # aplicar las propuestas aprobadas
/self-improvement score-only       # solo calcular el score de madurez
```

## Proceso — 7 pasos del Compound Loop

### Paso 1 — Análisis de la sesión actual

Leer y analizar:

1. **Transcript de la sesión** (vía `$CLAUDE_SESSION_ID` + `~/.claude/sessions/`)
2. **Git log** de los commits de esta sesión (`git log --since="4 hours ago"`)
3. **Test results** (`.husky/.last-test-run.log` + `.husky/.last-test-run.FAILED`)
4. **Errores mostrados al user** (buscar patterns tipo "Test timeout", "TypeError", "Prisma error", "Build failed")
5. **Correcciones del user** (frases tipo "no, eso está mal", "corregí vos", "te equivocaste en X")
6. **Tools que fallaron** (Bash exit != 0, Edit con old_string not found, etc.)
7. **Prompts repetidos** (si Brandon dijo lo mismo 2+ veces con ligeras variaciones, es un pattern)

Output del paso 1: un **session-analysis.md** temporal en `.claude/skills/self-improvement/.tmp/` con la síntesis estructurada.

### Paso 2 — Detectar patrones repetidos

Criterios para considerar un pattern:

| Pattern | Trigger | Acción propuesta |
|---|---|---|
| **Mismo bug resuelto 2+ veces** | Grep histórico en EVOLUTION_LOG | Regla en CLAUDE.md o hook bloqueador |
| **Mismo error de tool** | Edit con old_string not found 3+ veces en sesión | Skill `edit-safely` que hace Read primero |
| **Mismo comando bash repetido** | Detectar comandos idénticos en bash-commands.log de la sesión | Alias / script / skill nuevo |
| **Mismo tipo de pregunta** | Brandon pregunta "¿cómo se hace X?" sobre el proyecto 2+ veces | Docs en skill `bodega-context-loader` o ADR nuevo |
| **Mismo refactor hecho múltiples veces** | Buscar patches similares en git log | Skill codegen o refactor-lint |
| **Mismo workflow multi-step** | Secuencia de 4+ steps que se repite entre sesiones | Skill o comando nuevo |

### Paso 3 — Generar candidatos de mejora

Para cada pattern detectado, generar UN candidato en **uno de estos formatos**:

#### 🆕 Skill nuevo propuesto

```markdown
### Skill propuesto: `<nombre-kebab-case>`

**Razón:** [frase simple explicando qué pattern resolvió]
**Ganancia:** [tiempo/errores ahorrados estimados]
**Trigger:** [cuándo se activaría]

**Draft del SKILL.md:**
\`\`\`markdown
---
name: <nombre>
description: ...
---
...
\`\`\`
```

#### 📝 Update a CLAUDE.md

```markdown
### Regla propuesta en CLAUDE.md

**Sección afectada:** [nombre de sección o "nueva sección"]
**Razón:** [qué error evita]
**Draft del cambio:**
\`\`\`diff
- [texto viejo si aplica]
+ [texto nuevo propuesto]
\`\`\`
```

#### 🪝 Hook nuevo

```markdown
### Hook propuesto: `<evento>:<matcher>`

**Evento:** PreToolUse / PostToolUse / SessionStart / Stop / ...
**Archivo:** `.claude/hooks/<nombre>.mjs`
**Razón:** [pattern bloqueado]
**Draft del hook + entrada en settings.json**
```

#### 🤖 Agent nuevo

```markdown
### Agent propuesto: `<nombre>`

**Agencia:** [arq/backend/frontend/db/qa/gov/growth/perf/integ]
**Modelo sugerido:** [opus/sonnet/haiku]
**Tools:** [lista]
**Razón:** [qué hueco llena]
**Draft del frontmatter**
```

### Paso 4 — Presentar al user y pedir aprobación (modo plan)

**Nunca escribir nada sin aprobación explícita de Brandon.**

Formato de presentación:

```markdown
## 🧠 Self-Improvement — Sesión [fecha] [hora]

### 📊 Métricas de la sesión
- Duración: X horas
- Commits: N
- Archivos tocados: N
- Tests verdes/rojos: N/N
- Patterns detectados: N
- Errores de Claude corregidos: N

### 💡 Candidatos de mejora (N propuestas)

#### 1. [Emoji] Título
- **Razón:** ...
- **Ganancia:** ...
- **Dry-run diff:** [mostrar qué archivos se tocarían]

#### 2. ...

### ✅ Formulario de aprobación

| # | Propuesta | ☐ Sí | ☐ No | ☐ Después |
|---|---|---|---|---|
| 1 | ... | | | |
```

### Paso 5 — Aplicar las aprobadas

Cuando Brandon marque Sí, crear una rama nueva:

```bash
git checkout -b chore/self-improvement-$(date +%Y%m%d-%H%M)
```

Aplicar los cambios uno por uno, con un commit por propuesta:

```
feat(claude-setup): [tipo] [descripción corta]

Self-improvement loop detectó: [pattern]
Aprobado por Brandon el [fecha].

Antes: [situación previa]
Después: [situación nueva]

Pattern captured in EVOLUTION_LOG.md entry #[N]

Co-Authored-By: Claude Opus 4.6 (self-improvement skill) <noreply@anthropic.com>
```

### Paso 6 — Actualizar EVOLUTION_LOG.md

Siempre — incluso si Brandon rechazó todas las propuestas, escribir un entry
en `.claude/skills/self-improvement/EVOLUTION_LOG.md` con:

```markdown
## Entry #[N] — [fecha]

**Duración sesión:** [h]
**Tema principal:** [qué se trabajó]
**Patterns detectados:** [lista]
**Propuestas generadas:** [N]
**Propuestas aprobadas:** [N]
**Propuestas rechazadas:** [N, con razones si se sabe]
**Score madurez:** [N/100] (Δ desde última entrada)

### Lecciones clave de esta sesión
1. ...
2. ...
3. ...

### Snapshot de componentes
- Agents: [count]
- Skills: [count]
- Hooks: [count]
- Plugins: [count]
- CLAUDE.md líneas: [count]

### Commits de esta sesión
- [sha] - [mensaje]
```

### Paso 7 — Score de madurez + 3 próximos pasos

Calcular score 0-100 sobre estas dimensiones:

| Dimensión | Peso | Cómo se mide |
|---|---|---|
| Claude Code version + Agent Teams flag | 5 | Binary: tiene o no |
| Subagents cobertura | 15 | Count / target de 15 |
| Skills cobertura | 15 | Count / target de 15 + quality de frontmatter |
| Hooks calidad | 15 | 5 hooks críticos implementados = 15 |
| MCPs stack | 10 | Tool Search on + MCPs relevantes activos |
| CLAUDE.md calidad | 10 | Líneas ≤ 200 + separación reglas vs docs |
| Agent Teams presets | 10 | Presets reusables vs ad-hoc |
| Plugin empaquetado | 10 | plugin.json válido + versioning |
| Self-improvement activity | 5 | Entries en EVOLUTION_LOG > 0 |
| Compound Engineering evidence | 5 | Lecciones aplicadas de entries previas |

**Entregar:**

```markdown
## 📊 Score de madurez del setup Claude Code — [fecha]

**Score global: [N]/100** ([emoji rating])

| Dimensión | Score | Δ vs última | Notas |
|---|---|---|---|
| ... | N/N | +N | ... |

### 🎯 Top 3 próximos pasos recomendados
1. ...
2. ...
3. ...

### 📈 Trayectoria (últimas 5 entries)
entry #1 (fecha): 48/100
entry #2 (fecha): 52/100
...
```

## Reglas críticas del skill

1. **Nunca escribir sin aprobación explícita** — modo plan por default.
2. **Siempre crear branch `chore/self-improvement-YYYYMMDD-HHMM`** — nunca tocar main/master.
3. **Un commit por propuesta** — commits atómicos para rollback fácil.
4. **Siempre actualizar EVOLUTION_LOG.md** — incluso si nada se aplicó.
5. **Brutal honesty en el score** — si el setup está en 48, reportar 48, no inflar.
6. **Compound — cada entry debe referenciar entries previas** si aplica. Ej: "entry #5 cerró el gap detectado en #2".
7. **No proponer > 5 cambios por sesión** — demasiados cambios de una vez rompen el compound loop.
8. **Respeto por el nivel 3** — cualquier propuesta debe encajar en la jerarquía Orquestador → Agencias → Empleados.
9. **Respeto por la regla de lenguaje simple** — las lecciones se escriben en español Feynman, no en technobabble.
10. **Dry-run first** — si Brandon invoca sin `apply`, mostrar propuestas pero no escribir nada.

## Invocaciones especiales

- `/self-improvement dry-run` — solo propuestas, cero escritura
- `/self-improvement score-only` — solo score + 3 pasos, no analiza patterns
- `/self-improvement apply` — modo agresivo, aplica todo lo aprobado sin volver a pedir confirmación por cada uno
- `/self-improvement from-log` — relee las últimas N entries del EVOLUTION_LOG y propone nuevas mejoras basadas en patrones histórico

## Referencias cruzadas

- Patrón Compound Engineering: https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents
- EveryInc plugin: https://github.com/EveryInc/compound-engineering-plugin
- ADR 017 (pendiente) — Claude Code Agent Architecture v3
- `~/.claude/projects/C--Users-Usuario/memory/feedback_multi_agent_hierarchy_level3.md`
- `~/.claude/projects/C--Users-Usuario/memory/feedback_max_parallelization.md`

## Output obligatorio al final

Al terminar cualquier invocación del skill, imprimir:

```
✅ Self-improvement loop #[N] completado.
📊 Score: [N]/100 (Δ +[N])
📝 EVOLUTION_LOG actualizado.
🌿 Branch: [nombre]
📈 Próximos 3 pasos: [resumen]
```

---

**"Cada sesión debe hacer más fácil la siguiente, nunca más difícil."** — Compound Engineering principle
