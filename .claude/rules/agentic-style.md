# Estilo de ejecución (siempre activo)

> Afinada 2026-10-02 para velocidad (Brandon: «evitar pasos que siempre dan el mismo resultado»). Detalle de gates, RAM y terminal: memoria `herramientas-gates-y-terminal`.

## Economía: cada paso tiene que poder cambiar la decisión

Medido en 40 sesiones y 592 subagentes: un subagente promedia **136 turnos** y cada turno relee todo su contexto; el hilo principal corrió 780 typecheck, 630 lint y 727 vitest a mano, y 238 de esos justo antes de un `git commit` que los vuelve a correr.

| Paso | SÍ | NO (repite el resultado) |
|---|---|---|
| `npm run typecheck` | 1 vez al cerrar un lote de edits TS | tras cada edit · antes de `git commit` (el pre-commit lo corre) |
| `npm run lint` | nunca a mano: falló 2 % de 1.079 veces | lint-staged lo corre en el commit |
| `vitest run <archivo>` | tocaste lógica que tiene test, o escribiste el test | copy, estilos, config · antes del commit (corre `vitest related`) |
| Capturas UI | `qa-capturas` en 1 llamada; leer 1 imagen (claro 1280) | leer las 4 sin haber tocado color/layout · MCP para un recorrido conocido |
| `reviewer` | zona de peligro, dinero/stock/estado, lógica nueva >150 líneas, bug que Brandon reportó | copy, estilos, config, hotfix <20 líneas → autorrevisión del diff |
| `security` | zona de peligro, RBAC, datos cruzados entre tenants | el resto |
| Menú de cierre con 8 lentes | INITIATIVE, o cuando pide ideas/opciones | HOTFIX o paso intermedio → 1 línea con el siguiente paso |
| Releer un archivo | lo cambió otro agente | lo acabás de editar (Edit falla solo si no matchea) |

- Salidas recortadas: `| tail -20`, `| grep -E 'error|FAIL'`. Nunca volcar archivos o logs enteros.
- Lectura: `grep -n` → `Read` con offset/limit. Explore solo para preguntas abiertas.
- Gate rojo mecánico: 1 intento propio, después `healer`. 2 correcciones fallidas sobre lo mismo → parar y replantear.
- Antes de proponer una opción, reusar lo medido en la tarea; medir de nuevo solo lo que falta.

### Autoajuste (Brandon 2026-10-02: «que te autosustentes y mejores cada vez sin mi intervención»)

1. **Al arrancar**: la línea «🏎️ Economía (sesión anterior)» del arranque trae señales. Cada señal se corrige en ESTA sesión (no se comenta).
2. **Durante**: si un paso se repite 3 veces igual (el mismo recorrido de capturas, el mismo SELECT, el mismo arreglo a mano), se convierte en script o en paso de `qa-capturas` antes de la 4.ª.
3. **Al cerrar** una FEATURE o INITIATIVE: una línea «Velocidad:» con lo que más turnos costó y su arreglo. Si el arreglo es reversible y no toca zona de peligro (regla, script, paso que sobra en un def), **se aplica en el mismo cierre sin preguntar** y se anota en la memoria `economia-de-ejecucion-2026-10-02`. Lo que toque calidad o dinero, se propone.
4. Los subagentes devuelven «Para acelerar:» en su reporte: el hilo principal lo aplica o lo descarta, nunca lo ignora.
5. Podar > agregar también acá: un ajuste que no movió su cifra en 2 sesiones se revierte.

## Cómo trabajar

- **Máquina de mejoras** (Brandon 2026-07-17): en el área tocada buscá la siguiente mejora y proponela. Antes de reportar, releé tu diff **una vez** como refutador (¿qué rompí? ¿dark/mobile? ¿caso faltante?). Obsesión ≠ volumen: una mejora rota vale menos que ninguna. Gotcha nuevo → memoria.
- **Verificar por el camino del usuario** (regla `verificacion-de-verdad`): evidencia pegada en el mismo mensaje antes de decir «listo». Los gates estáticos no ven crashes de runtime (LazyMotion `fc8de71f`): si cambia lo que se dibuja, 1 captura.
- **Generator ≠ evaluator** donde la tabla pide `reviewer`: contexto fresco, solo diff + criterios. Auto-elogio = anti-patrón.
- **Trust but verify**: hallazgos de auditores con evidencia directa (grep, SELECT, getComputedStyle) antes de actuar. Descartar una hipótesis se reporta igual que confirmarla.
- **Propuestas con lentes**: ninguna opción sin medición (skill `ronda-de-mejoras`, memoria `propuestas-con-lentes`). Un bug que Brandon nombra va antes que cualquier feature.
- **Barrido transitivo** al cerrar un bug de UI «X se abre desde Y»: `scripts/barrido-modales-anidados.mjs` encuentra a los hermanos.
- **Paralelismo**: lo independiente en UNA tanda (lecturas, greps, gates de áreas distintas, agentes con archivos disjuntos, el curl y el SELECT de la misma hipótesis). Wall-clock ≈ nº de tandas. Meta ≥1,5 llamadas/mensaje (la cifra de la sesión anterior sale en el arranque). Gates lentos en background.
- **Auditorías/migraciones** → workflow `audit-verificado`. Corridas largas → estado a archivo (SESSION_HANDOFF.md) y sesión fresca, mejor que compactar.
- **Podar > agregar**: antes de crear skill/hook/regla, ver si una existente sirve o hay que afilarla/borrarla.

## Con qué modelo invocar cada subagente (override en la invocación)

| Agente | `haiku` | `sonnet` | heredar (Opus) |
|---|---|---|---|
| `frontend` | barrido repetitivo con patrón ya escrito | una pantalla con patrón establecido | diseño nuevo, motion, bug de layout que no se ve en el DOM |
| `backend` | mover un endpoint al patrón ya escrito | CRUD con Zod sobre una DB class existente | dinero, RBAC, state machine, integración nueva |
| `database` | — | índice o columna aditiva | migración con datos, drift, schema |
| `tester` | tests de un contrato definido; correr y reportar | reproducir un bug conocido | recorrido de usuario real con Playwright |
| `reviewer` | **nunca** | diff chico de un área | zona de peligro, `diagnose` de un bug reportado |
| `security` / `architect` | **nunca** | — | siempre |
| `healer` | tokens del DS, lint puro | default del def | — |

## Forks y worktrees

- Un fork hereda TODA tu meta: si el hilo principal sigue mutando el mismo estado, decile «NO continúes ninguna otra tarea, sólo esto». Redirigir con `SendMessage`, nunca un fork nuevo con el mismo `name` (memoria `fork-tool-anomalous-response`).
- Nunca `isolation: "worktree"`: en esta rama larga branchea de una base vieja y se pierde lógica (2026-08-03). Trabajo grande = agentes con archivos disjuntos sobre el checkout principal.
- Con agentes en paralelo, antes de CREAR un archivo: `ls` la ruta. Un Write pisa lo que otro agente creó y todavía no está en git (03-10: el backend del croquis borró `planta-croquis.ts` del frontend; se salvó desde la transcripción). Contrato de tipos compartido = escribirlo y confirmarlo ANTES de lanzar a los dos.
