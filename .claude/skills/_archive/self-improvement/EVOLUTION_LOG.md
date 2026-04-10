# 🧬 EVOLUTION_LOG — Bodega San Martín Claude Code Compound Engineering

Este archivo es el **registro histórico de aprendizajes del sistema Claude Code**
que opera sobre el proyecto Bodega San Martín. Cada vez que el skill
`self-improvement` corre, agrega una entry nueva con:

- Lecciones clave de la sesión
- Patrones detectados y acciones tomadas
- Delta del score de madurez
- Componentes modificados (agents/skills/hooks/CLAUDE.md)

**Regla:** solo escribe el skill `self-improvement`. Nunca edites a mano salvo
para corregir typos — las métricas deben ser honestas.

**Filosofía Compound Engineering:** cada entry debe hacer más fácil la siguiente.
Si una lección de entry #3 se repitió en #7, significa que la lección no quedó
bien codificada — revisar.

---

## Entry #1 — 2026-04-08 · Baseline inicial (entry cero)

**Duración sesión:** ~8 horas acumuladas del día
**Tema principal:** Plan Maestro 24 semanas + quick wins Sprint 1 + auditoría Claude Code + arquitectura multi-agéntica nivel 3 + FLUJO_PRO_v6 repotenciación

**Estado al momento de crear este log:**

- Commits del día: 4 (`ff31676`, `c9c7531`, `fff8dad`, `ee4f617`, `17e2596`)
- Tests: 2,562+447 unitarios verdes
- CLAUDE.md: ~650 líneas (mixto: reglas + docs on-demand)
- Sprint activo: 1 — Fundamentos del plan maestro

### Patrones detectados en el baseline

1. **Falsa protección por hook huérfano.** `danger-zone.mjs` existía pero no estaba conectado a ningún `settings.json`. El user creía estar protegido y no lo estaba. → **Resuelto en este commit** creando `.claude/settings.json` del proyecto.
2. **Paralelismo sin gating (nivel 2).** Los agents se lanzaban en paralelo sin DAG de dependencias — Arq + Backend + Frontend al mismo tiempo sin contrato previo. → **Resuelto** con `feedback_multi_agent_hierarchy_level3.md` en memoria + declaración explícita del patrón en cada tarea compleja.
3. **CLAUDE.md mezcla reglas siempre-on con docs on-demand.** Tamaño ~650 líneas cuando el target del research es < 200. → **Pendiente refactor** (FASE D de este sprint).
4. **Bugs de SEO / feeds críticos activos sin detección.** `SchemaMarkup.tsx` tenía `"328"` reviews hardcoded, `public/robots.txt` apuntaba a host equivocado, `shopping-feed` apuntaba a `/#productos`. Detectados por el seo-growth-strategist en Sprint 1. → **Resueltos** en commit `17e2596`.
5. **`unstable_cache` deprecado en Next.js 16** pero seguía usado en `app/layout.tsx`. → **Migrado** a `"use cache" + cacheTag + cacheLife("hours")`.
6. **`/api/admin/dashboard` devuelve 5-15 MB por polling cada 15s.** El agent backend-platform-engineer generó blueprint completo del refactor a aggregates server-side. → **Pendiente apply** (deliverable del agent en background, código listo para pegar).
7. **Self-improvement loop inexistente** hasta este commit. Cada sesión arrancaba de cero en términos de aprendizaje. → **Resuelto** creando este skill + este log.

### Componentes creados en esta entry

#### Hooks (5)

- `danger-zone.mjs` (existía pero huérfano, ahora **conectado** vía `.claude/settings.json`)
- `pre-bash-guard.mjs` — **nuevo**, bloquea `rm -rf`, `DROP TABLE`, `git push --force`, `sudo`, `curl|sh`, etc.
- `post-tool-lint.mjs` — **nuevo**, corre `eslint --fix` async sobre archivos editados
- `session-start-context.mjs` — **nuevo**, carga git log + test log + TECH-DEBT al arrancar sesión
- `stop-checkpoint.mjs` — **nuevo**, avisa si hay cambios sin commit al cerrar turn

#### Skills (3 nuevos)

- `self-improvement/` — **este skill**, Compound Engineering loop
- `audit-first/` — fuerza "perfect before new" antes de tocar un módulo
- `session-recap/` — resume sesión y propone codificación de lecciones

#### Config (3)

- `.claude/settings.json` del proyecto — nuevo, hooks + permissions + deny list
- `.claude-plugin/plugin.json` — nuevo, manifest del plugin `bodega-claude-pack` v0.1.0
- `EVOLUTION_LOG.md` — este archivo

### Snapshot de componentes post-sesión (estimado)

| Componente | Cantidad | Target | Status |
|---|---|---|---|
| Subagents del proyecto | 19 | ≥ 15 | ✅ |
| Skills del proyecto | 14 (11 previos + 3 nuevos) | ≥ 15 | 🟡 casi |
| Hooks del proyecto | 5 (1 huérfano activado + 4 nuevos) | ≥ 4 | ✅ |
| Plugins instalados globales | 18 | — | ✅ |
| MCPs activos | ~15 vía plugins | ~10 | ✅ |
| ADRs activos | 17 (próximo: 017 Claude Code Agent Architecture v3) | — | — |
| CLAUDE.md líneas | ~650 (refactor pendiente) | ≤ 200 | ❌ |
| Tests unitarios verdes | 2562 + 447 smoke | crecer | ✅ |
| Agent Teams flag | activo | activo | ✅ |

### Score de madurez — baseline

| Dimensión | Score /peso | Justificación |
|---|---|---|
| Claude Code version + Agent Teams flag | 5/5 | v2.1.97 + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| Subagents cobertura | 15/15 | 19 agents vs target 15 |
| Skills cobertura | 12/15 | 14 skills + 1 pendiente (faltan 1-2 de los propuestos en research) |
| Hooks calidad | 14/15 | 5 hooks implementados, falta SessionEnd auto-save |
| MCPs stack | 8/10 | Tool Search auto-on vía Claude Code 2.1.97, pero falta auditoría de cuáles MCPs reales están activos y qué aporta cada uno |
| CLAUDE.md calidad | 4/10 | 650 líneas mixtas, refactor pendiente |
| Agent Teams presets | 5/10 | 11 teams ad-hoc guardados, cero presets reusables bajo nomenclatura nueva |
| Plugin empaquetado | 6/10 | `.claude-plugin/plugin.json` creado pero sin publicar en marketplace propio |
| Self-improvement activity | 3/5 | Este skill recién creado, aún sin entries aplicadas |
| Compound Engineering evidence | 2/5 | EVOLUTION_LOG inicializado pero ninguna lección aplicada aún desde entry previas |
| **SCORE GLOBAL** | **74/100** | 🟢 "Buena base, con huecos específicos" |

**Delta vs auditoría pre-sprint (~48/100):** `+26 puntos` por activación del setup level 3.

### Top 3 próximos pasos recomendados

1. **Refactor CLAUDE.md 650 → ≤ 200 líneas** (FASE D de este sprint) — mover glosario Feynman, narrativa D1/D2, módulo delivery, zonas peligrosas hacia skills lazy (`bodega-context-loader`, `checkout-flow`, `delivery-d1`, `chat-d2`). Recupera 6 puntos del score.

2. **Aplicar los 3 blueprints del Sprint 1** (Dashboard aggregates, Onboarding self-service, GRE SUNAT) que los agents dejaron listos. Cada uno es un compound lesson — qué funciono bien del agent team y qué no.

3. **Activar Compound Engineering plugin oficial de EveryInc** (`/plugin marketplace add EveryInc/compound-engineering-plugin`) — duplica el poder de este skill con 12 reviewers adversariales en paralelo. Recupera 3 puntos de "Compound Engineering evidence".

### Lecciones clave para futuras entries

1. **Siempre declarar el Orquestador Principal explícitamente** antes de cualquier tarea compleja. Nivel 3 no es opcional.
2. **Agents paralelos sin gating = bug silencioso.** Si lanzás Backend + Frontend sin que Arq defina contrato primero, terminan haciendo suposiciones distintas que no se alinean.
3. **Los hooks huérfanos son peor que no tener hooks** — dan falsa sensación de seguridad. Cualquier `.mjs` en `.claude/hooks/` debe estar conectado a un `settings.json` o borrarse.
4. **El research en vivo supera el training data** cuando la tecnología tiene < 6 meses. El research agent de esta sesión encontró cosas (Tool Search, `context: fork`, compound-engineering plugin) que yo no conocía por entrenamiento.
5. **Los plugins del marketplace oficial no son suficientes** — hay que empaquetar el propio `.claude/` como plugin para reusabilidad cross-proyecto.

---

## Próximas entries se agregan arriba de esta línea

&lt;!-- NEXT_ENTRY_MARKER: self-improvement skill writes new entries between this marker and Entry #1 --&gt;
