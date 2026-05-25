# Auditoría de bugs — Panel Admin (components/admin/** + app/admin/**)

**Fecha:** 2026-05-25
**Alcance:** SOLO `components/admin/**` y `app/admin/**` (716 .tsx en components/admin, 85 archivos en app/admin).
**Método:** análisis estático + verificación de contexto real de cada candidato. NO se tocó código.
**Regla aplicada:** trust BUT verify — cada candidato se abrió y se leyó el contexto completo antes de clasificar. Los falsos positivos se documentan abajo para evitar re-auditarlos.

---

## Resumen por severidad

| Severidad | # Confirmados |
|-----------|---------------|
| **P0** (crashea/rompe el tab) | **0** |
| **P1** (bug funcional) | **0** |
| **P2** (riesgo menor / defensivo) | **2** |

**Conclusión: no se encontraron bugs P0 ni P1 confirmados en el alcance.** El árbol admin está sólidamente defendido. Los únicos hallazgos son 2 riesgos defensivos P2 de baja probabilidad. NO se infla nada: todos los candidatos de alta severidad se verificaron y resultaron seguros (ver sección "Falsos positivos verificados").

---

## Hallazgos P2 (riesgo menor — no rompen hoy)

### P2-1 · Acceso a `module.tabs[0].id` sin guard de array vacío

**Archivo:** `components/admin/AdminSidebar.tsx:420` (y `:619`)
**Snippet:**
```ts
function handleClick() {
  onModuleChange(module.id);
  onTabChange(module.tabs[0].id);   // ← crashea si module.tabs === []
}
```
**Por qué es riesgo:** si algún módulo llega con `tabs: []` (config corrupta, módulo filtrado por permisos hasta quedar sin tabs visibles), `module.tabs[0]` es `undefined` y `.id` tira `TypeError`. Hoy los módulos se definen con tabs hardcodeadas y los vacíos no se renderizan, por eso NO ocurre. Es defensivo.
**Fix mínimo:**
```ts
const first = module.tabs[0];
if (first) onTabChange(first.id);
```
**Riesgo de regresión:** Bajo. **Tests afectados:** 0.

### P2-2 · `setState` tras posible unmount en componentes con fetch en `useEffect`

**Archivos:** ~varios componentes admin con `fetch()` dentro de `useEffect` sin `AbortController` ni flag `mounted` (la mayoría SÍ usan flag `active`; algunos como `MoneyLeakDetector.tsx:59-67` no).
**Snippet (`MoneyLeakDetector.tsx`):**
```ts
Promise.all(queries)
  .then(([current, m1, m2, m3]) => { setCurrentExp(...); setPrevExp(...); })
  .catch((e) => setError(e.message))
  .finally(() => setLoading(false));
// sin guard de unmount
```
**Por qué es riesgo menor:** en React 19 el warning "setState on unmounted component" fue removido y no rompe nada funcionalmente; solo es una micro-fuga si el usuario cambia de tab durante el fetch. NO crashea. Patrón ya correcto en la mayoría (`TodayHub`, `WeeklyReportCard` usan flag `active`/cleanup).
**Fix mínimo (si se quiere):** flag `let active = true;` en el effect + `return () => { active = false; };` y envolver los `setX` en `if (active)`.
**Riesgo de regresión:** Bajo. **Tests afectados:** 0.

---

## Falsos positivos verificados (NO son bugs — documentados para no re-auditar)

| Candidato | Archivo:línea | Por qué NO es bug |
|-----------|---------------|-------------------|
| Hook de contexto sin provider | `AdminSidebar.tsx:165`, `DeliveryTab/index.tsx:65` (`useTenant`) | `tenant-context` tiene **default ctx value** (no hace throw); cae a defaults. Único hook throwing usado en admin es `useDashboardData` (16 archivos) — ya verificado seguro por el usuario. Los demás hooks throwing (useToast, useCart, usePromotions, useFavorites, useWishlist, useReviews, useQuickAdd, useCheckoutData, useSubscriptions, useCompare, useCustomer) tienen **0 usos** en admin. |
| `.parse()` Zod | `MoneyLeakDetector.tsx:64` | Es una función local `parse` (normaliza respuesta de fetch), NO Zod. No hay ningún `.parse()` de Zod en admin. |
| Imports rotos | — | Scan resolvió 100% de imports relativos y `@/` en admin. 0 rotos. |
| `key` faltante en listas | — | `react/jsx-key` está como **error** (heredado de next/core-web-vitals); lint pasa, no hay listas sin key. |
| `module.tabs[0].id`, ternario funnel `[4]`/`[0]` | `DashboardTab.tsx:503-518` | `funnelData` (4 elem) y `conversionFunnelData` (5 elem) son **literales hardcodeados** — siempre tienen longitud fija. `[4]`/`[0]` siempre existen. |
| `paretoChartData[0].revenue`, `productAffinities[0].count` | `DashboardProductosSection.tsx:144,229` | Ambos bloques están guardados por `.length > 0` (líneas 119, 212) y el `[0]` se accede dentro de `.map`, que solo itera si hay elementos. |
| `data.salesByDay.map` | `WeeklyReportCard.tsx:257,313` | `data` siempre se setea con `salesByDay: buildSalesByDay(...)` (línea 129); nunca parcial. Render guardado con `data ? ... : 1`. |
| `exhaustive-deps` con `dateRange?.from/.to/.preset` | `TodayHub.tsx:116,329`, `InicioDashboardV2:102`, `InicioMultiCharts:190` | El código usa **primitivos** del objeto (más correcto que el objeto entero); el warning de ESLint es el opuesto de un bug. Re-fetch correcto al cambiar rango. |
| `addToCart` missing dep | `KioskPOS.tsx:205` | `addToCart` es `useCallback(..., [])` → **estable**, nunca cambia. Omitirlo no causa stale closure. |
| `no-unused-expressions` | `OnboardingTour.tsx:137` | `isLastStep ? onComplete() : onNext();` — ternario que ejecuta funciones. Funciona; solo es nit de estilo. |
| Handler async sin try/catch en venta POS | `MobilePOS.tsx:304-342`, `KioskPOS.tsx:253`, `PuntoCompraView.tsx:630` | La ruta de escritura crítica (POST `/api/sales`, `/api/purchases`) **SÍ** tiene try/catch + cola offline + `finally { setPaying(false) }`. UI no queda colgada. |
| `DashboardIATab.tsx:226-270` `data.orders.filter` | — | `data` guardado antes de los cálculos (early return si null). |

---

## Cobertura de las 6 categorías solicitadas

| # | Categoría | Resultado |
|---|-----------|-----------|
| 1 | Hooks de contexto sin provider (otros que useSettings/useTheme/useDashboardData) | **Limpio.** Solo `useTenant` (default ctx, no throw). |
| 2 | `useEffect` deps faltantes (loop/stale) + fetch sin cleanup | **Limpio funcionalmente.** deps-warnings son benignos; fetch sin guard = P2-2 (no crashea en React 19). |
| 3 | Acceso a undefined/null sin guard (`.map`/`.toFixed`/`[0]`) | **Limpio.** Todos los `[0]`/`.map` revisados están guardados o sobre literales de longitud fija. P2-1 es el único defensivo. |
| 4 | Handlers async sin try/catch (UI colgada) | **Limpio** en rutas críticas (POS/ventas/compras todas con try/catch + finally). |
| 5 | `key` faltante / `.parse()` Zod / claves duplicadas | **Limpio.** jsx-key es error en lint; no hay `.parse()` Zod. |
| 6 | Imports rotos / componentes inexistentes | **Limpio.** 0 imports rotos (relativos + `@/`). |

---

## Notas de método

- Se ejecutó `npx eslint` sobre todo el alcance: solo aparecen warnings `exhaustive-deps` (benignos, mayoría "logical expression could change every render" = perf nit) y 2 unused-disable. **0 errores.**
- jsx-key, no-undef y rules-of-hooks: **sin hits.**
- No se ejecutó `tsc --noEmit` completo (proyecto GIGANTE, 778K LOC); en su lugar se hizo scan dirigido de resolución de imports en el alcance.
