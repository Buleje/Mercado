# Live Test Report — 2026-04-28

Recorrido en navegador (Playwright + dev server local).

## Resumen ejecutivo

| Ruta | HTTP | Render | Consola | Capturas |
|---|---|---|---|---|
| /marketplace | 200 | OK light + dark | Error transitorio (cold rebuild) | 01, 02 |
| /marketplace/main (storefront) | 200 | OK con productos | "Bodega San Martin" en footer | 03 |
| /tiendas | 200 | OK 5 tiendas | OK tras render | 04 |
| /admin/login | 200 | OK | — | — |
| /admin (login qaadmin) | 200 | OK shell + sidebar | Onboarding + tour overlays bloquean clicks | 05 |
| /admin?tab=marketplace | 200 | OK dashboard completo | **404 /api/marketplace/dashboard** | 06 |

## Hallazgos

| # | Severidad | Hallazgo | Archivo / Acción |
|---|---|---|---|
| 1 | **Bug** | `/api/marketplace/dashboard` devuelve 404. El módulo admin tira fetch a esa ruta inexistente y cae al mock. | `components/admin/marketplace/MarketplaceDashboard.tsx:305` — crear `app/api/marketplace/dashboard/route.ts` o cambiar a `/analytics`. |
| 2 | UX | Footer del storefront `/marketplace/[slug]` y de `/tiendas` muestra "© 2026 Bodega San Martin" + link WhatsApp roto `+51 961 234 567` (sin `https://wa.me/`). | Componente footer del store-detail layout — debería leer del tenant. |
| 3 | DX | Onboarding modal + tour spotlight bloquean automatización. Hay que setear `localStorage.onboarding-completed-${slug}=1` y `admin-tour-completed=1`. | Considerar query param `?qa=1` que los desactive de raíz. |
| 4 | Aviso | Error transitorio `/api/marketplace/stores?limit=5` durante primer rebuild de Turbopack. La API responde 200 vía curl una vez compilada. | No accionable — Turbopack cold start. |
| 5 | Branding | `MarketplaceModule` admin sub-tab vacío sin tab seleccionada redirige a `?tab=asistente-ia`. Comportamiento esperado pero la URL `?tab=marketplace` directa no funciona — sólo `#marketplace` tras click. | `app/admin/_components/AdminOverlaysLayer.tsx` o tabs router. |

## Errores de consola consolidados

```
[ERROR] /api/marketplace/dashboard?from=...&preset=mensual → 404 (×2)
[ERROR] /api/marketplace/stores?limit=5 → 500 (transitorio en cold rebuild)
[WARNING] Recharts width(-1) height(-1) (×4) — antes de mount del container
```

## Capturas

- `01-marketplace-light.png` — marketplace home, light mode
- `02-marketplace-dark.png` — marketplace home, dark mode
- `03-storefront-main-dark.png` — `/marketplace/main` con productos
- `04-tiendas-dark.png` — listado de 5 tiendas
- `05-admin-shell.png` — admin shell post-login
- `06-admin-marketplace.png` — módulo Marketplace con KPIs (mock fallback activo)

## Estado del dev server

| Métrica | Valor |
|---|---|
| Dev server | ✅ http://localhost:3000 (pid 1017) |
| Tiempo respuesta | 0.4–0.8s rutas estáticas |
| Login QA admin | ✅ qaadmin · admin · tenant Mi Bodega |

## Próximos pasos sugeridos

1. **Crear `/api/marketplace/dashboard`** o redirigir el fetch del dashboard admin a `/analytics`.
2. **Fix footer storefront** — usar nombre/teléfono del tenant en lugar de hardcoded "Bodega San Martin / +51 961 234 567".
3. **Helper QA**: query param `?qa=1` que silencia onboarding + tour para automatización.

---

## Sesión 2 — Flujos de usuario reales (Sprint+)

### Resultados

| Flujo | Estado | Notas |
|---|---|---|
| Add-to-cart (Arroz Costeño S/20.90) | ✅ | Badge cambió a "Carrito — 1 producto", localStorage persistió item |
| Modal carrito → /marketplace/carrito | ✅ | Página dedicada con item, subtotal, "Seguir comprando" / "Ver mi carrito" |
| Mobile 375px (iPhone) | ✅ | Top nav compacto + bottom tab bar (Tiendas / Buscar / Carrito / Cuenta) |
| Admin → Pedidos | ✅ | **14 pedidos reales** S/215.20, tabs Todos/Pendientes/Confirmados/En camino/Con deuda |
| Admin → Inventario | ✅ | **56 productos** S/16,124.90 valor, márgenes por categoría visibles |
| Admin → Ventas & Caja (POS) | ✅ | POS view con categorías, productos con precios, carrito vacío, "Sin turno" |
| /marketplace/ofertas | ✅ empty state | "Todavía no hay ofertas activas" — correcto, BD tiene 0 deals |

### Hallazgos sesión 2

| # | Severidad | Hallazgo |
|---|---|---|
| 6 | UX | Imágenes de productos en POS y Inventario muestran placeholder rojo (no cargan). Solo Azúcar Rubia tiene foto real. Falta backfill de imágenes o fix del path. |
| 7 | Bug router | `?tab=pedidos`, `?tab=marketplace` directos NO respetan el query — el shell siempre redirige a `?tab=asistente-ia`. Solo funciona via click programático en sidebar. |
| 8 | Aviso | Add-to-cart funciona en localStorage pero al abrir la página `/marketplace/carrito` y volver a marketplace, el badge volvió a "0 productos" (posible inconsistencia entre carrito server y client). |

### Capturas adicionales

- `07-ofertas-vacia.png` — empty state ofertas
- `08-carrito.png` — modal carrito con item agregado
- `09-mobile-marketplace.png` — viewport iPhone 375×812
- `10-admin-pedidos.png` — listado 14 pedidos reales
- `11-admin-inventario.png` — 56 productos + KPIs
- `12-admin-ventas.png` — POS UI con categorías

---

## Sesión 3 — Superadmin (Platform)

Login: `superadmin` / `Super2026!` (script `scripts/create-superadmin-qa.mjs`).

### Resultados

| Ruta | Estado | Datos reales |
|---|---|---|
| /superadmin/login | ✅ | Login OK con credenciales QA |
| /superadmin/dashboard | ✅ | MRR S/2,045 · ARR S/24,540 · 5 tiendas · 25 pedidos mes |
| /superadmin/tenants | ✅ | 5 tenants en cards: Buleje (S/215, 14 ped), luis1, Tienda 3, Mi Pollo, **buleje (vacío)** |
| /superadmin/marketplace | ✅ | Hub nuevo: Proveedores, Imágenes categorías, Tiendas publicadas, Comisiones (próx), Vendors (próx) |
| /superadmin/health | ✅ | Score 90/100 · BD 164ms · API 416ms · Circuit closed |
| /superadmin/security | ✅ | Security Center: 0 vulns · 6 logins fallidos · 1 IP bloqueada · TOTP/Lockout/Audit activos |
| /superadmin/banners | ✅ | 23 banners · 8/8 slots · gestión por página/posición |

### Hallazgos sesión 3 (Superadmin)

| # | Severidad | Hallazgo |
|---|---|---|
| 9 | **Bug datos** | Tenant fantasma `buleje` (slug distinto a `main`) con 0 productos, 0 pedidos, 0 ventas. Probable duplicado del tenant principal `Buleje (main)`. |
| 10 | **Bug fecha** | `/superadmin/health` muestra fila "Incidentes activos — desde **Invalid Date**" en rojo, sin contenido. Date parsing roto. |
| 11 | **Funnel rojo** | Drop-off 75% pedidos→entregas exitosas (4 tiendas con pedidos, solo 1 con entregas). Indica problema operativo en tracking de delivery completion. |
| 12 | Aviso | Performance API `TypeError: Failed to execute 'measure'` al cargar dashboard (1 error consola, no afecta UX). |
| 13 | UX | 8 warnings de Recharts `width(-1) height(-1)` antes de mount del container — visual no se rompe pero llena la consola. |

### Capturas superadmin

- `13-superadmin-dashboard.png` — KPIs ejecutivos completos (MRR, funnel, ARPU, top GMV)
- `14-superadmin-tenants.png` — 5 tenants en cards con uso del plan
- `15-superadmin-marketplace-hub.png` — hub multi-vendor recién cableado
- `16-superadmin-health.png` — health monitor con services + score 90/100
- `17-superadmin-security.png` — Security Center con eventos, postura y compliance Ley 29733
- `18-superadmin-banners.png` — CMS de 23 banners por página/slot

### Estado superadmin

| Aspecto | Status |
|---|---|
| Auth flow | ✅ login + sessión válida |
| Sidebar nav (12 items) | ✅ todas las rutas resuelven |
| Datos reales | ✅ tenants, GMV, pedidos, conexiones BD |
| Mock vs real | Security Center y Health usan datos parcialmente mock (eventos hardcoded) |
| Featuring nuevas (commits hoy) | ✅ Marketplace Hub, dashboards paralelos, sidebar cableado, category-images endpoint |
