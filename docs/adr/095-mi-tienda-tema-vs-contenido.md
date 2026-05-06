# ADR-095 — Separación tajante "Mi Tienda" entre tema y contenido

- **Estado:** Propuesto
- **Fecha:** 2026-05-06
- **Autor:** Brandon (con apoyo de claude-code)
- **Ámbito:** `app/admin/_lib/tab-data.ts`, `app/admin/store-page/page.tsx`, `components/admin/StoreCustomizer.tsx`, `app/admin/_components/TabRouter.tsx`

## Contexto

El módulo "Mi Tienda" del panel admin expone **dos tabs** que viven en la misma categoría:

| Tab id | Sidebar label | Componente |
|---|---|---|
| `store-customizer` | "Personalizar tienda" / "Mi tienda personal" | `components/admin/StoreCustomizer.tsx` |
| `pagina-inicio` | "Mi página web" / "Página de Inicio" | `app/admin/store-page/page.tsx` |

Auditoría visual (screenshots `2026-05-06`, ver `/tmp/audit-mi-tienda/`) detecta **5 zonas duplicadas** que rompen la mental model del bodeguero:

| Concepto | `store-customizer` | `pagina-inicio` | Estado |
|---|---|---|---|
| Hero (banner principal) | sub-tab `Hero` con vista previa en vivo | sub-tab `Look` → Hero (Título/Subtítulo/Imagen) | **Duplicado** |
| Logo de la tienda | `Identidad` + `Marca` | `Branding` → Logo de la tienda | **Triplicado** |
| Promociones | `Promos por categoría` | sub-tab `Promociones` (engagement) | Duplicado |
| Colores / paleta | `Marca` + `Colores` | `Look` → colores | Duplicado |
| Datos de contacto | `Contacto` | `Look` → contacto | Duplicado |

Síntoma observado: un dueño que quiere "subir mi logo" tiene **3 lugares** donde hacerlo. Si edita en uno, el otro le miente. La carga cognitiva mata la conversión del onboarding.

## Decisión

**Mantenemos los dos tabs**, pero los hacemos **mutuamente excluyentes** por capa:

### `store-customizer` → "Identidad y tema" (CÓMO se ve)

> Tema visual de la tienda. La piel.

Sub-tabs (sin cambios estructurales):
- ✅ `Identidad` — Logo, Nombre, Eslogan
- ✅ `Marca` — Paleta extraída del logo, tipografía sugerida
- ✅ `Colores` — Override manual de la paleta
- ✅ `Estilos` — Tipografía, spacing, radius
- ✅ `Catálogo` — Estilos de cards de producto (cómo se ven, no cuáles)
- ✅ `Textos y popup` — Microcopy global, popup de bienvenida
- ✅ `Contacto` — Teléfono, email, dirección
- ✅ `Avanzado` — CSS custom snippets
- ❌ `Hero` → **se mueve a `pagina-inicio`** (es contenido, no tema)
- ❌ `Promos por categoría` → **se mueve a `pagina-inicio`** (es contenido)
- ❌ `Secciones` → **se mueve a `pagina-inicio`** (es contenido)

### `pagina-inicio` → "Página de inicio" (QUÉ se muestra)

> Contenido de la home pública. El escaparate.

Sub-tabs reorganizados:
- ✅ `Hero` (movido desde store-customizer) — banner principal
- ✅ `Secciones` (movido desde store-customizer) — bloques de la home
- ✅ `Productos` — qué productos destacar
- ✅ `Variaciones` — A/B de la home
- ✅ `Combos` — combos visibles en home
- ✅ `Descuentos` — ofertas activas
- ✅ `Promos por categoría` (movido desde store-customizer)
- ✅ `Engagement` — gamificación
- ✅ `Branding marketplace` — banner para directorio Buleje (único de este tab)
- ✅ `Métricas` — KPIs de la página
- ✅ `SEO` (nuevo, separado de Look)
- ❌ `Apariencia (Look)` → **eliminado** (logo, colores, contacto van a `store-customizer`)
- ❌ `Branding (logo)` → **eliminado** (va a `store-customizer/Identidad`)

### Renombrado en sidebar y URL

| Antes | Después |
|---|---|
| "Personalizar tienda" / "Mi tienda personal" | **"Identidad y tema"** |
| "Mi página web" / "Página de Inicio" | **"Página de inicio (contenido)"** |

Tab IDs (`store-customizer`, `pagina-inicio`) se mantienen para no romper deep-links históricos ni `RolePermissionsTab`.

## Microcopy (header de cada tab)

Los headers `AdminModuleHeader` deben dejar explícito el alcance:

**`store-customizer`** (eyebrow + description):
```
eyebrow: "Mi tienda · Identidad y tema"
title:   "Cómo se ve tu tienda"
description: "Logo, colores, tipografía y CSS de tu tienda. Define la PIEL — no qué productos mostrar. Para eso, andá a 'Página de inicio'."
```

**`pagina-inicio`**:
```
eyebrow: "Mi tienda · Contenido público"
title:   "Qué muestra tu página de inicio"
description: "Hero, productos destacados, ofertas y secciones de tu home pública. Define el CONTENIDO — no los colores. Para eso, andá a 'Identidad y tema'."
```

Cada description termina con un **link directo** al tab gemelo (CTA "Ir a Identidad y tema →").

## Consecuencias

**Positivas**:
- Cero overlap funcional. Cada concepto vive en un solo lugar.
- Mental model clara: "tema = cómo se ve" vs "contenido = qué se muestra".
- Microcopy + deep-link cruzado guía al usuario que cae en el tab equivocado.
- No requiere data migration — los modelos Prisma (`StoreTheme`, `StorePage`) ya están separados.

**Negativas**:
- Onboarding actual que enseña "Hero" en `store-customizer` necesita actualización (1 tour step).
- Bookmarks/links existentes a `?tab=store-customizer&sub=hero` rompen → mitigamos con redirect 308 en runtime: si llega `sub=hero` a store-customizer, navegamos a `pagina-inicio?sub=hero`.
- Un sprint de migración: mover sub-tab components entre archivos (ver Plan).

**Neutras**:
- Permisos RBAC sin cambio (ambos tabs siguen siendo del role `admin`).
- Plan tier sin cambio (ambos en `free` mínimo).

## Plan de migración (1 sprint)

1. **Día 1** — Microcopy + deep-link cruzado en headers. Sin mover sub-tabs aún. Ya elimina ~70% de la confusión.
2. **Día 2-3** — Mover sub-tabs `Hero` y `Secciones` de `StoreCustomizer.tsx` → `app/admin/store-page/page.tsx`. Tests de regresión.
3. **Día 4** — Eliminar sub-tab `Look` de `pagina-inicio` (su contenido ya vive en `store-customizer`). Redirect runtime para sub-tabs viejos.
4. **Día 5** — Renombrar labels en sidebar (`tab-data.ts`). Actualizar tour de onboarding.
5. **Día 6** — Visual QA con `scripts/visual-verify-admin-focused.mjs` + screenshots de los 2 tabs en light/dark.

## Alternativas consideradas

### A. Fusionar todo en un solo módulo "Mi Tienda" con 6 secciones
- ✅ Pro: una sola URL, navegación más fluida
- ❌ Con: requiere reescribir el TabRouter, monstruo de 11+9=20 sub-tabs en una sola tab principal, peor performance de carga
- ❌ Rompe deep-links históricos sin solución elegante

### B. Mantener todo como está, solo añadir microcopy
- ✅ Pro: zero migration cost
- ❌ Con: el overlap funcional persiste — un usuario que sube logo en 2 lugares sigue mintiéndose

### C. Eliminar `store-customizer` completo y mover todo a `pagina-inicio`
- ❌ Pierde el separation of concerns que hace mantenible el theme vs content split en Prisma

**B fue rechazada como solución completa, pero su principio (microcopy clarificatorio) se adopta como Día 1 del plan**.

## Referencias

- Auditoría visual: `/tmp/audit-mi-tienda/` (10 screenshots, 2026-05-06)
- Componentes afectados:
  - `components/admin/StoreCustomizer.tsx` (892 líneas, 11 sub-tabs)
  - `app/admin/store-page/page.tsx` (9 sub-tabs)
  - `app/admin/_components/TabRouter.tsx:266,272` (despacho)
  - `app/admin/_lib/tab-data.ts:89-90` (sidebar labels)
  - `app/admin/_lib/tab-categories.ts:216,388` (categoría "Mi Tienda")
- Skill relevante: `bsm-design-system`, `bsm-typography-rules`
