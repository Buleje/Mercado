# ADR-489 — Contrato de diseño del panel

- **Estado:** aceptado (2026-10-09). Ola 1 del plan «panel unificado» construida: primitivos, censo, trinquete, codemods en seco y gates. Ninguna pantalla migrada todavía (eso es la ola 5).
- **Pedido por:** Brandon (09-10): «organizar y unificar pestañas que repiten funciones, datos, campos y bloques […] un diseño unificado (modal, botón, títulos, subtítulos, filtros, tablas, checks, gráficos, KPIs, estructura, movimiento)». Plan aprobado: `docs/panel/plan-unificacion-2026-10.md` §5.
- **Decisiones de Brandon que fija este contrato (09-10):** botones y filtros de **48 px (h-12)** en todo el panel; **una sola** tarjeta de cifra = `StatCard` del DS con lo mejor del `KpiTile` del Inicio.
- **Extiende:** ADR-069…075 (tipografía, motion, sombras, iconos, DS como fuente única). ADR-071 manda en las duraciones.

## 1. Contexto (medido con `node scripts/censo-ds-admin.mjs`, 2026-10-09)

El panel tiene un componente canónico por familia, pero lo hecho a mano gana por goleada (2.750 archivos de `components/admin` y `app/admin`):

| Familia | Canónico | Hecho a mano |
|---|---|---|
| Botones | `Button` del DS: **0** | 5.236 `<button>` (28 alturas), 170 constantes `BTN/BOTON`, 18 botones locales |
| Títulos | `Kicker` 84 · `SectionTitle` 150 · `CardTitle` 565 | 1.121 rótulos `uppercase tracking-*`, 24 `<h4>` con clase, 23 títulos locales |
| Checks | ninguno | 250 checkbox nativos, 20 `role="switch"`, 15 locales (7 se llaman `Interruptor`/`Casilla`) |
| Gráficos | `COLOR_CONCEPTO` 130 usos | 114 hex en archivos con recharts, 99 paletas locales, 32 tooltips propios, 7 tamaños de eje |
| Tablas | `DataTable` 212 | 54 `<table className>`, 29 estilos de `<th>` |
| Modales | `AdminModal` 251 | 123 archivos con `fixed inset-0` sin modal del DS |
| KPIs | `StatCard` 258 | 46 tarjetas locales + 8 `KpiTile` |
| Movimiento | `duration-[var(--dur-*)]` 118 | 478 `transition-all`, 72 duraciones de framer literales, 20 `duration-*` sin token; `motion.ts` decía 0,15/0,25 s y el CSS 160/240 ms |
| Estructura | `AdminTabBar` 37 | 54 `<details>`, 51 spinners de bloque, 10 `VistaHeader` |

Además, cada gate miraba una carpeta (`admin-module-standards` sólo `unified/*Module.tsx`) y nada impedía un tercer nivel de pestañas (Mi Plata › Por cobrar › Adelantos › 7).

## 2. Decisión

Un canónico por familia; lo demás se migra por carpeta en la ola 5 con codemods ya escritos, y un **trinquete** impide que lo hecho a mano vuelva a crecer mientras tanto.

| Familia | Canónico | Reemplaza | Cómo migra · qué lo cuida |
|---|---|---|---|
| Estructura de pestaña | `AdminTabBar` con `heading` (título adentro) + descripción en ⓘ; `LibroChrome` sólo en libros | `AdminModuleHeader` con antetítulo dentro de hubs, `VistaHeader`, `SegmentedControl` como pestañas, 3.er nivel de barras | a mano (olas 2-4) · `admin-module-standards` sobre las 34 pestañas de TabRouter + `admin-tabs-dos-niveles` (≤ 2 `AdminTabBar` anidados) |
| Navegación por URL | `useVistaModulo` (`?vista=`) con `origen` | `useState` de pestaña, vistas sin registrar | integrador de cada ola · `admin-subvistas-sincronizadas` + `panel-sin-perdida` |
| Títulos | `SectionTitle` (1 por vista) · `CardTitle` · `BlockTitle` · `Kicker` | `uppercase tracking-*` a mano, `<h4>` con 14 estilos, títulos locales | codemod `kicker` (hojas, nunca `<th>`) · trinquete |
| Ayuda y subtítulos | `InfoTip` (what / affects / example) | párrafos de ayuda, `subtitle=`/`description=` | a mano · medir-orden ≤ 60 palabras de ayuda por vista |
| Botones | `Button` del DS (`components/ui-system/Button.tsx`) + función `button()` (`button-variants.ts`, sin "use client": la llama también un archivo de servidor); `IconAction`/`BotonIconoTip`; `ActionMenu` para lo secundario | `<button>` a mano, constantes `BTN/BOTON`, botones locales | codemod `btn-constantes` → `button({ variant, size })`; altura por defecto en **una** constante (`ALTURA_CONTROL` = 48 px) · trinquete |
| Filtros | barra única: buscador + `SegmentedControl` + un filtro de fecha + `filtros-columna` pegado a la tabla, todo a 48 px | filtros locales, 7 alturas de input | clases por codemod, locales a mano · trinquete de alturas |
| Tablas | `DataTable` + columnas-ordenables + filtros-columna + `TableSkeleton` | `<table>` en JSX, 29 estilos de `<th>` | codemod `datatable` (`<table>` → `<DataTable>` con `thead`/`tbody` intactos) · trinquete |
| Checks y switches | `Interruptor` (`role="switch"` + `aria-checked`; sale del `Toggle` de Ajustes, que lo reexporta) y `Casilla` (h-4, `accent-color` con token) en `components/ui-system` | checkbox nativos con clases propias, `role="switch"` a mano, interruptores locales | codemod `casilla`; interruptores a mano · trinquete + test de accesibilidad |
| Modales | `AdminModal` + `ModalFooter` + `aboveModals` + `useModalAccesible` | modales a mano, `ModalShell`, `<Modal>`, `ModalFooter` duplicado | a mano por zona (ola 6) · `barrido-modales-anidados.mjs` + trinquete |
| KPIs | `StatCard` del DS, tipo oración, franja plegable recordada | tarjetas locales (`Cifra`, `Kpi`, `MiniStat`…), los 2 `KpiTile` | `migrate-unified-kpi-to-statcard.mjs` adaptado · trinquete |
| Gráficos | un tema: `COLOR_CONCEPTO` + `SERIES` + `EJE` + `TICK` + `ChartTooltip` (`components/admin/shared/chart-palette.ts` y `ChartTooltip.tsx`) | paletas locales, hex, tooltips propios, 7 tamaños de eje | codemod `hex-graficos` → `var(--data-*)` · regla de lint `ds-no-hex-chart` (warning; error al cerrar la ola 5) + trinquete |
| Movimiento | tokens ADR-071 (80/160/240/400/600 ms) y `motion.ts` alineado (`DURATION` 0,08 · 0,16 · 0,24 · 0,40 · 0,60 s); `m` bajo `LazyMotion` | duraciones y easings literales, `duration-*` sin token, `transition-all` | codemod `motion` → `DURATION`/`EASE`; `transition-all` a mano · `no-arbitrary-duration-ms` + trinquete |
| Plegables | `Plegable` recordado (`components/admin/shared/Plegable.tsx`: `use-local-storage`, plegado sigue mostrando la cifra en una línea) | `<details>` nativos, bloques apilados | a mano (olas 2-4) · trinquete de `<details>` |
| Estados | `LoadingSpinner` · `TabLoadingSkeleton` · `EmptyState` de una frase · error del DS | spinners de bloque a mano, cargadores de texto, `.catch(() => [])` | a mano · el pre-commit ya bloquea `.catch(() => {})` nuevo |
| Permiso de vista | `origen` en cada vista + `<PermisoDe origen>` | «una pestaña = un permiso» | carril O1-K1b · `panel-sin-perdida` |

### Reglas del trinquete (`__tests__/censo-ds-trinquete.test.ts`)

- La línea base es `reports/panel/censo-ds-antes.json` (las 10 familias de `censo-ds-admin.mjs` + estados).
- **Lo hecho a mano sólo puede bajar.** **`Button`, `Kicker`, `DataTable` y `AdminModal` sólo pueden subir.** El resto de las cifras es informativo.
- Apretar la base: `node scripts/censo-ds-admin.mjs --escribir` (se niega si algo empeoró; lo corre el integrador al cerrar cada ola).

### Codemods (`scripts/codemods/*.mjs`)

Todos aceptan `--seco` (imprimen cuántos cambios harían por carpeta, sin escribir), `--carpeta <ruta>`, `--muestra <n>` y `--validar` (parsea cada archivo transformado con TypeScript: tiene que dar 0 rotos). Aplicar exige `--carpeta`: la ola 5 va de a una carpeta, con `npm run typecheck`, captura y censo antes/después. Dos guardas que `--validar` no ve (test `__tests__/codemods-seguros.test.ts`): un archivo que ya tiene el nombre (una `Casilla` propia, un `button` importado de otro lado) no se toca y va «a revisar»; y lo que se llama o se lee al cargar el módulo (`button()`, `DURATION.fast`) no puede venir de un módulo "use client": en un archivo que corre en el servidor es una referencia de cliente y da error 500 (TarjetaEstados ← la página del QR de la troza). Por eso `button()` sale de `button-variants.ts`, y `motion` deja «a revisar» las cifras de framer de un archivo sin "use client". En seco, 2026-10-09:

| Codemod | Qué hace | Cambios | A revisar (no se tocan) | Sintaxis rota |
|---|---|---|---|---|
| `btn-constantes` | `const BTN = "…"` → `button({ variant, size })` | 127 en 112 archivos | 42 | 0 |
| `kicker` | hoja con `uppercase tracking-*` → `<Kicker className="libro-kicker">` | 619 en 325 | 507 (`cn(…)`, no-hojas, `<th>`, color semántico) | 0 |
| `datatable` | `<table className>` → `<DataTable>` | 54 en 47 | 0 | 0 |
| `casilla` | `<input type="checkbox">` → `<Casilla>` | 220 en 180 | 11 (`className={…}`; 2 archivos con su propia `Casilla`) | 0 |
| `hex-graficos` | hex → `var(--data-*)` más cercano | 89 en 19 | 25 (lejos de todo token) | 0 |
| `motion` | `duration: 0.2` → `DURATION.base`, `duration-150` → token | 59 en 40 | 8 | 0 |

## 3. Consecuencias

### Positivas
- Un solo lugar decide la altura de botones y filtros, el tema de los gráficos, las duraciones y el aspecto de checks y switches: cambiar el panel entero es cambiar una constante.
- El trinquete hace que cada carril de las olas 2-6 deje el panel igual o mejor, sin depender de que alguien revise el diff.
- `admin-module-standards` toma la lista de pestañas de TabRouter: una pestaña nueva entra sola al control.

### Negativas
- Hasta la ola 5 conviven el canónico y lo hecho a mano (el trinquete sólo impide que crezca).
- `admin-tabs-dos-niveles` mide por imports, no por render: un import sólo por una constante cuenta como nivel (la cadena va en el mensaje para juzgarlo).

### Migraciones requeridas
- Ola 5 (por carpeta D1-D6): codemods, después a mano KPIs → `StatCard`, filtros a la barra única, `transition-all`, spinners. Al cerrar: baja el trinquete y `ds-no-hex-chart` pasa a error.
- Ola 6: modales a mano.

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| Migrar todo en una pasada | termina antes | 5.236 botones en 2.600 archivos, sin poder revisar; choca con 6 carriles que mueven pantallas | rompe la regla «mover = montar» de las olas 2-4 |
| Sólo reglas de lint | barato | `lint-staged` sólo mira lo staged: no impide que la suma crezca | el trinquete cuenta el panel entero |
| `@radix-ui/react-switch` / `react-checkbox` | accesibles de fábrica | dependencia nueva para lo que un `<button role="switch">` y un checkbox nativo con `accent-color` ya resuelven | sin ganancia medible |
| `button()` con `rounded-xl` del panel | se parece a lo de hoy | contradice el DS (pastilla) | lo decide el DS; si Brandon lo pide, es un cambio en un solo lugar |

## 5. Verificación
- [x] `__tests__/censo-ds-trinquete.test.ts`, `__tests__/admin-tabs-dos-niveles.test.ts`, `__tests__/admin-module-standards.test.ts`, `__tests__/interruptor-casilla.test.tsx`
- [x] `npx tsx scripts/lint-design-tokens.ts` con la regla nueva
- [x] Codemods en seco con `--validar`: 0 archivos con la sintaxis rota
- [x] Arnés SSR (componentes reales + CSS real compilado, Chromium) claro/oscuro × 1280/400: casilla 16 px con `accent-color` del token, desborde 0
- [x] Pasada de diseño (09-10, mismo arnés): toque de 48 px (`ALTURA_CONTROL`) en interruptor, casilla con etiqueta, campos y «Guardar» de Ajustes; «Guardar cambios» en oscuro 1,11:1 → 17,75:1 y «¡Guardado!» en claro 1,12:1 → 19,8:1 (`button()` primario/secundario); etiqueta de campo en oscuro 3,29:1 → 8,67:1 (`dark:text-muted` compilaba al gris del tema claro)
- [ ] Captura en el panel (`/admin?tab=config&vista=cobros`): el dev server estaba colgado el 09-10 (login > 120 s, dos veces)
- [ ] Variante `accent` de `button()` (hoy sin usos; el codemod de la ola 5 le manda los botones turquesa): blanco sobre `#00A0A0` = 3,21:1 y sobre `#14C2C2` (oscuro) = 2,20:1, bajo el 4,5:1. Decide Brandon antes de la ola 5: fondo `--accent-dark` (4,86:1) o texto oscuro (6,16:1 · 8,58:1 en oscuro)
- [ ] Ola 5: codemods aplicados por carpeta con censo antes/después

## 6. Referencias
- `docs/panel/plan-unificacion-2026-10.md` §1 (R4), §5, §7.5
- ADR-069…075 · `.claude/rules/ui-components.md` (ley de la vista) · `.claude/skills/bsm-design-system`
