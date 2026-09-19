---
paths:
  - "components/**"
  - "app/t/**"
  - "app/(store)/**"
  - "app/marketplace/**"
---

# Reglas al tocar UI visible

- Sin hex hardcodeados — tokens del DS (`@buleje/design-system`). Paleta oficial: primary `#00A0A0`, coral `#FF6B5B`, texto sobre claro `#007F7F` (solo vía tokens).
- Tipografía storefront: body `text-base` mínimo, filtros `h-12 border-2 rounded-2xl` (skill `bsm-typography-rules`).
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

Medir antes y después con `node scripts/medir-orden-admin.mjs` (pantallas, títulos por nivel, botones, tablas). «Quedó más ordenado» sin número es opinión.
