# Estilo de ejecución (siempre activo)

> Afinada 2026-10-02 para velocidad (Brandon: «evitar pasos que siempre dan el mismo resultado»). Detalle de gates, RAM y terminal: memoria `herramientas-gates-y-terminal`.

## Economía: cada paso tiene que poder cambiar la decisión

Medido en 40 sesiones y 592 subagentes: un subagente promedia **136 turnos** y cada turno relee todo su contexto; el hilo principal corrió 780 typecheck, 630 lint y 727 vitest a mano, y 238 de esos justo antes de un `git commit` que los vuelve a correr.

| Paso | SÍ | NO (repite el resultado) |
|---|---|---|
| `npm run typecheck` | 1 vez al cerrar un lote de edits TS (los errores del archivo editado ya llegan solos tras el Edit: plugin `buleje-ts7-lsp`, 0,4 s) | tras cada edit · antes de `git commit` (desde 03-11 un typecheck verde deja sello en `.git/buleje-sellos` y el commit no lo repite si el código no cambió) |
| `npm run lint` | nunca a mano: falló 2 % de 1.079 veces | lint-staged lo corre en el commit |
| `scripts/dev-helpers/probar.sh <archivos>` (03-11: mismos tests que el commit + sello → el commit no los repite; reemplaza `vitest related` a mano) | tocaste lógica que tiene test, o escribiste el test · si un componente ahora pide algo al montar (un hook con `fetch`), `npx vitest related <archivos> --run`: los tests que cuentan `fetch` de sus padres se rompen (15-10, catálogo de especies → 4 del censo, commit caído) | copy, estilos, config · antes del commit (corre `vitest related`) |
| Capturas UI | `qa-capturas` en 1 llamada; leer 1 imagen (claro 1280) | leer las 4 sin haber tocado color/layout · MCP para un recorrido conocido |
| `reviewer` | zona de peligro, dinero/stock/estado, lógica nueva >150 líneas, bug que Brandon reportó | copy, estilos, config, hotfix <20 líneas → autorrevisión del diff |
| `security` | zona de peligro, RBAC, datos cruzados entre tenants | el resto |
| Menú de cierre con 8 lentes | INITIATIVE, o cuando pide ideas/opciones | HOTFIX o paso intermedio → 1 línea con el siguiente paso |
| Releer un archivo | lo cambió otro agente | lo acabás de editar (Edit falla solo si no matchea) |

- Salidas recortadas: `| tail -20`, `| grep -E 'error|FAIL'`. Nunca volcar archivos o logs enteros.
- Lectura: `grep -n` → `Read` con offset/limit. Explore solo para preguntas abiertas. Símbolos (dónde se define, quién usa X, qué tipo tiene): herramienta `LSP` (82 referencias en 0,1 s) antes que grep.
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
- **Lo corto, sin delegar** (Brandon 30-10: «cuando lo delegas es muy lento»): un cambio de 1-3 archivos lo hace el hilo principal (Brandon ve cada paso; un subagente le muestra «esperando» y relee su contexto en cada turno). Se delega desde 4 archivos o para correr partes en paralelo de verdad.
- **Un carril = una cosa** (30-10): un pedido con N partes independientes → N carriles en UNA tanda (archivos disjuntos), nunca N partes en fila en un carril (30-10: lote + tipo + aviso de foto en uno = 186 turnos, 27 min). **Tramos (03-11):** un brief que se calcula en >100 pasos (2+ pantallas, endpoint + pantalla + test, «todo el módulo») se parte en tramos de ≤1 pantalla o ≤1 endpoint con su DB class; si un ayudante vuelve con «Falta: …», el tramo siguiente arranca con ESE texto y no con el brief entero (medido: opus que construye = 141-154 pasos y 37 min; >120 mil de conversación = 9 s/paso vs 5,7). Los ayudantes se resumen solos al 60 % de su conversación (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60` en `~/.claude/settings.json`; el hilo principal no lo nota: rota a los 200 mil de 1 millón). Medir el domingo con `scripts/dev-helpers/ayudantes/medir.sh`: si suben los retrabajos o el resumen pierde datos, sacar la variable.
- **Sesiones de fondo** (Brandon 2026-10-07: «cada pedido largo en su propia sesión y verlos en un tablero»): en un mensaje con varios pedidos, el que es largo (≥10 min) y no comparte archivos con los demás va a `claude --bg --name "<2-4 palabras>" "<pedido literal + contexto + archivos que NO toca>"`. Brandon lo sigue y le contesta en `claude agents` (alias `agentes`) o en el celular (Remote Control). Editan el checkout principal (`worktree.bgIsolation: "none"`, por la regla de no-worktree): archivos disjuntos o en fila. Lo corto o lo que necesita mi contexto → subagente. Una vacía cuesta ~460 MB (daemon + pty), y una que editó TS suma su servidor de TypeScript (~2,7 GB): al terminar, `claude stop <id>` (15-10: dos sesiones vivas = 5,5 GB de LSP y el sistema mató un commit por memoria). Con menos de 8 GB disponibles (`free -g`, columna available), subagente en vez de sesión de fondo: comparte el LSP del hilo principal.
- **Auditorías/migraciones** → receta `audit-verificado` con ayudantes sueltos (Workflow apagado desde 02-11, CLAUDE.md §8.10). Corridas largas → estado a archivo (SESSION_HANDOFF.md) y sesión fresca, mejor que compactar.
- **Podar > agregar**: antes de crear skill/hook/regla, ver si una existente sirve o hay que afilarla/borrarla.

## Con qué modelo invocar cada subagente (override en la invocación)

Desde 30-10 `frontend`/`backend`/`database`/`tester`/`reviewer` corren en `sonnet` si no se pasa `model` (antes heredaban Opus xhigh: 27 min contra 2-5). La 3.ª columna hay que pedirla con `model: "opus"`; `security`/`architect` heredan. `pre-tool-guard` frena un `Agent` sin `model` si es `general-purpose` o si el prompt nombra dinero/permisos/zona de peligro.

| Agente | `haiku` | `sonnet` (default del def) | `opus` (pasarlo explícito) |
|---|---|---|---|
| `frontend` | barrido repetitivo con patrón ya escrito | una pantalla con patrón establecido | diseño nuevo, motion, bug de layout que no se ve en el DOM |
| `backend` | mover un endpoint al patrón ya escrito | CRUD con Zod sobre una DB class existente | dinero, RBAC, state machine, integración nueva |
| `database` | — | índice o columna aditiva | migración con datos, drift, schema |
| `tester` | tests de un contrato definido; correr y reportar | reproducir un bug conocido | recorrido de usuario real con Playwright |
| `reviewer` | **nunca** | diff chico de un área | zona de peligro, `diagnose` de un bug reportado |
| `security` / `architect` | **nunca** | — | siempre |
| `Explore` / búsqueda (Brandon 02-11) | listar, contar, «dónde está X», grep amplio, bajar y resumir páginas | investigar con criterio (comparar fuentes, refutar) | — |

**Esfuerzo (Brandon 04-11: «pon el esfuerzo xhigh por defecto y trabaja con eso en general»):** TODO en `xhigh` — sesión (`effortLevel`, `CLAUDE_CODE_EFFORT_LEVEL`, `modelSettings` de opus/sonnet/fable), ayudantes (`CLAUDE_CODE_SUBAGENT_EFFORT=xhigh`) y los defs con `effort:` (`architect`, `security`, `healer`). Al invocar un `Agent`, si pasás `effort`, que sea `"xhigh"`. No bajarlo por velocidad sin que Brandon lo pida (31-10 se había bajado a `medium` para ayudantes más rápidos; 04-11 lo revirtió).
| `healer` | tokens del DS, lint puro | default del def | — |

## Forks, worktrees y carriles en paralelo

- Nunca `isolation: "worktree"` (rama larga, base vieja → se pierde lógica).
- **Antes de lanzar 2+ ayudantes que editan, un fork o un workflow con carriles: leer `.claude/docs/carriles-en-paralelo.md`** (fork hereda la meta, revisores con tope, `commit-carril.sh -- paths`, guardianes por carril, tsc acotado, `ls` antes de crear).
