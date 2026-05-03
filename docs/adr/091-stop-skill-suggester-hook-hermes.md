# ADR-091 — Hook `stop-skill-suggester` (auto-skill creation estilo Hermes Agent)

- **Status:** Accepted
- **Fecha:** 2026-05-03
- **Autores:** Brandon Buleje + Claude Opus 4.7
- **Relacionado:** `.claude/hooks/auto-learn.mjs` (PostToolUse, ya existía), `.claude/hooks/stop-skill-suggester.mjs` (NUEVO Stop hook), `.claude/learning/patterns.json`, `.claude/improvement-radar.md`, `.claude/skills/settings-module-pattern.md`
- **Supersede a:** N/A — extiende el sistema de compound learning existente.

---

## 1. Contexto

Investigación mostró que **Hermes Agent** (Nous Research, feb 2026, 95K stars GitHub) tiene como killer feature *"agents create skills autonomously after complex tasks"* — métrica reportada: **+40% velocidad** en tareas similares con 20+ skills aprendidos.

Buleje ya tenía:
- ✅ `.claude/hooks/auto-learn.mjs` (PostToolUse) — trackea co-edits y llena `patterns.json`
- ✅ `.claude/skills/` con 60 skills manuales
- ✅ Skill `evolve` para sugerir mejoras de prompts

Pero faltaba el **trigger** entre `patterns.json` y la creación efectiva de skills. Los patterns se acumulaban (114 detectados) sin generar skills. El compound learning estaba a medio camino.

## 2. Decisión

Crear `.claude/hooks/stop-skill-suggester.mjs` como **Stop hook async**.

### 2.1 Flujo

```
Cada respuesta de Claude termina
  → stop-skill-suggester.mjs corre async (no bloquea)
    → lee patterns.json
    → filtra: occurrences >= 5 && artifactGenerated == null && status === active
    → toma top 3 candidatos
    → apendea a improvement-radar.md sección "Skills sugeridos por compound-learning (auto, YYYY-MM-DD)"
    → marca patterns como artifactGenerated="queued" (no duplica)
SessionStart hook ya muestra improvement-radar → próxima sesión Claude las ve
```

### 2.2 Threshold

`MIN_OCCURRENCES = 5` co-edits del mismo cluster antes de proponer skill. Por debajo es ruido. Hermes usa 5+ tool calls; nosotros 5+ co-edits (señal más fuerte).

### 2.3 No auto-genera skills

A diferencia de Hermes, NO crea skills automáticamente — solo PROPONE. Razones:
- Auto-creación arriesga skills mal definidos que confundan futuras sesiones
- Brandon prefiere validar la propuesta antes de comprometer
- Skills bien escritos requieren contexto humano que el LLM puede inferir mal

## 3. Alternativas consideradas

| Opción | Razón de descarte |
|---|---|
| **Auto-crear skills sin aprobación (Hermes-style)** | Riesgo de pollution con skills mal escritos. Validación manual mantiene calidad |
| **Trigger en PostToolUse en lugar de Stop** | PostToolUse corre demasiado seguido. Stop es 1 vez por respuesta = más eficiente |
| **Generar skills con sub-agente LLM en background** | Costoso en tokens, complejo, puede esperar a v2 |
| **Solo mostrar contador "N patterns ready"** | Menos accionable que la lista concreta de candidatos |

## 4. Consecuencias

### Positivas
- Cierra el loop entre detección de patrones y generación de skills
- Próxima sesión Claude VE las propuestas en su contexto inicial
- Marca queued evita duplicados
- Async = no bloquea cierre de respuesta

### Negativas / Riesgos
- Crece `improvement-radar.md` indefinidamente si Brandon ignora propuestas
  - Mitigación: cap MAX_SUGGESTIONS_PER_RUN=3, agrupado por fecha
- Falsa señal si auto-learn detecta co-edits incidentales (ej. linter mass-fix)
  - Mitigación: threshold 5+ filtra ruido razonablemente

### Métricas a observar
- # skills creados / # propuestas → ratio de utilidad
- Tiempo entre propuesta y creación → engagement
- # de "queued" sin acción después de 1 mes → señal para subir threshold

## 5. Verificación

- ✅ Hook ejecutó OK con threshold=3 (test): detectó 114 patrones, agregó top 3 al radar
- ✅ Restaurado threshold a 5 para producción
- ✅ Registrado en `.claude/settings.json` Stop array (junto a `stop-checkpoint.mjs`)
- ✅ Próxima sesión session-start-context.mjs mostrará la sección nueva

## 6. Implementación

Commit: `cbcb2913` — `feat(hooks): auto-skill-suggester — replica killer feature de Hermes Agent`

Archivos:
- `.claude/hooks/stop-skill-suggester.mjs` (NUEVO, ~85 líneas)
- `.claude/settings.json`: registro del hook en Stop array
- `.claude/improvement-radar.md`: sección "Skills sugeridos" auto-generada

## 7. Referencias

- [Hermes Agent — Nous Research](https://hermes-agent.nousresearch.com/)
- [Hermes Agent v0.10.0 review](https://tokenmix.ai/blog/hermes-agent-review-self-improving-open-source-2026)
- ADR pendiente v2: auto-generación de stub de skill cuando occurrences >= 10
