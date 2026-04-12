---
name: session-recap
description: |
  Resume la sesión actual y propone qué codificar como skill/hook/agent
  nuevo. Usar cuando Brandon diga "cerrá la sesión", "qué hicimos hoy",
  "resumen de la sesión", "session recap", "recap", "qué aprendimos".
  Este skill es el DISPARADOR del loop `self-improvement` — primero
  resume, después pregunta si quiere correr el compound loop.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
argument-hint: "[short | full | since-last-commit]"
model: sonnet
---

# Session Recap — resume y propone

## Proceso — 5 pasos

### Paso 1 — Recolectar métricas

```bash
git log --since="6 hours ago" --oneline
git diff HEAD~5 HEAD --stat 2>/dev/null || git diff HEAD~1 HEAD --stat
tail -5 .husky/.last-test-run.log 2>/dev/null
test -f .husky/.last-test-run.FAILED && echo "❌ Tests rotos" || echo "✅ Tests OK"
git branch --show-current
```

### Paso 2 — Categorizar temas

Leer commit messages + diff stats, clasificar: 🐛 Bugs | ✨ Features | ♻️ Refactors | 📝 Docs/ADRs | 🧪 Tests | 🔧 Config | 🎨 UI/UX

### Paso 3 — Detectar patrones candidatos

Si 2+ ítems de la misma categoría -> candidato a skill/hook/template.

| Patrón detectado | Candidato |
|---|---|
| N refactors de `lib/db/*.db.ts` | Skill `db-class-refactor-safe` |
| Bloqueos manuales repetidos | Hook `pre-bash-guard` |
| Pregunta repetida del usuario | Skill más visible o template |
| Mismo patrón de commit N veces | Template en `.claude/templates/` |

### Paso 4 — Generar reporte

Estructura obligatoria:
- **Números:** duración, commits, archivos tocados, tests, branch
- **Temas trabajados:** lista numerada (1 frase c/u)
- **Logros:** bullet points
- **Bugs encontrados/corregidos:** bullet points
- **Deuda nueva:** bullet points
- **Candidatos a codificar (max 5):** skill/hook/ADR con razón
- **Invitación:** "¿Querés correr `/self-improvement`?"

### Paso 5 — Invitar al loop self-improvement

Si el usuario acepta, invocar skill `self-improvement` con candidatos pre-cargados para generar diffs, branches y EVOLUTION_LOG entry.

## Variantes

- `/session-recap short` — max 10 líneas, solo lo crítico
- `/session-recap full` — análisis de cada commit individual
- `/session-recap since-last-commit` — solo desde el último commit

## Reglas

1. **Nunca inventar métricas** — si git log no muestra nada, decirlo
2. **Lenguaje simple Feynman** — Brandon lee esto cansado al final del día
3. **Máximo 5 candidatos** de mejora — más es paralysis by analysis
4. **Referenciar EVOLUTION_LOG** previo si aplica — compound
5. **Invitar al loop** al final, no ejecutarlo automático
