# ADR-300 — Page builder: landing `/t` data-driven por `bodyOrder`

**Fecha:** 2026-06-26 · **Estado:** Aceptada · **Autor:** Brandon + Claude

## Contexto

Brandon pidió convertir el Modo Creativo en un page builder tipo WordPress:
click-para-editar, arrastrar-reordenar en tiempo real, persistente. Las Fases 1-3
(click-select, drag visual en preview, inline edit) ya estaban (commits `edd5def4`,
`1c76efdd`, `4c4bcab2`), pero el **reorder solo vivía en el preview** (manipulación
DOM del iframe vía `pb-reorder`). Al recargar la tienda pública, el orden volvía al
**hardcodeado** en `app/t/[slug]/page.tsx`.

El control "Secciones > Página principal" del editor (`SECTION_ITEMS`:
announcement/hero/categories/popular/deals/...) **no matchea** lo que `/t` renderiza
realmente (announcement/hero/**trust/promos/featured/info**). Esas 9 keys
(categories...delivery_map) están muertas en `/t` (aspiracionales / del catálogo).

## Decisión

1. **`/t` se vuelve data-driven** por un campo nuevo `editorTheme.bodyOrder: string[]`.
   Los 4 bloques reordenables del cuerpo (`trust`, `promos`, `featured`, `info`) se
   envuelven **en su sitio** dentro de una IIFE que los emite en el orden de `bodyOrder`.
   `announcement` (banner) y `hero` (header) quedan **fijos arriba**. Default (vacío) =
   orden histórico → **cero cambio visual** para tiendas existentes.

2. **Técnica de extracción sin mover JSX:** los bloques se asignan a `__body.<key>` con
   5 edits quirúrgicos en los bordes; el JSX interno no se toca. Se descartó CSS
   `flex/grid order` porque rompe el `max-w-5xl mx-auto` (centrado) de los bloques.
   Los intercalados no-reordenables (sectionImages, ProStoreSections, empty-state) se
   anidan al bloque vecino (sectionImages→promos; proStore+empty→featured).

3. **`StoreTheme.bodyOrder`** (default `["trust","promos","featured","info"]`) persiste
   con el resto del theme (auto-save). Nuevo control en el editor "Orden del inicio · en
   vivo" (4 chips drag) → `reorderBody()` → `patch("bodyOrder")` + `pb-reorder` al iframe.

## Consecuencias

- **+** El reorder del cuerpo del landing **persiste** en la tienda pública. Verificado
  e2e: drag en panel → auto-save → `/t` público (no-preview) renderiza el nuevo orden.
- **+** Zona de peligro respetada: default = idéntico, sin regresión (tsc/eslint/design-lint 0).
- **−** Coexisten dos taxonomías de secciones en el editor (la vieja `SECTION_ITEMS`
  aspiracional + la nueva `bodyOrder` real). Se mantiene la vieja por sus toggles/imágenes
  por-sección; el control nuevo es el que ordena `/t` de verdad. Reconciliar a futuro.
- `announcement`/`hero` no reordenables por diseño (banner+header siempre arriba).

## Relacionado

ADR-299 (fusión editores storefront), `docs/PAGE_BUILDER_PLAN.md` (spec de fases).
