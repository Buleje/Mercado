# ADR-055 — Plan: romper app/admin/page.tsx (1256 líneas) en sub-rutas

**Fecha:** 2026-04-10
**Estado:** 📋 PLANNED · Esfuerzo M · Bloque: Refactor · #07 del backlog

## Contexto
`app/admin/page.tsx` es el entry point del panel admin y hoy:
- **1256 líneas** en un único Server/Client Component
- Renderiza **27 tabs** (definidos en `admin-types.ts`) via `TabRouter`
- Carga dinámicamente componentes por tab pero el file aún concentra routing + estado + layout
- Viola SRP: mezcla auth checking, layout shell, tab state, navigation events, impersonation banner

## Decisión tentativa
Convertir cada tab de módulo en una **sub-ruta real** con URL propia:

```
app/admin/
  layout.tsx                    (AdminShell — auth gate + chrome)
  page.tsx                      (redirect a /admin/dashboard o al último tab visitado)
  dashboard/page.tsx
  ventas-caja/
    page.tsx                    (overview)
    vender/page.tsx
    turnos/page.tsx
    caja/page.tsx
    pedidos/page.tsx
    fiados/page.tsx
    cuadrar/page.tsx
  inventario/
    page.tsx
    stock/page.tsx
    alertas/page.tsx
    movimientos/page.tsx
    conteo/page.tsx
    valorizado/page.tsx
  productos/page.tsx
  compras-mod/page.tsx
  plata/page.tsx
  clientes/page.tsx
  fiados/page.tsx
  turnos/page.tsx
  recetas/page.tsx
  prestamos/page.tsx
  auditoria/page.tsx
  devoluciones-proveedor/page.tsx
  tesoreria/page.tsx
  promociones/page.tsx
  scoring/page.tsx
  documentos/page.tsx
  marketplace-ops/page.tsx
  mi-tienda/page.tsx
  config/page.tsx
```

Ventajas:
- Cada tab tiene URL compartible (`/admin/inventario/alertas`)
- Code splitting automático por ruta (mejor LCP)
- Deep linking desde WhatsApp/email notifications
- Back button funciona
- Suspense boundaries por ruta
- SSR/PPR por ruta con `"use cache"` + `cacheLife` donde aplique

## Plan de ejecución (4 sprints · ~20h)

### Sprint 1 — Audit + infraestructura (4h)
- [ ] Mapear `admin-types.ts` tabs → rutas → componentes actuales
- [ ] Extraer `AdminShell` a `app/admin/layout.tsx` (ya hay `_components/AdminNavigation` — reusar)
- [ ] Reemplazar `TabRouter.tsx` por `<Link href>` real
- [ ] Añadir fallback: `app/admin/page.tsx` redirige a `/admin/dashboard`

### Sprint 2 — Migrar primeros 9 tabs (8h)
- [ ] Prioridad por uso: dashboard, ventas-caja, inventario, productos, clientes, plata, compras, config, promociones
- [ ] Cada migración: crear `page.tsx` con `"use client"` si lo era, import del tab component actual
- [ ] Tests: click en nav, URL cambia, componente correcto se renderiza

### Sprint 3 — Migrar resto (18 tabs · 6h)
- [ ] fiados, turnos, recetas, prestamos, auditoria, devoluciones, tesoreria, scoring, documentos, marketplace-ops, mi-tienda, + 7 más

### Sprint 4 — Optimización + deprecación (2h)
- [ ] Añadir `"use cache"` + `cacheLife` donde el tab sea estático
- [ ] Prefetch de los 5 tabs más usados (PostHog analytics)
- [ ] Borrar `TabRouter.tsx` legacy
- [ ] Actualizar `AdminSidebar.tsx` y `AdminBottomNav.tsx` para usar `usePathname()` en vez de estado

## Consecuencias
- ✅ File size de `admin/page.tsx` → <50 líneas (solo redirect)
- ✅ Cada tab individual ahora es testable aisladamente
- ✅ Bundle inicial del admin baja significativamente (code splitting)
- ✅ URL shareable para soporte técnico
- ⚠️ Breaking: bookmarks viejos de usuarios deben redirigirse
- ⚠️ Analytics: eventos por tab necesitan actualizarse

## Riesgos
| Riesgo | Mitigación |
|---|---|
| State compartido entre tabs se pierde | Identificar y mover a Context o Zustand (ver ADR-056) |
| Breaking para usuarios con hábitos | Preservar último tab visitado en localStorage |
| CSS layout shift entre rutas | Suspense + skeleton común en layout.tsx |

## Bloqueadores
- **ADR-056 (11 Contexts → Zustand)** debería ejecutarse ANTES si se detecta state cross-tab pesado
- Coordinar con mobile — Capacitor deep links deben actualizarse

## Referencias
- `app/admin/page.tsx` (1256 líneas, a reducir)
- `app/admin/admin-types.ts` (27 tabs canónicos)
- `app/admin/_components/TabRouter.tsx` (a borrar)
- Next 16 App Router routing conventions
