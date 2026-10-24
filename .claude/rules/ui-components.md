---
paths:
  - "components/**"
  - "app/t/**"
  - "app/(store)/**"
  - "app/(store)/marketplace/**"
  - "app/superadmin/marketplace/**"
---

# Reglas al tocar UI visible

- Sin hex hardcodeados — tokens del DS (`@buleje/design-system`). Paleta por token: turquesa del logo = `--accent` (hover `-600`, texto sobre claro `-dark`, texto sobre tinte `-ink`) o, en clases de Tailwind, `bg-primary`/`text-primary` (`--color-primary`: familia paralela casi igual y la más usada), coral = `--data-warning-*`. Los valores cambian por tema: `rg -n -- '--accent|--color-primary' app/globals.css`.
- Tipografía y filtros: ver «Tipografía y tamaños» más abajo.
- `gray-*` siempre con variante `dark:`. Rojo = `--data-error-*` (NO existe `--data-danger-*`).
- Tokens dark reales: `--color-card/foreground/muted` (no `--card`).
- NO emojis genéricos en UI — Lucide icons o SVG custom.
- `"use client"` PRIMERA línea, solo si hay interactividad; imports después del directive.
- Máx ~300 líneas por componente; lógica a `hooks/`.
- No modales bloqueantes en pantallas de entrada; si hay modal: click-fuera + Escape.
- **Modal que se abre desde OTRO modal** → `<AdminModal aboveModals>` (los modales a mano del forestal van en z-60 y Radix en z-50: sin eso se monta detrás y Radix apaga los clics de toda la página). Modal a mano nuevo → `useModalAccesible` (cede el teclado si hay otro diálogo encima). Verificar: `node scripts/barrido-modales-anidados.mjs` en verde.
- Fechas date-only del libro: aritmética en UTC; el «hoy» con `limaDateKey()` (a las 20:00 de Pucallpa el UTC ya es mañana). Meses escritos a mano («setiembre»), no `Intl` (cambia por versión de ICU).
- Copy: tuteo peruano (Cobra/Elige/"por ti"), nunca voseo.
- No anidar `<button>` dentro de `<a>` (StoreCardCanonical gotcha).
- `overflow:hidden` en un ancestro rompe `position:sticky`.
- Páginas `(store)` NO renderean su propio nav/footer (el layout lo da).
- Next metadata: re-declarar `robots`/`alternates` en una page PISA el root (no merge) — heredar robots, re-declarar alternates completo.

## Tipografía y tamaños (regla blindada de Brandon, 2026-04-28)

«Evita a toda costa letras diminutas… Filtros: cuadrados, más visibles, más grandes.» Escala oficial: ADR-070.

- **Jerarquía**: `PageTitle` (la página) › `SectionTitle` (la vista) › `CardTitle` (un bloque). Nunca `<h1>`/`<h2>`/`<h3>` con clases a mano.
- **Tienda y marketplace**: body y CTA `text-base` mínimo, CTA a `h-12`; nunca `text-xs` en texto corrido.
- **Panel**: body `text-sm`; `text-xs` solo para etiquetas, fechas y meta de tablas; íconos de cifras `h-4`/`h-5`, nunca `h-3`.
- **Diminuto**: prohibido `text-[10px]` (y `[9px]`, `[11px]`, `[13px]`). Los 10 px solo con el token (`text-[length:var(--ts-2xs)]`) y solo en `Kicker`, sparklines, badges y pills numéricos (`1/12`); en el panel ese token ya vale 12 px.
- **Filtros de tienda** (buscador, orden, toggles): `h-12 text-base border-2 rounded-2xl` (en móvil `max-md:rounded-none`), ícono `h-5 w-5`, foco `focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]`; toggles de vista cuadrados `h-12 w-12`. Receta: `components/marketplace/store-detail/StoreCatalog.tsx`.
- Si pasas por un componente con `text-xs` en texto corrido, `h-8` en un filtro o un `border` de 1 px, súbelo aunque no sea el foco.

## Organización de una vista — la ley de Brandon (2026-09-19)

Aplicada y medida en Trozas (5,4 → 1,7 pantallas), Secciones del LOTH (tabla de y=926 → y=576) y en la banda de los libros (113 → 64 px). Pedido textual: «sin componentes dispersos que hacen que sea complicado y difícil de usar; aplicá esa ley en general en admin».

1. **Una vista = un título.** `SectionTitle` para la vista, `CardTitle` para sus bloques. Ocho títulos al mismo peso = ninguno manda. Nunca dos títulos que digan casi lo mismo.
2. **Orden por pregunta**: arriba lo que se mira primero (el estado, lo que falta), abajo el detalle. Las tablas que hablan de lo mismo, juntas; si son muchas, pestañas internas o bloques plegables — no apiladas.
3. **Indicadores plegables y recordados**: `hooks/use-local-storage.ts` con el patrón de `components/admin/forestal/LothSeccionKpis.tsx`. Plegado sigue mostrando las cifras en una línea: plegar no es esconder el dato.
4. **Botones**: a la vista sólo lo de uso constante (buscador, la acción principal). El resto, en un menú (`components/admin/shared/action-menu.tsx`, prop `soloIcono` cuando el espacio aprieta).
5. **Filtros pegados a la tabla que filtran**, no en una banda aparte con otro estilo.
6. **Cabecera en una fila**: sin botones huérfanos en una fila propia. Si no entra, se compactan los botones (ícono + tooltip) antes que partir la fila.
7. **≤ 2,5 pantallas de scroll** con todo en su estado por defecto.
8. **Nada se borra al reorganizar.** Si algo parece sobrar, se dice; no se saca.
9. **Explicar con ⓘ, no con párrafos** (Brandon 2026-09-24: «mucho texto por todos lados… un ícono y al pasar el mouse sus datos con ejemplos»). A la vista: título, dato y acción. Subtítulos, consejos, notas de «cómo se lee esta cifra» y leyendas → `InfoTip` (`components/superadmin/_shared/InfoTip.tsx`: `what` / `affects` / `example`, portal, abre con hover, clic, foco o toque) al lado del título. Avisos que piden acción: una línea + ⓘ con el detalle. Estado vacío: una frase. Lo que va dentro del ⓘ es texto o `<span>`, nunca `<p>`/`<div>`. Se mide en `medir-orden-admin.mjs` (columna «pal. ayuda», tope 60).
10. **Todo parejo** (Brandon 2026-10-11: «en varias pestañas las tablas son diferentes… quiero un solo estilo de tabla, modal, botones, tamaños, proporciones, estructura para que todo se vea parejo»): tablas = `DataTable` del DS (sin clases propias en `th`/`td`), ventanas = `AdminModal` (+ `ModalFooter`), botones = `Button`/`button()` a 48 px, cifras = `StatCard`/`useKpisPlegables`. Contrato completo y codemods: ADR-489; medir con `node scripts/censo-ds-admin.mjs` (lo hecho a mano sólo baja).
11. **Muchos botones o campos → un botón con opciones** (`ActionMenu`, «⋯» por fila o en la cabecera); **muchos datos o tablas → secciones** (`BarraDeSecciones` con `?sub=`), no bloques desplegables apilados uno debajo de otro: se ve una cosa a la vez, clasificada, y ocupa menos.

Medir antes y después con `node scripts/medir-orden-admin.mjs` (pantallas, títulos por nivel, botones, tablas). «Quedó más ordenado» sin número es opinión.
