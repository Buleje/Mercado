# Estilo de ejecución (siempre activo)

> Adelgazada 2026-09-18: el detalle operativo (qué gate cuesta cuánto, MCPs, tope de RAM del cgroup, pkill, warmup, workflows grandes) se mudó a la memoria `herramientas-gates-y-terminal`. Acá quedan solo las reglas de cómo trabajar.

- **⚡ MÁQUINA DE MEJORAS (Brandon 2026-07-17, DEFAULT)**: modo obsesivo de mejora continua — líder en proponer Y ejecutar. (1) En cada área tocada, buscá activamente la SIGUIENTE mejora (features, UX, estilos, datos, compliance); nunca cerrar en "quedó bien" sin la ronda siguiente propuesta o en marcha. (2) **Autocrítica adversarial ANTES de reportar**: releé tu propio diff como refutador — ¿qué rompí? ¿qué caso falta? ¿cómo se ve en dark/mobile? ¿qué diría un QA hostil? (3) **Obsesión ≠ volumen**: cada mejora con evidencia real (gates + navegador para UI/motion — lección LazyMotion `fc8de71f`: los gates estáticos no atrapan crashes de runtime); una mejora rota vale menos que ninguna. (4) UI siempre al estándar del DS (skill `bsm-design-system`) con screenshot light+dark. (5) Cada patrón/gotcha nuevo → memoria, para que la máquina COMPONGA entre sesiones.

- **Verificación PROACTIVA antes de "listo"**: corré el gate del área tocada (`tsc`/`lint`/`test`/`curl`/screenshot) y pegá la evidencia en el MISMO mensaje, ANTES de afirmar hecho. En tareas >1h o multi-paso, abrí con `/goal "<condición ejecutable>"` y dejá que el evaluador externo cierre. Cuál gate y cuánto cuesta cada uno: memoria `herramientas-gates-y-terminal`.

- **Verificar por el camino del usuario**: un script propio que salta el endpoint prueba la mitad que ya funcionaba. Detalle y los fallos que lo enseñaron: regla `verificacion-de-verdad.md`.

- **Generator ≠ evaluator**: lo que un agente construye lo verifica OTRO agente con contexto fresco (solo diff + criterios, solo gaps de correctness). Auto-elogio = anti-patrón.

- **Propuestas con lentes** (Brandon 2026-09-11, «más perspicaz»): ninguna opción del menú de cierre sin una **medición** detrás (SELECT del tenant real, grep de la pantalla hermana, consola tras navegar, columna que cierra). Procedimiento = skill `ronda-de-mejoras`; estándar = memoria `propuestas-con-lentes`. Un bug que Brandon nombra en texto libre va antes que cualquier feature.

- **Barrido transitivo antes de dar por cerrado un bug de UI**: si el bug era «X se abre desde Y», seguir el grafo de imports (2-3 saltos) para encontrar los hermanos — `scripts/barrido-modales-anidados.mjs` encontró 4 más que a simple vista no se veían. Un bug arreglado en un solo foco vuelve con otro nombre.

- **Trust but verify**: hallazgos de auditores se verifican con evidencia directa (grep preciso, SELECT real, getComputedStyle) antes de actuar. Descartar una hipótesis se reporta igual que confirmarla.

- **2 correcciones fallidas sobre lo mismo** → parar, replantear el prompt/approach, no insistir en loop.

- **Context resets > compaction** en corridas largas: estado a archivos (SESSION_HANDOFF.md, tasks), sesión fresca retoma.

- **Workflow-first en auditorías/migraciones**: "auditá/migrá/revisá X" → workflow `audit-verificado` (verifier en contexto fresco + refutación adversarial), NO N agentes sueltos sin verificación. El verifier independiente es la palanca #1 contra "alucinar terminado".

- **Paralelismo por defecto**: N tool-calls/agentes independientes en 1 mensaje. Gates lentos en background. Para trabajo mecánico, bajá el modelo **en la invocación** del subagente (`model: haiku|sonnet`), no en el def.

- **Un fork hereda TODO tu contexto, incluida tu meta grande** (fricción real 2026-08-19): un fork despachado con una directiva angosta de sólo-lectura puede igual "ayudar" continuando la tarea grande de la conversación — llegó a stagear y commitear en paralelo mientras el hilo principal tocaba el mismo índice de git. Si el hilo principal va a seguir mutando el mismo estado: decile explícitamente "NO continúes ninguna otra tarea, sólo esto". Para redirigir/parar: `SendMessage(to: agentId)` o `TaskStop` — NUNCA `Agent(subagent_type:"fork")` con el mismo `name` (crea un duplicado). Detalle: memoria `fork-tool-anomalous-response`.

- **Nunca `isolation: "worktree"`**: en esta rama larga branchea de una base vieja y se pierde lógica (medido 2026-08-03). Trabajo grande = varios agentes con archivos disjuntos sobre el checkout principal.

- **Podar > agregar** (meta): el harness ya está sobre-extendido. Antes de crear skill/hook/regla nueva, preguntá si una existente sirve o si hay que afilar/borrar. Menos superficie = mejor selección de tools y menos ruido de contexto.
