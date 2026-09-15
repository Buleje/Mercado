# SESSION HANDOFF — 2026-09-14 (tarde)

Branch: `audit/storefront-mejoras-verificadas-2026-06-15`. **Todo subido** (push de la noche: `dbcbc4a7`, `93978b2e`, `e7b11141` y la ronda de la consola).
Detalle completo y cómo revertir cada cosa: memoria `harness-refresh-2026-09-14`.

## ✅ Hecho y subido hoy (tarde)
| Commit | Qué | Verificación |
|---|---|---|
| `1087d258` + `4da8a134` | Harness al día con Claude Code 2.1.270: 8 agentes (`inherit`, skills, Playwright), hook `SubagentStart`, `StopFailure`, teams OFF, `/verify` → `/gates`, `typecheck:fast` = TypeScript 7 nativo | validadores, 2 subagentes reales, reviewer independiente |
| `13ece52b` · `2419f560` · `50c9fd72` | next 16.2.10, `@playwright/mcp` 0.0.76 (+ Chromium 1226), TypeScript 7.0.2 nativo sin pisar `tsc` 5.9 | build-gate limpio, MCP navegando la tienda |
| `10aa335f` · `e74dfa42` · `832c40fa` · `e47a91ba` | WIP de RRHH de la mañana: scripts QA sólo en `-qa`, Tareas en la barra, traer desde Adelantos, almacenero sin 403 (1ª parte) | 79 + 994 tests, endpoint 200/403/401 |
| `560cb51b` | Aviso de caja abierta desde un día anterior | tests + navegador (claro, oscuro, 400 px, clic al cuadre) |
| `85e5a3ef` · `08c18c45` · `3ba47215` | 0 avisos de eslint heredados · almacenero sin ningún 403 · 4 módulos con `?vista=` | navegador QA: 0 × 4xx, 0 errores de consola |

## ✅ Hecho hoy (noche) — commits locales, sin subir
| Commit | Qué | Verificación |
|---|---|---|
| `a84585b8` | RRHH rediseñado: modales con 24 px de margen (antes 0), ficha en tarjetas, navegador de fechas, y 6 fallas (manager sin puestos por 403, `?vista=` reescrita, recargar devolvía a hoy, puesto en línea sin elegir, «14 días × S/ 45 = S/ 270», foco del buscador) | tsc + 159 tests + navegador claro/oscuro/400 px, banda de pestañas en 7 hubs |
| `67088707` | RRHH: agregar persona con monto daba 422 (faltaba `vigenteDesde`), manager 403 al agregar, horas de jornada en tarifas por hora, hoja del mes en celular por persona (1.490 → 504 px) | camino de UI como admin y `qamanager` |
| `fd20c5a9` | RRHH: jornada editable en puestos y sin 403 de Adelantos para almacenero y manager | 0 respuestas 4xx por rol |
| `b6d10ad6` | Logger de producción tiraba TypeError en el navegador (`process.stdout`): 42 componentes cliente | test que fallaba 2 de 3 antes del arreglo |
| `ef165c94` · `2205edc6` · `0270feb9` | Errores tragados con `sinDato`, 9 módulos con `?sub=`, fecha en el aviso de caja | reviewer con contexto fresco + 259 archivos de test (2.898 ✓) |
| `dbcbc4a7` | 104 de 107 `.catch(() => null)` del servidor con `sinDato`/`leerJson`/`descartarEsperado`; el log ya no guarda valores de Prisma; metas, tareas y beta-feedback no reescriben un JSON corrupto | auditoría `security` sin veto + 24 tests nuevos |
| `93978b2e` | Tuteo en todo el panel: `components/admin`, `app/admin`, hooks, `lib`, mensajes de `app/api` y prompts de IA | detector genérico: 0 residuo real en el panel; 3.289 tests; 19 aserciones actualizadas |

## 🔧 Consola del panel (noche) — `1da711dd` · `b1937ca3` · `83d4b848`, subidos
Pedido: «soluciona problemas y errores en general» + log de consola con 404 en `me/specializations`, `notifications/stream`, `chat/threads` y `rrhh/colaboradores/desde-adelantos`.
| Qué | Causa medida | Verificación |
|---|---|---|
| 404 en rutas que existen | Estado viejo en memoria del dev server: `route.js` y chunks EN disco, el handler ni corría (sin `[AUTH] OK`). `touch` de una ruta → todas 200. «Reiniciar sin limpiar las rompe»: descartado | curl con sesión 6/6 200; memoria `next-dev-manifest-stale-404-api` |
| `SSEListener` borrado | Escuchaba con `onmessage` y el servidor manda eventos con nombre: nunca recibió nada; sus eventos tenían 0 listeners | RRHH en navegador: EventSource a la vez 3 → 2 |
| Reconexión del stream de notificaciones | 10 s fijos para siempre; si fallaba la verificación de sesión, abandonaba hasta recargar | test nuevo 6/6 (espera exacta 10/20/40 s, tope 5 min) |
| 10 `console.error` de RRHH → `sinDato` | Cada falla de carga salía como error rojo en el overlay de Next | eslint 0, typecheck 0, vitest 9/9, consola RRHH 0 errores / 0 × 4xx |

## 👥 RRHH: hoja semanal con lo ganado + PDF con firma + fotocheck (ADR-416) — SIN commitear
Pedido de Brandon (texto libre en la ronda de cierre): formato semanal en Asistencia con ganancia diaria y semanal acumulada, referencia, días trabajados, PDF con columna de firma; y en Personal un fotocheck con foto y QR descargable en PDF.
| Qué | Verificación |
|---|---|
| `calcularGanado` devuelve `dias` (importe por día) y `referencia`; el total sigue saliendo de los tramos | 4 tests nuevos (semanal 350 ÷ 7, jornal, fuera de período, sin tarifa) |
| Modo **Semana** en Asistencia: tabla editable con importe del día, días trabajados, faltas, referencia y ganado (sólo admin/owner), calendario en celular | navegador con 2 personas de prueba: S/ 225 + S/ 330 = S/ 555, 8 días; 0 × 4xx, 0 errores; 400 px sin scroll horizontal |
| PDF semanal A4 apaisado con firma, total, leyenda y copy de referencia | texto extraído + render con `pdftoppm` |
| **Foto** (`Colaborador.fotoUrl`, SQL `adr-416-foto-colaborador.sql` APLICADO) subida a `/api/upload` carpeta `rrhh`; botón **Fotocheck** en la ficha y **Fotochecks (N)** en Personal; `?persona=<id>` abre la ficha (destino del QR) | e2e: upload 200 + PATCH 200 + https en la base, PDF renderizado, quitar → null; imagen del bucket y datos de prueba borrados |
| `scripts/dev-with-canary.mjs`: sonda al arrancar; si una ruta /api da HTML 404 (estado viejo al relanzar), toca su route.ts y la refresca | medido: con `/api/health` en 404, tocar la ruta → health 200 y sonda 401; el log dice `rutas /api al día` |
**Producción:** aplicar `adr-415-metas-y-tareas.sql` y `adr-416-foto-colaborador.sql` ANTES de subir el código.

## 🗂️ Metas y tareas por negocio (ADR-415) — SIN commitear
Pedido: «Metas y tareas por negocio». Antes: `local-data/*.json` sin `tenantId` (una lista para los 14 negocios) y en Vercel el disco es de sólo lectura (producción nunca guardó una).
| Qué | Verificación |
|---|---|
| SQL `prisma/migrations/adr-415-metas-y-tareas.sql` **APLICADO** a la base (2 tablas, 4 índices, CHECK de listas cerradas, REVOKE a anon) | 8/8 sentencias; tablas en 0 filas, 6/4 CHECK, 0 permisos anon |
| Modelos `AdminGoal`/`AdminTask` + `TENANT_MODELS`, clases `lib/db/admin-{goals,tasks}.db.ts`, contrato `lib/admin/metas-tareas.ts`, 4 rutas con Zod + CSRF | `prisma validate`, typecheck 0, eslint 0, 18 tests de ruta |
| Zod 4: `.partial()` aplica los `.default()` → esquema de edición aparte | medido con zod 4.4.3; test «PATCH {current} no pisa la categoría» |
| TasksTab avisa si guardar/cambiar estado/borrar falla; `completedAt` lo pone el servidor | navegador |
| Carga vieja que pisaba lo optimista (Tareas y Metas): el GET del doble montaje volvía 470 ms después de Eliminar y la tarea reaparecía | e2e 11/11 (antes 10/11) + test de componente que falla sin la guarda |
**Producción:** aplicar el SQL ANTES de subir este código (sin tablas → P2021 y el panel de metas vacío).

## ⚠️ Pendientes medidos de esta noche
- Voseo fuera del panel: ~370 en marketplace/tienda, ~166 en superadmin, checkout (zona de peligro) y landing.
- 2 `.catch(() => null)` en zona de peligro: `app/api/orders/route.ts:479`, `app/api/checkout/fiado-option/route.ts:30`.

## 🖥️ Entorno (rige desde una terminal nueva)
- `claude` se lanza en un scope de systemd con tope de RAM de 13G para los Bash (función en `~/.bashrc`); el boot de sesión dice si está activo.
- Barra de estado en `~/.claude/statusline.mjs` (RAM, tope, dev, rama, caché).
- El MCP de Playwright de una sesión abierta antes del upgrade no encuentra Chromium hasta `/mcp` reconnect; para medir, scripts con `require("playwright")` del repo (ejemplos en el scratchpad de la sesión).

## ⏳ Pendiente (en el radar, con medición)
1. **Pase a producción** — plan publicado: https://claude.ai/code/artifact/32bd1a51-c14e-4676-be0a-c09a0b108470. Producción = CLI del 16/07 (`7774f5ca`, rama `prod`), +901 commits por subir. Bloqueos: `DATABASE_URL` de Vercel con `app_user` (todos los previews fallan) y 7 crons nuevos que mandan mensajes. (Lo que decía antes sobre `master` estaba mal: `master` está abandonada.)
2. `AnalyticsBIModule`, `ForestalTramites` y `MarketplaceModule` sin vista en la URL (necesitan diseño; ver radar).
3. ~108 `.catch(() => null)` del lado servidor (`app/api`, `lib`).
4. Vitest 5 bloqueado hasta que `@vitest/browser-playwright` publique 5 estable (limpiar mocks: 0 de 9.948 tests fallan).
5. Brandon: `/skill-doctor` y `/doctor`.

## 🧹 Estado de QA
Tenant `inversiones-agroforestales-blas-sociedad-op-qa-ui` **inactivo** (`active=false`, apagado al terminar); conserva: 9 personas «QA …», 4 puestos, asistencia del 08 al 14/09. Usuarios `qaadmin`, `qaalmacenero` y `qamanager` (`scripts/create-qa-manager.mjs`); para reactivarlo: `active=true` en `Tenant`.
