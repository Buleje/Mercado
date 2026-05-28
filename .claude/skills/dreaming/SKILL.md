---
name: dreaming
description: |
  Patrón Dreaming (Anthropic Code with Claude 2026) — memory consolidation async.
  Lee MEMORY.md + últimas N sesiones, deduplica memorias redundantes, sintetiza
  patrones recurrentes en nuevas entries, marca memorias obsoletas como tales.
  No modifica el original — produce un "memory store reorganizado" para revisar.
  Usar cuando Brandon diga "consolidá memoria", "dreaming", "limpia memorias",
  "qué patrones repito", "actualizá memory.md", o al final de sprints largos.
user-invocable: true
model: opus
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, TaskCreate, TaskUpdate
argument-hint: "[lookback-days=14] [--apply]"
---

# /dreaming — Memory Consolidation (Anthropic 2026)

**Qué hace (Feynman):** Cuando una persona duerme, el cerebro reordena lo aprendido — junta lo que sirve, descarta lo redundante, conecta ideas. Este skill hace lo mismo con tu memoria persistente: lee todo, reorganiza, dedupe, propone una versión más limpia.

## Cuándo dispararse

| Disparador | Frecuencia recomendada |
|---|---|
| Manual: Brandon dice "dreaming" o "consolidá memoria" | On-demand |
| Hook `Stop`: sesión >2h con >5 memorias nuevas | Auto-propone (no aplica) |
| Cron mensual: 1er domingo del mes | Auto-propone, mail a Brandon |
| Tras `/sprint-wrap` | Sugerido al final del wrap |

## Anatomía del loop

```
Input:                       Output:
  MEMORY.md (52 entries)       reorganized/MEMORY.md.next  (clean diff)
  memory/*.md (52 files)       reorganized/CHANGES.md      (qué cambió y por qué)
  últimos N transcripts        reorganized/REJECTED.md     (qué NO se aplicó y por qué)
                               reorganized/PATTERNS.md     (patrones nuevos detectados)
```

**El original nunca se modifica.** Brandon decide si aplicar con `--apply` después de revisar.

## Pipeline (4 pasos)

### Paso 1 — Inventario

```bash
# Leer todas las memorias activas
ls ~/.claude/projects/-home-usuario-proyectos-Mercado/memory/*.md \
  | xargs wc -l > /tmp/dreaming-inventory.txt

# Stats: cuántas memorias, total tokens, fechas
```

### Paso 2 — Análisis de patrones (Opus thinking=high)

Despachá un Agent con esta prompt structured:

```ts
Agent({
  description: "Memory dreaming analysis",
  subagent_type: "general-purpose",
  prompt: `
Vos sos un consolidador de memoria. Leé TODAS las memorias en ${MEMORY_DIR}.

Categorizá cada una en:
1. ACTIVE — vigente, útil, no duplicada
2. STALE — superada por un hecho posterior (ej. "estado proyecto 2026-04-28" vs "estado proyecto 2026-05-25")
3. DUPLICATE — mismo contenido que otra memoria más reciente
4. NOISE — temporal, ya cumplió su propósito (ej. "trabajo pendiente sesión X" si X ya cerró)

Identificá PATRONES nuevos:
- Si Brandon corrigió 3+ veces el mismo error, eso es un patrón nuevo.
- Si una decisión técnica aparece en 3+ memorias, mergear en una "ADR-style memory".
- Si hay N+1 / leaks repetidos, sintetizar a regla general.

Output: JSON estricto.
{
  "stale": [{ "file": "x.md", "reason": "superada por y.md" }],
  "duplicates": [{ "files": ["a.md", "b.md"], "keep": "b.md", "reason": "..." }],
  "noise": [{ "file": "x.md", "reason": "trabajo cerrado en commit Y" }],
  "patterns_new": [
    { "title": "...", "evidence_files": [...], "proposed_body": "..." }
  ]
}
  `,
});
```

### Paso 3 — Escritura del diff (sin aplicar)

Generar en `reorganized/`:

```
reorganized/
├── MEMORY.md.next         # nueva versión propuesta del índice
├── CHANGES.md             # tabla: archivo · acción · razón
├── REJECTED.md            # propuestas descartadas por Claude (con razón)
└── PATTERNS.md            # nuevas memorias sintetizadas
```

`CHANGES.md` formato:

| Archivo | Acción | Razón |
|---|---|---|
| `project_state_2026-04-28.md` | DELETE | Superada por `project_state_2026-05-25.md` |
| `project_session_2026-04-29.md` | ARCHIVE → `_archive/` | Cierre histórico, no decisional |
| `feedback_n1_known_patterns.md` + `feedback_admin_modal_standard.md` | MERGE | Ambos hablan de patrones a evitar |

### Paso 4 — Apply (solo si Brandon pasa `--apply`)

```bash
# Backup primero
cp -r ~/.../memory ~/.../memory.backup-$(date +%Y-%m-%d)

# Aplicar
mv reorganized/MEMORY.md.next ~/.../memory/MEMORY.md
# Mover stale a _archive/
# Crear nuevas pattern memories
```

## 4 reglas duras

1. **NUNCA borrar `project_session_*`** sin moverlas a `_archive/`. Son auditoría histórica.
2. **NUNCA mergear `feedback_*`** sin preservar el `Why:` original. Los porqués son irreemplazables.
3. **NUNCA aplicar sin `--apply` explícito.** Default = dry-run con diff.
4. **Si una memoria menciona credenciales / DNI / dinero, NO la tocás** — alta sensibilidad.

## Métricas esperadas

| Métrica | Baseline (sesión 2026-05-28) | Target post-dreaming |
|---|---|---|
| Memorias activas | 52 | 35-40 (después de archivar sesiones viejas) |
| Tokens MEMORY.md | ~12K | ~8K |
| Duplicados | ~5 (sospechas N+1, modal admin standard, etc.) | 0 |
| Pattern-memories nuevas | 0 | 2-3 (de patrones repetidos) |

## Integración con session-recap

`session-recap` produce el resumen de UNA sesión.
`dreaming` consolida M sesiones + memorias permanentes.

Pipeline natural:
```
end of session → session-recap → (acumulación)
                                         ↓ (cada 2-4 semanas o por trigger)
                                    dreaming → MEMORY.md más liviano
```

## Cuándo NO usar

- Memoria con <20 entradas. No vale la pena.
- Tras un cambio mayor reciente (ej. esta semana). Dejá decantar.
- Sin tiempo para revisar el diff. Aplicar a ciegas == perder contexto.

## Bibliografía

- Anthropic Code with Claude 2026 — Dreaming feature (May 2026, research preview)
- Patrón: Memory consolidation durante sueño REM (Squire & Alvarez, 1995)
- Adaptación Buleje: filesystem-based, diff-first, opt-in apply

## Referencias cruzadas

- [[session-recap]] — resume 1 sesión, este consolida varias
- [[session-handoff]] — guarda estado entre sesiones
- [[sprint-wrap]] — cierre de sprint, dispara dreaming al final
- [[outcome-evaluator]] — patrón hermano (también Anthropic 2026)
