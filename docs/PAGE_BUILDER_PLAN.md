# Modo Creativo → Page Builder profesional (tipo WordPress/Elementor)

> **Pedido de Brandon (2026-06-25):** convertir el Modo Creativo en un page builder
> visual: click en un componente → editarlo directo (texto/color), arrastrar
> componentes y reordenar en tiempo real, y "muchas funciones bien hechas".
> Profesional y completo. **Build en sesión fresca** (decisión de Brandon).

## 0. Cómo arrancar la sesión fresca
1. `/clear`, leer este archivo + `SESSION_HANDOFF.md`.
2. `/goal "Page builder Fase 1+2: click-seleccionar abre el editor de esa sección y arrastrar reordena secciones en vivo, verificado e2e con screenshots"`.
3. Construir **por fase**, commit + screenshot por fase. No one-shot.

## 1. Arquitectura actual (lo que YA existe)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Editor fullscreen | `components/admin/StoreCreativeMode.tsx` (~1450 LOC) | panel izq. de controles + iframe preview |
| Preview = iframe | `/t/<slug>?preview=true` | la "TV" que muestra la tienda |
| Storefront landing | `app/t/[slug]/page.tsx` (~1050 LOC) | render de la tienda (hero, trust, bandas, catálogo) |
| Receptor live | `components/store/PreviewLiveTheme.tsx` | aplica CSS vars/font/dark/texto en el iframe |

**Protocolo postMessage (YA bidireccional, falta extenderlo):**
- Editor → preview: `{ source: "buleje-editor", type: "live-theme", vars, fontLabel, darkMode, text }` (`postLiveTheme`, StoreCreativeMode L~534).
- Preview → editor: `{ source: "buleje-preview", type: "ready" }` al montar (PreviewLiveTheme L~95) → editor reenvía estado (StoreCreativeMode L~561).
- `data-live="<campo>"` en el storefront = nodos que el editor actualiza por texto en vivo (heroTitle, heroSubtitle, storeName, welcomePopupTitle/Message, footerText).

**Modelo de secciones (YA existe, falta hacerlo data-driven en /t):**
- `SectionKey` + `SECTION_ITEMS` (StoreCreativeMode L~123): `announcement, hero, categories, popular, deals, combos, recipes, testimonials, faq, contact, delivery_map`.
- `draft.sections: SectionKey[]` = secciones activas (toggle on/off en panel "Secciones"). Default = las 11 en orden.
- **Prior-art de reorder:** `StoreCustomizer.tsx` L~1382-1393 ya tiene `moveSection` up/down (`const next=[...theme.sections]; update("sections", next)`). Reusar ese patrón de array.

## 2. ⚠️ CAVEAT que la sesión fresca debe resolver PRIMERO
El orden de render en `app/t/[slug]/page.tsx` está **hardcodeado** (bloques `<section>` fijos: hero, announcement, trust ~L721, sectionImages ~L771, catálogo). Y la lista del editor (`categories/popular/deals/combos/recipes/testimonials/faq/...`) **NO matchea 1:1** lo que `/t` realmente renderiza (que es más un landing + catálogo embebido).

**Paso 0 del build:** decidir qué página ES "el storefront" que se edita:
- (a) el landing `/t/[slug]` (page.tsx), o
- (b) el catálogo `/t/[slug]/tienda` (marketplace storefront).
Y hacer ESA página **data-driven por `sections`** (un `.map(sectionKey => renderSection(key))` en el orden del array) antes de tocar drag/drop. Sin esto, reordenar el array no mueve nada visualmente.

## 3. Extensión del protocolo (la fundación)
Agregar tipos nuevos al postMessage de 2 vías:

**Preview → editor:**
- `{ type: "select", sectionKey }` — el usuario clickeó una sección en la TV.
- `{ type: "reorder", from, to }` — soltó una sección en otra posición.
- `{ type: "inline-edit", field, value }` — editó texto inline (contentEditable blur).

**Editor → preview:**
- `{ type: "edit-mode", on: true }` — prende el overlay de edición (handles + outlines clickeables).
- `{ type: "highlight", sectionKey }` — resalta una sección (hover desde el panel).

El overlay de edición vive en el storefront (solo si `?preview=true`): un componente cliente (`StorefrontEditOverlay`) que envuelve cada sección con un wrapper `data-section="<key>"`, dibuja outline + handle al hacer hover/seleccionar, y emite los postMessage.

## 4. Fases (commit + screenshot por fase)

### Fase 1 — Seleccionar + editar contextual
- `StorefrontEditOverlay` (client, solo preview): cada sección envuelta en `[data-section]`; hover → outline; click → `postMessage({type:"select"})` + toolbar flotante (botones: editar texto, color, ocultar/mover).
- Editor: al recibir `select` → abre el panel de esa sección + lo resalta (scroll + ring).
- **Aceptación:** click en el Hero del preview → el panel salta a Hero resaltado. Screenshot.

### Fase 2 — Arrastrar y reordenar
- Hacer `/t` (o /tienda) **data-driven** por `sections` (map en orden).
- Drag handles en cada sección (overlay). Usar dnd nativo (HTML5 drag) o `@dnd-kit` (ya en deps? verificar). Soltar → `postMessage({type:"reorder", from, to})`.
- Editor: reordena `draft.sections` (patrón StoreCustomizer.moveSection) → auto-save → iframe re-render en nuevo orden. Animar.
- **Aceptación:** arrastrar "Ofertas" arriba de "Populares" → cambia en vivo. Screenshot antes/después.

### Fase 3 — Edición inline directa
- Texto: `contentEditable` en nodos `[data-live]` cuando edit-mode; blur → `postMessage({type:"inline-edit"})` → editor hace `patch`.
- Color: click en bloque → mini picker flotante (reusar ColorField) → patch live.
- Imagen: click en zona imagen → abre el ImageUpload del editor.
- **Aceptación:** doble-click en el título del hero, escribir, queda guardado. Screenshot.

### Fase 4 — Bloques pro
- Biblioteca de bloques: agregar/quitar (galería, testimonios, CTA, video, columnas).
- Undo/redo robusto (ya hay history stack parcial en StoreCreativeMode — verificar `pushChange`).
- Responsive por bloque (viewport tablet/móvil ya existe en el editor).
- Guardar como plantilla.

## 5. Gotchas (heredados)
- **Commit que toca admin/store/app-t → `dangerouslyDisableSandbox`** (hook `tsx` → EPERM falso). tsc gate ~2min → `run_in_background`. Ver `reference_commit_sandbox_tsx_eperm`.
- **commitlint:** subject en **minúscula**, ≤100 chars; body cada línea ≤100. Co-author + Claude-Session al final con `-m` separados.
- **design-lint:** sin hex literales en `style={{color/background/borderColor}}` (vars OK); Tailwind v4 = `bg-linear-to-*` no `bg-gradient-to-*`; `shadow-2xl` = warning.
- **Auto-save (2s) PERSISTE** a la tienda real (mi-pollo) al testear → limpiar después.
- **Cerrar Playwright antes de tsc 8GB** (mem-guard mata Edit/Bash <500MB).
- Login QA: `qaadmin` / `Qa-admin-1234` → tenant **mi-pollo**.
- **No modales bloqueantes**: toolbars/pop-overs con click-fuera + Escape.

## 6. Estimación
- Fase 1: ~1.5h · Fase 2: ~2h (el data-driven de /t es lo más pesado) · Fase 3: ~1.5h · Fase 4: open-ended.
- Fase 1+2 = el 80% del "feel WordPress". Empezar por ahí.
