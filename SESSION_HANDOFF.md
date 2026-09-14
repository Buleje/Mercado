# SESSION HANDOFF — 2026-09-14 (tarde)

Branch: `audit/storefront-mejoras-verificadas-2026-06-15`. **Los commits de la noche están SÓLO en local** (subir con `git push` cuando Brandon lo pida).
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
Tenant `inversiones-agroforestales-blas-sociedad-op-qa-ui` **activo** para verificar RRHH: 9 personas «QA …», 4 puestos, asistencia del 08 al 14/09. Usuarios `qaadmin`, `qaalmacenero` y `qamanager` (nuevo, `scripts/create-qa-manager.mjs`); los scripts abortan en tenants que no son `-qa`. Apagarlo (`active=false`) cuando termine la verificación.
