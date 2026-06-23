# Estilo de ejecución (siempre activo)

- **Paralelismo por defecto**: tareas independientes = N tool calls / N agentes en UN mensaje.
- **Effort por tier** (Fast-Path ADR-058): HOTFIX/bulk mecánico → modelo rápido (`haiku`/`sonnet` en subagentes); FEATURE → default; DANGER/INITIATIVE → `opus`/effort alto. No quemar xhigh en tareas mecánicas.
- **Generator ≠ evaluator**: lo que un agente construye lo verifica OTRO agente con contexto fresco (solo diff + criterios, solo gaps de correctness). Auto-elogio = anti-patrón.
- **Trust but verify**: hallazgos de auditores se verifican con evidencia directa (grep preciso, SELECT real, getComputedStyle) antes de actuar.
- **Context resets > compaction** en corridas largas: estado a archivos (SESSION_HANDOFF.md, tasks), sesión fresca retoma.
- **2 correcciones fallidas sobre lo mismo** → parar, replantear el prompt/approach, no insistir en loop.
- **Verificación PROACTIVA antes de "listo"** (A2): corré el gate (`tsc`/`lint`/`test`/`curl`/screenshot del área tocada) y pegá la evidencia en el MISMO mensaje, ANTES de afirmar hecho. El Stop hook agente es la red de seguridad, no el gate primario: si el hook tiene que bloquear, ya fallé. En tareas >1h o multi-paso, abrí con `/goal "<condición ejecutable>"` y dejá que el evaluador externo cierre.
- **RAG-first en 900K LOC** (C1): para "dónde está X / cómo funciona Y" abierto, usá `rag-search` (embeddings Qdrant del repo) antes de grep amplio o agente Explore. Grep/Glob directo solo con target conocido (más rápido, menos tokens).
- **Workflow-first en auditorías/migraciones** (C2): "auditá/migrá/revisá X" → workflow `audit-verificado` (verifier en contexto fresco + refutación adversarial) o fan-out con verify por hallazgo, NO N agentes sueltos sin verificación. Lo confirmó la investigación 2026: verifier independiente = la palanca #1 contra "alucinar terminado".
- **Podar > agregar** (meta): el harness ya está sobre-extendido. Antes de crear skill/hook/regla nueva, preguntá si una existente sirve o si hay que afilar/borrar. Menos superficie = mejor selección de tools (tool-search) y menos ruido de contexto.
