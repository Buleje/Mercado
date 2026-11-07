# ADR-301 — Modo Creativo: edición profunda (texto inline, estilo/imagen por sección, secciones custom)

> Estado: **Implementado** (Fases 1-4) · Fase 4 = texto + imágenes de secciones custom
> Fecha: 2026-06-27 · Autor: Brandon + Claude

## Contexto

El Modo Creativo (`components/admin/StoreCreativeMode.tsx`) edita el tema de la tienda
(`settings.storeTheme`) y lo refleja en vivo en un iframe de `/t/[slug]?preview=true`
vía `postMessage`. El dueño pidió poder **editar todo**: títulos, subtítulos, texto
dentro de botones/componentes, imágenes por sección, y **todas** las secciones
(incluida la galería) con más opciones de personalización.

Había dos limitaciones:
1. Solo unos pocos textos eran editables (`data-live`: hero, footerText, popup).
2. Las **secciones del cuerpo** (trust/promos/featured/testimonials/info) y las
   **secciones custom** (about/hours/payment/faq/benefits/**gallery**/image-text,
   renderizadas por `components/store/tenant/SectionRenderer.tsx`) no eran
   editables desde el Modo Creativo.

**Hallazgo clave:** las secciones custom **NO viven en `storeTheme`**. Se serializan
en `customization.footerHtml` (`deserializePageData`) y se editan hoy en la pestaña
**"Página de inicio"** (`app/admin/store-page/_components/SectionsTab.tsx`). El Modo
Creativo solo carga/guarda `storeTheme`. Integrarlas cambia el **contrato de
persistencia** del editor → requiere este ADR.

## Decisión

### Implementado (Fases 1-3) — sobre `storeTheme`
- **Estilo por sección** (`storeTheme.sectionStyles[key]`): fondo, texto, espaciado,
  forma (radio), borde, sombra; 8 presets de diseño de 1 clic. Panel lateral al
  seleccionar una sección `[data-pb]` + barra flotante en el iframe.
  Mensaje en vivo: `pb-apply-section-style`.
- **Texto por sección** (`storeTheme.sectionText[key]`): etiqueta + título +
  alineación, editable en panel y **inline (doble-click)** en el preview.
  Mensaje: `pb-apply-section-text`. Aplica a featured/info/testimonials.
- **Texto inline genérico** (`storeTheme.inlineText[key]`): cualquier nodo marcado
  `data-live="inlineText:<key>"` (botones, CTAs, headings del footer/hero) editable
  por doble-click. Persiste con fallback al texto por defecto.
- **Imagen por sección** (`storeTheme.sectionImages[key]`): banda full-width,
  editable desde el panel de la sección.
- `reloadSignature` excluye `sectionStyles`/`sectionText`/`inlineText` → edición sin
  flash de recarga (se refleja en vivo por postMessage / contentEditable).

### Implementado (Fase 4) — secciones custom (gallery, image-text, about, …)
- El editor **carga** las secciones custom con `GET /api/store-page/sections` al abrir
  Modo Creativo (estado `customSections`).
- Cada sección custom se marca en `/t` con `data-pb="custom:<id>"` (seleccionable) y sus
  textos con `data-live="customText:<id>:<campo>"` (edición inline por doble-click).
- Click en una sección custom → **panel lateral `CustomSectionEditor`** que detecta los
  campos de `section.data` (título/subtítulo/cuerpo/etiqueta) + imagen (`imageUrl`) +
  galería (`images[]`: agregar/cambiar/quitar fotos).
- **Persistencia:** `patchCustomSection` → `PUT /api/store-page/sections` (debounce 1.2s,
  `csrfHeaders`) — el MISMO endpoint validado (requireAdmin + safeParse + rate limit) que
  ya usa `SectionsTab`. No toca `storeTheme`. Tras guardar, recarga el iframe (no hay
  live DOM-patch para estructura; el texto inline sí se ve al instante por contentEditable).

**Verificado (2026-06-27, Playwright en mi-pollo):** crear galería de prueba → seleccionar
en preview → panel con texto+fotos → editar título → `GET` confirma persistencia en
`footerHtml` → limpieza. tsc 0 errores, consola 0 errores.

**Riesgo mitigado:** se reusa el endpoint existente (mismo path seguro que SectionsTab),
no se reescribió serialización. Pendiente menor: reordenar/crear/borrar secciones custom
desde Modo Creativo (hoy se hace en la pestaña "Página de inicio").

## Consecuencias

- (+) El dueño edita casi todo el texto y el estilo del landing sin tocar código.
- (+) Un solo patrón (`inlineText` + `data-live`) escala a cualquier texto nuevo:
  basta etiquetar el nodo y leer con fallback.
- (−) Quedan dos taxonomías de secciones (cuerpo vs custom) hasta unificar en Fase 4.
- (−) Fase 4 toca persistencia compartida → no se hace sin backup + verificación.

## Alternativas consideradas

- **Migrar las secciones custom a `storeTheme`:** unifica el almacén pero requiere
  migración de datos de todos los tenants. Descartado por ahora (más riesgo).
- **Editar custom sections solo en la pestaña "Página":** es el status quo; el dueño
  quiere todo en Modo Creativo. Se mantiene como fallback hasta Fase 4.

## Referencias

- `components/admin/StoreCreativeMode.tsx` (editor + panel por sección)
- `components/store/StorefrontEditOverlay.tsx` (overlay del preview, mensajes pb-*)
- `app/t/[slug]/page.tsx` (render + `data-live`/`data-pb-text`)
- `components/store/tenant/SectionRenderer.tsx` (secciones custom)
- `components/store/TenantFooter.tsx`, `components/store/tenant/TenantHero.tsx`
