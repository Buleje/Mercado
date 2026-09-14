# SESSION HANDOFF — 2026-09-14 (tarde)

Branch: `audit/storefront-mejoras-verificadas-2026-06-15`, al día con `origin` (sin commits por subir).
Detalle completo y cómo revertir cada cosa: memoria `harness-refresh-2026-09-14`.

## ✅ Hecho y subido hoy (tarde)
| Commit | Qué | Verificación |
|---|---|---|
| `1087d258` + `4da8a134` | Harness al día con Claude Code 2.1.270: 8 agentes (`inherit`, skills, Playwright), hook `SubagentStart`, `StopFailure`, teams OFF, `/verify` → `/gates`, `typecheck:fast` = TypeScript 7 nativo | validadores, 2 subagentes reales, reviewer independiente |
| `13ece52b` · `2419f560` · `50c9fd72` | next 16.2.10, `@playwright/mcp` 0.0.76 (+ Chromium 1226), TypeScript 7.0.2 nativo sin pisar `tsc` 5.9 | build-gate limpio, MCP navegando la tienda |
| `10aa335f` · `e74dfa42` · `832c40fa` · `e47a91ba` | WIP de RRHH de la mañana: scripts QA sólo en `-qa`, Tareas en la barra, traer desde Adelantos, almacenero sin 403 (1ª parte) | 79 + 994 tests, endpoint 200/403/401 |
| `560cb51b` | Aviso de caja abierta desde un día anterior | tests + navegador (claro, oscuro, 400 px, clic al cuadre) |
| `85e5a3ef` · `08c18c45` · `3ba47215` | 0 avisos de eslint heredados · almacenero sin ningún 403 · 4 módulos con `?vista=` | navegador QA: 0 × 4xx, 0 errores de consola |

## 🖥️ Entorno (rige desde una terminal nueva)
- `claude` se lanza en un scope de systemd con tope de RAM de 13G para los Bash (función en `~/.bashrc`); el boot de sesión dice si está activo.
- Barra de estado en `~/.claude/statusline.mjs` (RAM, tope, dev, rama, caché).
- El MCP de Playwright de una sesión abierta antes del upgrade no encuentra Chromium hasta `/mcp` reconnect; para medir, scripts con `require("playwright")` del repo (ejemplos en el scratchpad de la sesión).

## ⏳ Pendiente (en el radar, con medición)
1. **Producción 2.696 commits atrás** (master del 09/05): 20 migraciones Prisma + 70 SQL sueltos, 55 → 87 crons. La caja real de 95 días no se cierra sola hasta que esto llegue. Decide Brandon.
2. 10 módulos anidados sin `?sub=` (lista en el radar).
3. 41 `.catch(() => null)` en el panel.
4. Vitest 5 bloqueado hasta que `@vitest/browser-playwright` publique 5 estable (limpiar mocks: 0 de 9.948 tests fallan).
5. Brandon: `/skill-doctor` y `/doctor`.

## 🧹 Estado de QA
Tenant `inversiones-agroforestales-blas-sociedad-op-qa-ui` en `active=false`, sin cajas sembradas. `qaadmin` y `qaalmacenero` existen ahí (se reactivan con `scripts/create-qa-*.mjs`, que abortan en tenants que no son `-qa`).
