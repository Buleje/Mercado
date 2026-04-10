---
name: token-optimizer
description: |
  Optimiza el consumo de tokens de la sesión actual. Resume mensajes viejos
  en `session_recap.md`, marca chunks pesados para limpieza, y emite
  recomendaciones cuando el contexto supera el 70% del presupuesto.
  Usar manualmente con `/token-optimizer` o automáticamente cuando el sistema
  detecte carga alta. Complementa (no reemplaza) la auto-compresión nativa.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
argument-hint: "[summary | clean | status | recap]"
model: sonnet
---

# Token Optimizer — gestor de presupuesto de contexto

Mantener la sesión **rápida, enfocada y barata**. Aplicable cuando el contexto
empieza a pesar (típicamente >100k tokens en la sesión).

## Subcomandos

| Comando | Acción |
|---|---|
| `/token-optimizer status` | Muestra estimación de uso actual + alertas |
| `/token-optimizer summary` | Genera `session_recap.md` con lo importante |
| `/token-optimizer clean` | Marca herramientas/lecturas pesadas para purga |
| `/token-optimizer recap` | Combo: summary + clean + status |

## 1. `status` — diagnóstico del presupuesto

Reporta:

```markdown
## 📊 Token Budget — Status

| Métrica | Valor | Umbral | Estado |
|---|---|---|---|
| Mensajes totales | N | — | ℹ️ |
| Tool calls grandes | N (>5k tokens) | <10 | ✅/⚠️/❌ |
| Lecturas de archivo | N | <30 | ✅/⚠️/❌ |
| Bash outputs grandes | N (>2k) | <15 | ✅/⚠️/❌ |
| Estimación total | ~Nk tokens | 200k (Opus 1M) | ✅ |

### 🎯 Recomendación
- [Verde: seguir como vas]
- [Amarillo: ejecutar `/token-optimizer summary` ahora]
- [Rojo: ejecutar `/token-optimizer recap` + considerar `/clear`]
```

## 2. `summary` — escribir session_recap.md

Genera `bodega-san-martin/.claude/sessions/session_recap_YYYYMMDD-HHMM.md`:

```markdown
# Session Recap — YYYY-MM-DD HH:MM

## 🎯 Objetivo de la sesión
[1-2 frases del intent original del user]

## 📂 Archivos tocados
- `path/to/file.tsx` — qué cambió + por qué
- `path/to/other.ts` — qué cambió + por qué

## 🔧 Comandos clave ejecutados
- `npm run lint` → ✅
- `vercel env pull` → ✅
- `git commit -m "..."` → SHA: abc1234

## 🧠 Decisiones tomadas
1. [Decisión + razón]
2. [Decisión + razón]

## 🚧 Pendiente
- [ ] Item 1
- [ ] Item 2

## 📚 Memorias actualizadas
- `feedback_X.md` — qué se añadió

## 🔄 Cómo retomar
```bash
cd bodega-san-martin
git status
cat .claude/sessions/session_recap_YYYYMMDD-HHMM.md
```
```

## 3. `clean` — recomendar purga

Identifica candidatos a purga (NO los borra solo):

```markdown
## 🧹 Candidatos a limpieza

### Tool calls grandes (>5k tokens)
1. Read `prisma/schema.prisma` (línea X-Y) — 12k tokens
2. Bash `npm run build` output — 8k tokens
3. Read `CheckoutModal.tsx` completo — 15k tokens

### Recomendación
- ✅ Mantener: lecturas vinculadas a la tarea actual
- ⚠️ Purgar: lecturas exploratorias ya digeridas (basta con resumen)
- 🔥 Purgar primero: outputs de build/test verdes (no aportan más)

### Cómo purgar
La auto-compresión nativa de Claude maneja esto al acercarse al límite,
pero si querés forzar:
1. `/clear` (drástico — pierde todo el historial)
2. Continuar normalmente y dejar que la auto-compresión actúe
3. Iniciar sesión nueva con `session_recap.md` cargado vía `/bodega-context-loader`
```

## 4. `recap` — combo completo

Ejecuta:
1. `summary` → escribe recap a disco
2. `clean` → reporta candidatos
3. `status` → estado final
4. Imprime URL del recap + comandos para retomar

## Heurísticas de uso

| Síntoma | Acción |
|---|---|
| Sesión >2h activa | `summary` cada 30 min |
| Múltiples reads de archivos enormes | `clean` después de cada read |
| Cambio de contexto (terminamos feature X, empezamos Y) | `recap` + considerar nueva sesión |
| Brandon dice "esto está pesado" o "se nota lento" | `recap` inmediato |
| Antes de cierre de sesión | `summary` siempre (continuidad) |

## Reglas duras

1. **Nunca borrar mensajes manualmente** — solo recomendar a Brandon o esperar auto-compresión.
2. **Recap siempre va a disco** (no solo en respuesta).
3. **Mantener `session_recap.md` reciente** — sobreescribir si es del mismo día.
4. **No incluir secrets** en el recap (filtrar `AUTH_SECRET`, `STRIPE_*`, etc.).
5. **No medir tokens exactos** — usar estimaciones (no hay API directa). Reportar como "~Xk".

## Output final

```markdown
## ✅ Token Optimizer — recap completo

📝 Recap: `.claude/sessions/session_recap_20260409-2030.md`
🧹 Candidatos a purga: 5 (ver arriba)
📊 Estado: ⚠️ Amarillo (~75% del budget cómodo)

### Recomendación
Seguir 30 min más en esta sesión, luego cerrar con `/checkpoint` y
arrancar nueva sesión con `/bodega-context-loader full`.
```

## Referencia

- Auto-compresión nativa: Claude Code la maneja al acercarse al límite del modelo.
- Skill complementario: `session-recap` (más enfocado en resumen humano-legible).
- Memoria: `user_claude_code_tier.md` — plan $200/mes, no cortar por costo pero sí por foco.
