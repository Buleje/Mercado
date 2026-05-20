# WIRING.md — Guía de migración LazyChart

> Generado por performance-engineer — 2026-04-10
> Este documento NO debe modificarse manualmente. Se regenera en cada oleada de migración.

## Objetivo

Eliminar ~120-180 KB gzip del bundle inicial del panel de administración reemplazando
los 36 imports estáticos de `recharts` con los wrappers lazy de `@/components/charts`.

El wrapper ya existe en `components/charts/LazyChart.tsx`. Solo falta wiring en los consumidores.

---

## Estado actual

| Métrica | Valor |
|---------|-------|
| Archivos con import estático de recharts | **36** (excluyendo el propio LazyChart.tsx) |
| Bundle estimado recharts (gzip) | ~120-180 KB |
| Bundle eliminado del initial load con esta migración | ~120-180 KB |
| Archivos en dirty tree (no tocar en oleada actual) | ~36 (todos en working tree dirty) |
| Estado de los wrappers | LISTOS — `components/charts/` completo |

---

## Ejemplo antes/después

### Antes (import estático — añade recharts al bundle inicial)

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function SalesChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Después (lazy — recharts NO entra en el bundle inicial)

```tsx
import { LazyBarChart } from "@/components/charts";
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
// NOTA: Los subcomponentes (Bar, XAxis, etc.) SÍ pueden importarse estáticamente
// porque pesan ~2 KB. Solo el chart contenedor (BarChart, LineChart, etc.) es pesado.

export function SalesChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LazyBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#8884d8" />
      </LazyBarChart>
    </ResponsiveContainer>
  );
}
```

**Cambio quirúrgico:** Solo reemplazar el import del chart contenedor. Los hijos (Bar, XAxis, etc.) pueden quedarse con import estático porque son pequeños.

---

## Tabla de mapeo — chart type → lazy wrapper

| recharts original | Wrapper lazy |
|-------------------|--------------|
| `BarChart` | `LazyBarChart` |
| `LineChart` | `LazyLineChart` |
| `PieChart` | `LazyPieChart` |
| `AreaChart` | `LazyAreaChart` |
| `ComposedChart` | `LazyComposedChart` |
| `ScatterChart` | `LazyScatterChart` |
| `RadialBarChart` | `LazyRadialBarChart` |
| `RadarChart` | `LazyRadarChart` |

---

## Lista completa de archivos a migrar (36)

Todos estos archivos tienen imports estáticos de `recharts` y deben ser migrados
cuando el working tree dirty se limpie (post-merge de PRs pendientes).

### Prioridad ALTA — mayor impacto en bundle admin inicial

| # | Archivo | Chart types usados |
|---|---------|-------------------|
| 1 | `components/admin/SmartDashboardTab.tsx` | BarChart, LineChart, AreaChart |
| 2 | `components/admin/unified/FinanzasModule.tsx` | BarChart, LineChart, ComposedChart |
| 3 | `components/admin/analytics/AnalyticsKPIBarV2.tsx` | BarChart, LineChart |
| 4 | `components/admin/TreasuryDashboard.tsx` | BarChart, PieChart |
| 5 | `components/admin/CRMTab.tsx` | LineChart, AreaChart, PieChart |
| 6 | `components/admin/SalesOrdersTab.tsx` | BarChart, LineChart |
| 7 | `components/RevenueCharts.tsx` | BarChart, LineChart, AreaChart |
| 8 | `components/admin/unified/CRMClientesModule.tsx` | LineChart, PieChart |
| 9 | `components/admin/FiadosModule.tsx` | BarChart, LineChart |
| 10 | `components/admin/unified/ComprasModule.tsx` | BarChart |

### Prioridad MEDIA

| # | Archivo |
|---|---------|
| 11 | `components/admin/analytics/CashFlowChart.tsx` |
| 12 | `components/admin/analytics/FiadoAnalyticsPanel.tsx` |
| 13 | `components/admin/analytics/MarginWaterfallChart.tsx` |
| 14 | `components/admin/analytics/SalesTrendChart.tsx` |
| 15 | `components/admin/cash-register/CashRegisterChart.tsx` |
| 16 | `components/admin/ComparativeReportsTab.tsx` |
| 17 | `components/admin/ContratosModule.tsx` |
| 18 | `components/admin/CotizacionesModule.tsx` |
| 19 | `components/admin/DevolucionesProveedorModule.tsx` |
| 20 | `components/admin/inventario/DemandForecast.tsx` |

### Prioridad BAJA (charts específicos, menor impacto)

| # | Archivo |
|---|---------|
| 21 | `components/admin/inventario/PriceSparkline.tsx` |
| 22 | `components/admin/InventoryMetricsTab.tsx` |
| 23 | `components/admin/marketplace/ProductAnalyticsPanel.tsx` |
| 24 | `components/admin/NotasCreditoModule.tsx` |
| 25 | `components/admin/prestamos/PrestamosDashboard.tsx` |
| 26 | `components/admin/PrestamosModule.tsx` |
| 27 | `components/admin/RecetasModule.tsx` |
| 28 | `components/admin/SupplierComparator.tsx` |
| 29 | `components/admin/TesoreriaModule.tsx` |
| 30 | `components/admin/TurnosModule.tsx` |
| 31 | `components/admin/unified/CatalogoTiendaModule.tsx` |
| 32 | `components/admin/unified/InventarioAlmacenesModule.tsx` |
| 33 | `components/admin/unified/MeteringCard/MeteringCard.client.tsx` |
| 34 | `components/admin/unified/POSCajaModule.tsx` |
| 35 | `components/admin/vendor-dashboard/VendorWeeklyChart.tsx` |
| 36 | `components/superadmin/_shared/SAStatCard.tsx` |

---

## Win 2 — AdminMotionProvider wiring

El layout admin **no tiene** un `layout.tsx` propio en `app/admin/`.
El contenido admin se renderiza desde `app/admin/page.tsx` (1256 líneas, dirty).

### Next step cuando page.tsx se limpie

Agregar en `app/admin/page.tsx` (o en un nuevo `app/admin/layout.tsx` si se crea):

```tsx
import AdminMotionProvider from "@/components/admin/providers/AdminMotionProvider";

// Dentro del render:
<AdminMotionProvider>
  {/* todo el contenido del admin */}
</AdminMotionProvider>
```

Luego en cada componente admin que use `motion.div`:

```tsx
// Antes:
import { m as motion } from "framer-motion";
<motion.div animate={...} />

// Después:
import { m } from "@/components/admin/providers";
<m.div animate={...} />
```

---

## Win 3 — Cache directives wiring

Los 3 route handlers ya tienen cache via `Cache-Control` headers o `getOrSet` parcial.
Los helpers de `lib/cache/` están listos para uso inmediato.

### settings/route.ts

Cambio sugerido en `GET`:
```ts
import { withMediumCache } from "@/lib/cache";

// Reemplazar:
const settings = await withDbRetry(() => SettingsDB.get(tenantId));

// Por:
const settings = await withMediumCache(
  `settings:${tenantId}`,
  () => withDbRetry(() => SettingsDB.get(tenantId))
);
```

Agregar en el header de respuesta:
```ts
"Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
```

Invalidar en PUT:
```ts
import { invalidateSettingsCache } from "@/lib/cache";
// Al final del PUT exitoso:
invalidateSettingsCache(tenantId);
```

### v1/products/route.ts

Ya tiene `Cache-Control: public, s-maxage=30`. El `ProductsDB.getAll()` ya usa
`getOrSet` internamente si se siguió el patrón de la clase DB. Verificar y
extender TTL a 300s si corresponde.

### marketplace/catalog/route.ts

La función `batchProductEnrichment` ejecuta 4 queries Prisma en paralelo sin cache.
Wrappear con:
```ts
import { withMediumCache } from "@/lib/cache";

const enrichmentData = await withMediumCache(
  `marketplace:catalog:${tenantId}:${productIds.join(",")}`,
  () => batchProductEnrichment(productIds, tenantId)
);
```

TTL 120s es suficiente para datos de enriquecimiento (ratings, variants, best sellers).

---

## Impacto estimado post-migración completa

| Win | Bundle reducido | LCP estimado |
|-----|----------------|--------------|
| WIN 1 — LazyChart (36 archivos) | -120 a -180 KB gzip admin initial | N/A (admin no es storefront) |
| WIN 2 — AdminMotionProvider | -60 KB gzip admin initial | N/A |
| WIN 3 — Cache settings + catalog | 0 KB bundle | -200 a -400ms LCP storefront |
| **Total combinado** | **-180 a -240 KB admin initial** | **-200 a -400ms LCP** |
