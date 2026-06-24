# ADR-299 — Fusión de los editores de storefront (Identidad y tema + Mi tienda pública)

> Estado: **Propuesto** (fase 1: diseño + plan; sin cambios de datos) · Fecha: 2026-06-24
> Autor: Brandon (Buleje) · Relacionado: ADR-114 (RLS), ADR-059 (marketplace), `MANUAL-rls-fix-store-page-guc-2026-06-24.sql`

## Contexto

El admin del negocio tiene **dos editores de storefront** que **duplican** funciones:

| Editor | Componente | Guarda en | Tabs |
|---|---|---|---|
| **Identidad y tema** | `components/admin/StoreCustomizer.tsx` (~3100 LOC) | `Settings.storeThemeJson` | 11 |
| **Mi tienda pública** | `app/admin/store-page/*` | `TenantStorePage` (+ `footerHtml` design/sections) | 7 |

**18 tabs en total.** Comparten **Hero, Colores, Contacto** (y conceptualmente Secciones), con **modelos de datos distintos** y guardando en **stores distintos**.

El storefront `/t/[slug]/page.tsx` (~L148) resuelve el conflicto con **`settings.storeTheme` manda** (decisión 2026-06-08) → lo editado en "Mi tienda pública" quedaba **invisible**. Mitigado parcialmente con write-through:

- `/api/store-page/design` → replica `primary/secondary/accent` a `storeTheme` (✅ hecho).
- `/api/store-page/customization` → replica `heroTitle/Subtitle/Image/CTA-texto + colores + whatsapp/email/dirección` a `storeTheme` (✅ hecho).
- **CTA destino NO mapeado**: `heroLink` (enum: `tienda|whatsapp|categorias|custom`) vs `heroCtaUrl` (URL libre) — modelos incompatibles.

Además: bug RLS (las 4 tablas store-page usaban el GUC `app.current_tenant_id` en vez de `app.tenant_id` + sin fail-open → escrituras bloqueadas bajo el rol `buleje_app`) → **arreglado** (ver `MANUAL-rls-fix-store-page-guc-2026-06-24.sql`).

## Decisión

### 1. Fuente de verdad única: `settings.storeTheme` (campos visuales)

`storeTheme` ya gana en la resolución del storefront, ya lo lee el catálogo, y los write-throughs ya hacen converger B→storeTheme. → **Canónico para los campos VISUALES compartidos** (hero, colores, estilos, contacto, marca).

`TenantStorePage` se queda **solo con lo que NO solapa** (contenido de página): SEO (`metaTitle/metaDescription/ogImageUrl`), `published`, métricas/visitas, branding del `/marketplace/[slug]`, y el **builder de secciones personalizadas** (`footerHtml` → about/horarios/pago/FAQ/galería/imagen-texto).

### 2. Estructura unificada: 18 → 6 tabs

| Tab | Absorbe | Fuente |
|---|---|---|
| **1. Identidad** | logo, nombre, slogan, descripción, favicon + SEO (meta/OG) + publicado | storeTheme + TenantStorePage(SEO/published) |
| **2. Hero** | título, subtítulo, badge, origen, chips, imagen, **CTA unificada** | storeTheme |
| **3. Colores & Tipografía** | primary/secondary/accent, font, dark mode, presets (unifica los 4+6 → ~8) | storeTheme |
| **4. Estilos** | radius, sombras, botones, cards, navbar, animaciones, patrón | storeTheme |
| **5. Página** | contacto (whatsapp/email/phone/dirección/horarios) + about + **un solo builder de secciones** + banners/promos | storeTheme(contacto) + TenantStorePage(secciones) |
| **6. Avanzado** | analytics/pixel, custom CSS, métricas (read-only) | storeTheme + TenantStorePage(métricas) |

### 3. Reconciliación de los modelos en conflicto

| Campo | Conflicto | Resolución |
|---|---|---|
| **CTA destino** | `heroLink` enum vs `heroCtaUrl` URL libre | Modelo único: `heroLink` enum + cuando `= custom`, campo `heroCtaUrl`. (Lo mejor de ambos.) |
| **borderRadius** | número (storeTheme) vs enum (Design) | Usar el número de storeTheme (más granular); deprecar el enum. |
| **buttonStyle / fontFamily** | taxonomías distintas | Adoptar la de storeTheme; mapear la de Design al cargar. |
| **Secciones** | `storeTheme.sections` (11 toggles built-in) ≠ `TenantStorePage` builder (8 bloques custom) | **NO se fusionan**: son conceptos distintos (toggles de secciones nativas vs bloques de contenido). Co-ubicar en el tab "Página" con dos grupos claros. |

### 4. Migración: expand → migrate → contract (sin downtime)

- **Fase 1 (este ADR):** diseño + decisión. **Sin código ni datos.**
- **Fase 2 (expand):** construir el editor unificado de 6 tabs. Los 2 editores viejos **siguen funcionando**. El unificado escribe a storeTheme (canónico) + TenantStorePage (SEO/secciones). Script de **backfill** one-time: copiar valores compartidos que vivan solo en TenantStorePage → storeTheme (idempotente, `storeTheme` gana en empate).
- **Fase 3 (migrate):** el admin enruta al editor unificado; ocultar los 2 tabs viejos.
- **Fase 4 (contract):** borrar los controles duplicados + campos muertos de storeTheme (verificar `grep` de lectores repo-wide antes de borrar). Quitar los write-through (ya no hay 2 escritores).

## Consecuencias

**Positivas:** 1 fuente de verdad → fin de "edito y no se ve"; 18→6 tabs (−67%); ~4000 LOC de UI duplicada a podar; modelo de datos claro.

**Negativas / riesgos:**
- Datos en 2 stores hoy: per-tenant pueden diferir → el backfill debe elegir (storeTheme gana, coherente con la resolución actual). Auditar tenants con divergencias antes de fase 3.
- Refactor grande de `StoreCustomizer.tsx` (3100 LOC) → hacer por fases, behavior-preserving primero.
- Rollback: mantener editores viejos hasta fase 4; el `.sql` de RLS tiene rollback documentado.

## Alternativas consideradas

1. **TenantStorePage canónico** (en vez de storeTheme): descartado — requiere invertir la resolución del storefront (rompe lo que hoy funciona) y más migración.
2. **Dejar 2 editores + más write-through**: descartado — parche; no reduce tabs ni la confusión; el CTA destino sigue sin mapearse.
3. **No tocar nada**: descartado — la duplicación es la queja principal del dueño.

## Referencias

- Auditoría de duplicación (sesión 2026-06-24): matriz Hero/Colores/Secciones/Contacto + "storeTheme manda".
- `app/t/[slug]/page.tsx` (~L148 resolución), `lib/db/settings.db.ts` (`patchStoreThemeJson`), `lib/store-design-tokens.ts`, `lib/store-sections-types.ts`.
- `prisma/manual-scripts/MANUAL-rls-fix-store-page-guc-2026-06-24.sql` (fix RLS escritura store-page).
