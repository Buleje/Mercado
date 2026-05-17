# Auditoria de Performance — Panel Admin Buleje
**Fecha:** 2026-05-16 | **Rama:** feat/checkout-payment-proof | **Auditor:** Performance Engineer Agent

---

## Diagnostico ejecutivo

El cambio de tab se siente lento porque cada modulo se **desmonta y remonta** en cada navegacion (AnimatePresence `mode="wait"` + if-chain en TabRouter). No existe keepAlive. La animacion spring (260/28) suma ~280ms de latencia percibida antes de que el contenido sea interactivo. Recharts se importa estaticamente dentro de modulos que son lazy a nivel de tab — correcto en estructura pero incorrecto en granularidad: **FinanzasModule y ComprasModule** llevan todo recharts en su chunk principal aunque el usuario quizas solo vea la tabla de gastos.

---

## TOP 5 Bottlenecks (con evidencia de archivo)

### B1 — AnimatePresence `mode="wait"` bloquea la navegacion
**Impacto:** +280ms percibidos en CADA cambio de tab (exit + enter en serie).

| Archivo | Linea | Problema |
|---|---|---|
| `app/admin/_components/AdminMainContent.tsx` | 72–85 | `mode="wait"` espera que exit termine antes de montar el nuevo tab |
| `app/admin/_components/AdminMainContent.tsx` | 79–81 | spring `y: {type:"spring", stiffness:260, damping:28}` — ~200ms hasta settle |

**Cambio sugerido:**
```tsx
// Antes
<AnimatePresence mode="wait">
  <m.div key={tab}
    initial={{ opacity: 0, y: 14 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ opacity: { duration: 0.28 }, y: { type: "spring", stiffness: 260, damping: 28 } }}
  >

// Despues — cambio de tab instantaneo, fade corto
<AnimatePresence mode="popLayout">
  <m.div key={tab}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.12 }}
  >
```
**Tiempo ahorrado:** ~160–200ms por navegacion. **Esfuerzo:** 0.5 dias.

---

### B2 — Recharts importado estaticamente en modulos medianos-grandes (46 archivos)
**Impacto:** ~180–250 KB extra en el chunk de cada modulo que lo importa estaticamente y NO lo tiene lazy.

| Archivo / Modulo | Tamano estimado chunk | Recharts estatico |
|---|---|---|
| `components/admin/unified/FinanzasModule.tsx` (1978 lin) | ~280 KB | Si — lineas 10–14 |
| `components/admin/unified/ComprasModule.tsx` (631 lin) | ~140 KB | Si — linea 31 |
| `components/admin/inicio/InicioCharts.tsx` | ~80 KB | Si — linea 14 |
| `components/admin/inicio/_shared/MicroDonut.tsx` | ~50 KB | Si — linea 19 |

El total de **46 archivos** con `from "recharts"` estatico significa que recharts (~180 KB min) entra en multiples chunks. Webpack deduplica si son el mismo package, pero en Turbopack/Next 16 cada dynamic boundary puede crear un chunk separado con su copia.

**Cambio sugerido:** Extraer los sub-componentes de charts en FinanzasModule y ComprasModule a archivos `*Charts.tsx` propios e importarlos con `dynamic(..., { ssr: false })` desde el modulo padre.

```tsx
// FinanzasModule.tsx — quitar import recharts directo
// Crear components/admin/finanzas/FinanzasChartsPanel.tsx
const FinanzasChartsPanel = dynamic(
  () => import("@/components/admin/finanzas/FinanzasChartsPanel"),
  { ssr: false, loading: () => <S /> }
);
```
**KB reducidos:** 180–250 KB del chunk inicial de FinanzasModule. **Esfuerzo:** 2 dias (FinanzasModule + ComprasModule).

---

### B3 — Sin memoizacion en AdminPage: re-render total al cambiar tab
**Impacto:** 28 hooks re-ejecutan su logica de derivacion; `useAdminTabsDerived` re-filtra 133 tabs cada vez.

| Archivo | Linea | Problema |
|---|---|---|
| `app/admin/page.tsx` | 199–202 | `useAdminTabsDerived` recalcula `allowedTabs`, `filteredTabs`, `favoriteTabItems`, `recentTabItems` en cada render |
| `app/admin/_components/AdminMainContent.tsx` | 41–88 | Componente sin `memo()` — re-renderiza cuando cualquier prop del padre cambia |
| `app/admin/page.tsx` | 69–420 | 28 hooks en el mismo componente raiz; cualquier state local (sidebarCompact, etc.) dispara todo |

**Cambio sugerido:**
```tsx
// AdminMainContent.tsx
import { memo } from "react";
export const AdminMainContent = memo(function AdminMainContent({ ... }) { ... });

// page.tsx — separar state de sidebar en sub-componente SidebarShell
// para que setSidebarCompact no re-renderice el contenido principal
```
**Tiempo ahorrado:** elimina renders fantasma de ~20–40ms por interaccion con sidebar. **Esfuerzo:** 1 dia.

---

### B4 — MarketplaceModule: 4143 lineas, un chunk monolitico
**Impacto:** primer acceso al tab "marketplace" carga un chunk que Webpack/Turbopack no puede tree-shake porque todo esta en un solo archivo "use client".

| Archivo | Lineas | Problema |
|---|---|---|
| `components/admin/unified/MarketplaceModule.tsx` | 4143 | Monolito — sub-tabs internos no estan lazy |

**Cambio sugerido:** dividir en al menos 3 chunks lazy internos:
```tsx
const MarketplaceProductsTab = dynamic(() => import("./marketplace/MarketplaceProductsTab"), { ssr: false });
const MarketplaceOrdersTab   = dynamic(() => import("./marketplace/MarketplaceOrdersTab"),   { ssr: false });
const MarketplaceStatsTab    = dynamic(() => import("./marketplace/MarketplaceStatsTab"),    { ssr: false });
```
**KB reducidos:** estimado 150–200 KB del chunk inicial de marketplace. **Esfuerzo:** 3 dias.

---

### B5 — useAdminAlerts polling cada 60s sin batching con otros polls
**Impacto:** al montar VendorDashboard (30s interval) + MetasLogros (30s interval × 2) + AdminAlerts (60s), el admin puede hacer 4–6 requests/minuto al fondo aunque el usuario no haya cambiado de tab.

| Archivo | Linea | Intervalo |
|---|---|---|
| `app/admin/_hooks/useAdminAlerts.ts` | 41,79 | 60s global (siempre activo) |
| `components/admin/unified/VendorDashboardModule.tsx` | 90,136 | 30s (con visibility guard) |
| `components/admin/unified/MetasLogrosModule.tsx` | 129, 251, 805 | 30s x 2 polls (con visibility guard) |

Los visibility guards estan presentes — bien. El problema es la **superposicion**: cuando el usuario esta en tab `vendor-dashboard`, tiene 3 timers activos simultaneamente (dashboard + metas × 2). No hay coordinacion entre ellos.

**Cambio sugerido:** centralizar polling en un `useAdminPollingHub` con prioridad por tab activo:
```tsx
// Pausa MetasLogros polls cuando el tab activo NO es "metas-logros"
const isTabActive = tab === "metas-logros";
useEffect(() => {
  if (!isTabActive) return; // no arrange interval si tab no esta visible
  // ...interval logic
}, [isTabActive]);
```
**Tiempo ahorrado en red:** 40–60% menos requests de fondo. **Esfuerzo:** 2 dias.

---

## Quick Wins (< 2h cada uno)

| # | Cambio | Archivo | Impacto | Tiempo |
|---|---|---|---|---|
| QW1 | `mode="wait"` → `mode="popLayout"` + transition 0.12s | `AdminMainContent.tsx:72` | -160ms por tab change | 30 min |
| QW2 | `export const AdminMainContent = memo(...)` | `AdminMainContent.tsx:41` | Elimina re-renders de sidebar | 20 min |
| QW3 | `PREFETCH_MAP` agregar "plata", "analytics-pro", "marketplace" | `TabRouter.tsx:83-90` | Pre-carga los 3 tabs mas lentos | 20 min |
| QW4 | `MicroDonut.tsx` — dynamic import de recharts | `inicio/_shared/MicroDonut.tsx:19` | -180 KB del chunk de InicioCharts | 45 min |
| QW5 | Pausa polls de MetasLogros cuando tab !== "metas-logros" | `MetasLogrosModule.tsx:251,805` | -2 requests/min innecesarios | 1h |

---

## Plan de implementacion — ROI decreciente

| Prioridad | Bottleneck | Dias | Impacto usuario |
|---|---|---|---|
| 1 (HOY) | QW1 — AnimatePresence popLayout | 0.5d | -160ms inmediato, perceptible siempre |
| 2 (HOY) | QW2 + QW3 — memo + prefetch map | 0.5d | Elimina renders fantasma + warmup |
| 3 (Sprint) | B2 — Recharts lazy en FinanzasModule | 2d | -250 KB chunk Finanzas |
| 4 (Sprint) | B5 — Pausa polls por tab activo | 2d | -40% requests fondo |
| 5 (Siguiente) | B4 — Split MarketplaceModule | 3d | -200 KB chunk marketplace |
| 6 (Siguiente) | B3 — Separar SidebarShell en page.tsx | 1d | Elimina cascada de re-renders |

**Total quick wins:** 1 dia de trabajo → navegacion perceptiblemente mas rapida para Brandon.
**Total sprint completo:** ~9 dias → objetivo TTI < 2s en tab switch + LCP < 2.5s en primer acceso.

---

## Notas tecnicas

- **No usar `force-dynamic`** en route handlers (CLAUDE.md regla 4, hotfix bdb6f5f2). Usar `"use cache"` + `cacheLife`/`cacheTag`.
- **TabRouter** ya tiene `PREFETCH_MAP` + `PREFETCH_LOADERS` con 2s delay — solo falta ampliar el mapa a tabs faltantes.
- **Visibility guards** en VendorDashboard y MetasLogros ya implementados (2026-05-16). Solo falta el guard por tab activo.
- `AnimatePresence mode="popLayout"` monta el nuevo tab inmediatamente mientras el anterior hace exit — el usuario ve contenido ~160ms antes.
