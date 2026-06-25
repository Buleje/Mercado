# SESSION HANDOFF — 2026-06-25

Branch: `audit/storefront-mejoras-verificadas-2026-06-15`. **4 commits nuevos (no pusheado).**

## ✅ Commiteado y verificado esta sesión
- `316b0412` — nav/sub-nav del marketplace **claros** + StoreLogosMarquee blanco + **PDP sin barra lateral** + grillas "También compraron"/"Explora tus gustos" = grilla densa del home (related 4→12).
- `5fed12e2` — **Modo Creativo · preview en vivo**: texto del hero (data-live), modo oscuro (toggle clase), **sin flash** (iframe recarga solo si cambia algo no-en-vivo). Fixes: color picker hex fallback, preset duplicado, grid horario roto (comas Tailwind), label secciones, dead code `activeViewport`, logs en catches.
- `0fbe0aa6` — nombre de tienda **en vivo** en el header (`StorefrontNavbar`).
- `113195ec` — **Plantillas completas**: 3→8 looks (Clásico/Fresco/Premium/Minimal/Cálido/Selva/Océano/Dulce) con vibe + colores + fuente + modo + radio + estilo botón; `applyTemplate` aplica radio+botón; card con descripción + chips.
- `c5e5345e` — **Subir imágenes (click/arrastra)** logo (Identidad), hero, favicon (Avanzado) reusando `ImageUpload` envuelto en `.dark`; Identidad mejorada (logo arriba + placeholders).
- `755d34ce` — **Banner de imagen full-width** arriba de la tienda: campo `announcementImage` en StoreTheme + dropzone en Modo Creativo > Secciones + render en `app/t/[slug]` entre nav y hero. Verificado e2e.
- `234f08bb` — **Imagen por sección**: campo `sectionImages` (map sección→URL) en StoreTheme; dropzone por cada sección activa en Modo Creativo > Secciones (excepto hero/announcement); render en `app/t/[slug]` como banda full-width por sección (entre trust e info y el catálogo). Verificado e2e (Categorias → banda en /t).

Arquitectura live-preview: `StoreCreativeMode.postLiveTheme` → postMessage {vars, fontLabel, darkMode, text} → `components/store/PreviewLiveTheme.tsx` (CSS vars + font + clase dark + textContent de `[data-live]`). data-live actuales: heroTitle, heroSubtitle (en `app/t/[slug]/page.tsx`), storeName (en `StorefrontNavbar`).

## ✅ Hecho 2026-06-25 (cont.) — Estilos UI + Automatización
- `e872d7c5` — **Estilos UI con pickers visuales**: 7 dropdowns → tarjetas con mini-preview (helper `StylePicker` module-level en StoreCreativeMode); **`cartStyle` OCULTO** (control muerto). **Automatización**: panel agrupado (campos solo si enabled) + vista previa del popup. **Popup de bienvenida FUNCIONAL**: nuevo `components/store/TenantWelcomePopup.tsx` (dismissable X/click-fuera/Escape, localStorage, siempre visible en `?preview=true`) renderizado en `app/t/[slug]` cuando `welcomePopupEnabled`; **`footerText` wireado** en el footer. editorTheme lee welcomePopup*/footerText. Verificado e2e (pickers + popup renderiza en /t).

## 🔜 PRÓXIMA SESIÓN — INICIATIVA GRANDE: Page Builder (tipo WordPress/Elementor)
**Brandon quiere convertir Modo Creativo en page builder visual** (click-para-editar, arrastrar-reordenar en vivo, profesional y completo). **Spec completo + arquitectura + 4 fases + gotchas → `docs/PAGE_BUILDER_PLAN.md`.** Arrancar con `/clear` + ese archivo + `/goal`. Fase 1+2 = 80% del feel. CAVEAT clave: `/t` tiene el orden de secciones hardcodeado → hay que hacerlo data-driven por `sections` ANTES del drag/drop.

### Menor (cuando se quiera): controles muertos restantes en Modo Creativo
1. **Google Analytics + Meta Pixel** (analyticsId/pixelId muertos por-tenant) → inyectar `<Script>` GA4 + FB Pixel en `/t` (patrón `components/Analytics.tsx`). Alto valor marketing.
2. Opcional: heroCTA/heroBadge (el hero de `/t` no los renderiza; sí TiendaHero del marketplace).

Sweep funcional restante (browser, qaadmin→mi-pollo): paneles automatización/avanzado/historial, viewports tablet/móvil, undo/redo, split, snapshots.

## Gotchas
- **Commit que toca admin/store/app-t → `dangerouslyDisableSandbox`** (hook `tsx` → EPERM bajo sandbox → falso "Design token violations"). Ver [[reference_commit_sandbox_tsx_eperm]]. Commits solo-marketplace pasan sandboxed. tsc gate ~2min → `run_in_background`.
- Auto-save (2s) del Modo Creativo **persiste** a la tienda real. mi-pollo quedó con "Selva Tropical" aplicado por testing (válido, no roto).
- Cerrar Playwright antes de tsc (RAM; mem-guard bloquea Edit/Bash <500MB libre).

## Pausado
- OpenClaw VPS Hostinger (srv1774463.hstgr.cloud): modelo `llama-3.2-3b-instruct:free` falla ×50 "before producing content"; gateway sano. Pendiente SSH.
