# Estilo de ejecución (siempre activo)

- **Paralelismo por defecto**: tareas independientes = N tool calls / N agentes en UN mensaje.
- **Effort por tier** (Fast-Path ADR-058): HOTFIX/bulk mecánico → modelo rápido (`haiku`/`sonnet` en subagentes); FEATURE → default; DANGER/INITIATIVE → `opus`/effort alto. No quemar xhigh en tareas mecánicas.
- **Generator ≠ evaluator**: lo que un agente construye lo verifica OTRO agente con contexto fresco (solo diff + criterios, solo gaps de correctness). Auto-elogio = anti-patrón.
- **Trust but verify**: hallazgos de auditores se verifican con evidencia directa (grep preciso, SELECT real, getComputedStyle) antes de actuar.
- **Context resets > compaction** en corridas largas: estado a archivos (SESSION_HANDOFF.md, tasks), sesión fresca retoma.
- **2 correcciones fallidas sobre lo mismo** → parar, replantear el prompt/approach, no insistir en loop.
- **Verificación ejecutable antes de "listo"**: curl + tail dev-log + screenshot. Si no se puede verificar, no se reporta como hecho.
