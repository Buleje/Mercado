# ADR-100 — Vertical Modules Architecture (panel admin por nicho)

**Status:** Proposed
**Date:** 2026-05-09
**Owners:** Brandon (PO), Architect agent
**Related:** ADR-057 (hub-spoke), ADR-058 (whatsapp-ai-first), `lib/verticals/registry.ts`

---

## 1. Contexto

Buleje SaaS sirve a 6+ tipos de negocio (bodega, restaurante, maderería, farmacia, ferretería, panadería). Hoy el panel admin muestra **35 tabs top-level idénticos** a todos los tenants — lo que produce:

- **Onboarding doloroso** — un panadero ve "Cotizaciones B2B" y "Guías de Remisión" que nunca usará.
- **Modelos huérfanos** — `Receta`, `Cotizacion`, `GuiaRemision`, `NotaCredito`, `Batch`, `Fiado`, `Prestamo`, `Treasury` ya existen en schema pero no se descubren porque viven mezcladas con tabs irrelevantes para el rubro.
- **Branding genérico** — todos ven "Mi Tienda" cuando un restaurante quiere "Mi Restaurante" / un paciente no es un "cliente".
- **Marketing débil** — landing `/vender` no puede prometer "panel de farmacia" si la realidad es "el mismo panel para todos".

Brandon decidió **especializar el panel por nicho** sin fragmentar el codebase.

## 2. Decisión

Adoptar un **patrón de Registry** (`lib/verticals/registry.ts`) que mapea `Industry` → `VerticalConfig` con:

- `enabled` — qué tab IDs son visibles (intersectado con RBAC; RBAC siempre gana en restricciones).
- `featured` — qué tabs van al tope del sidebar, en orden.
- `hidden` — qué tabs ocultar aunque RBAC permita.
- `comingSoon` — placeholders deshabilitados ("Próximamente") para crear pull en el roadmap.
- `branding` — `sidebarTitle` + `primaryColor` + `customCopy` (i18n por vertical).

El registry se consume desde **un solo punto** (`useAdminTabsDerived`) — las 35 tabs siguen viviendo en `tab-data.ts` (single source of truth), el registry **solo filtra y reordena**.

## 3. Alternativas evaluadas

| Alternativa | Por qué NO |
|---|---|
| **A. App Next.js separada por vertical** | Multiplicaría deploy, schema, cache. ROI negativo. |
| **B. Multi-tenant separado físico (DB por vertical)** | Tira a la basura aislamiento app-level que ya funciona; rompe Marketplace cross-store. |
| **C. Plugin system runtime (carga dinámica de módulos)** | Sobre-ingeniería: 6 verticales no justifican infraestructura de plugins. Bundle size empeora. |
| **D. Feature flags por tab × tenant** | Ya existe `hiddenTabs` per-user. No resuelve "destacar" ni branding ni el "comingSoon". |
| **E. Registry estático (ELEGIDA)** | TypeScript strict, zero runtime cost, fácil de testear, evolución incremental. |

## 4. Consecuencias

### Positivas
- Onboarding wizard puede preseleccionar `industry` y el panel ya viene configurado.
- Marketing real: "Panel de Farmacia con FEFO + DIGEMID — próximamente".
- Modelos existentes (`Receta`, `Cotizacion`, `Batch`) se descubren en el vertical correcto.
- Single-tenant intent (memoria 2026-04-28) compatible: cada tenant fija un solo `industry`.

### Negativas / costos
- **Testing N veces** — visual-verify-admin debe correr por vertical (skill futuro: `visual-verify-vertical`).
- **Risk de drift** — si alguien añade un tab nuevo en `tab-data.ts` y olvida agregarlo a `enabled` de los verticales, queda invisible en todos. Mitigación: test unitario que valide cobertura.
- **comingSoon expectativa** — si listamos "mesas, comandas, KDS" y nunca los entregamos, daño de marca. Mitigación: max 3 comingSoon por vertical, revisión trimestral.

## 5. Plan de implementación (F1 / F2 / F3)

### F1 — Foundation (esta entrega)
- [x] `lib/verticals/registry.ts` con 7 verticales y 35 tab IDs mapeados.
- [x] ADR-100 (este doc).
- [ ] **Otro agente:** añadir `industry` enum + columna a `Tenant` en `prisma/schema.prisma` (requiere DIRECT_URL para migración).
- [ ] **Otro agente:** test unitario `registry.test.ts` — valida que cada `featured`/`hidden` es subset de `enabled` ∪ `comingSoon`.

### F2 — Wiring (sprint siguiente)
- [ ] `useAdminTabsDerived` consume `filterTabsForVertical(tenant.industry, allTabs)`.
- [ ] `AdminSidebar` renderiza `featured` con badge "Destacado" + sección "Próximamente" deshabilitada.
- [ ] Onboarding wizard agrega step "¿Qué tipo de negocio tienes?" → setea `tenant.industry`.
- [ ] `branding.customCopy` se inyecta vía `vocabulary-context`.

### F3 — Polish & Marketing (sprint +2)
- [ ] Landing `/vender` lista capabilities por vertical (lee del registry).
- [ ] Skill `visual-verify-vertical` corre 3 tabs críticos × 6 verticales (~3min).
- [ ] Telemetría PostHog: tracking de `module_clicked` con `tenant_industry` para descubrir comingSoon más demandados.
- [ ] Migración modelos huérfanos: si vertical=panaderia y `Receta` está vacío, mostrar empty-state con CTA.

## 6. Rollback

Trivial. El registry filtra; quitar el filtrado restaura el comportamiento actual (35 tabs para todos). El campo `industry` queda como nullable + `getVerticalConfig` cae a `otro` defensivamente.

## 7. Referencias

- `app/admin/_lib/tab-data.ts` — 35 tabs canónicos.
- `app/admin/_lib/tab-categories.ts` — agrupación actual (independiente del registry).
- `lib/verticals/registry.ts` — esta entrega.
- ADR-079 vendor-approval (marketplace) — cross-vertical compatible.
- Memoria proyecto 2026-04-28 — intención single-tenant.
