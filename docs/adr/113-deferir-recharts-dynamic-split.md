# ADR-113: Diferir Recharts dynamic split a sprint propio

**Status:** Diferido — sprint propio pendiente
**Date:** 2026-05-17
**Decisión-makers:** Brandon Buleje
**Context:** Audit profundo del panel admin (`reports/audit-admin-deep/REPORT.md`) identificó 2 P0 de performance relacionados con bundle splitting de Recharts en monolitos:

- **P-P0-3** · `components/admin/PrestamosModule.tsx` (2705 LOC) importa Recharts estático
- **P-P0-4** · `components/admin/ContratosModule.tsx` (2268 LOC) + `components/admin/TesoreriaModule.tsx` (1775 LOC) idem

Total LCP impact estimado: 200-400ms en el initial paint del tab cargado (no del admin shell).

---

## Decisión

**Diferir** la implementación a sprint propio. NO aplicar en el hot-fix del audit por riesgo/scope.

### Por qué se difiere (no se hace en hot-fix)

1. **Los 3 monolitos YA están con `dynamic()` en `app/admin/_components/TabRouter.tsx`** → no afectan LCP inicial del admin shell ni del DashboardTab por defecto. Solo afectan el INP al navegar al tab específico (préstamos, contratos, tesorería).

2. **El refactor real requiere extracción estructural** — los 3 archivos tienen Recharts embebido en JSX disperso (BarChart, AreaChart, PieChart, LineChart, ComposedChart en distintas secciones del módulo). Para hacer dynamic split correctamente hay que:
   - Identificar cada sección de chart en los 3 archivos
   - Extraer cada una a `*ChartSection.tsx` con su propia data shape
   - Wrappear con `dynamic(() => import("./X-ChartSection"), { ssr: false, loading: <Skeleton /> })`
   - Probar que las interacciones (hover, click, drill-down) sigan funcionando

3. **~5000 LOC de refactor con baseline visual obligatorio.** Sin Storybook chromatic o Playwright snapshot de cada chart, el riesgo de regresión es alto. Préstamos y tesorería son módulos financieros — cualquier rotura visual genera desconfianza en el dueño.

4. **No es bloqueante de producción.** A diferencia de los otros 12 P0 del audit (cajero turno bloqueado, race en fiados, OOM con 50k órdenes, etc.), esto es optimización pura de INP — perceptible pero no crítico.

---

## Alcance del sprint propio

### Objetivo
Reducir el bundle del chunk lazy de los 3 módulos en ~80KB gzip (Recharts) extrayendo todas las secciones de chart a sub-componentes `dynamic()` con `ssr: false`.

### Tasks

| # | Archivo | Charts a extraer | LOC estimado del split |
|---|---|---|---|
| 1 | `PrestamosModule.tsx` (2705) | BarChart (cuotas por mes), AreaChart (saldo acumulado), PieChart (distribución por tipo), LineChart (pagos vs proyectado) | ~400 LOC nuevos en 4 sub-componentes |
| 2 | `ContratosModule.tsx` (2268) | ComposedChart (firma+pago), BarChart (estado por mes) | ~200 LOC en 2 sub-componentes |
| 3 | `TesoreriaModule.tsx` (1775) | AreaChart (cash flow), PieChart (distribución cuentas), BarChart (proyección) | ~300 LOC en 3 sub-componentes |

### Pre-requisitos bloqueantes

1. **Baseline visual con Playwright** — capturar screenshot de cada chart en los 3 tabs antes de tocar nada. Comparar pixel-by-pixel post-refactor.

2. **Smoke con datos reales** — los 3 módulos requieren tener data en DB para que los charts rendericen. Crear seeds de:
   - 5 préstamos en distintos estados (PrestamosModule)
   - 3 contratos firmados + 2 pendientes (ContratosModule)
   - Cash flow del mes con ingresos/egresos variados (TesoreriaModule)

3. **Skill `bsm-design-system` cargado** — los charts usan tokens del DS. Cualquier extracción debe preservar el theming dark mode.

### Criterios de aceptación

- ✅ Bundle del chunk lazy de cada módulo reduce ≥ 60KB gzip (medido con `@next/bundle-analyzer`)
- ✅ Tests Playwright snapshot pass para los 3 tabs (light + dark)
- ✅ INP del tab cargado mejora ≥ 100ms (medido con Lighthouse)
- ✅ Zero regresiones visuales reportadas en QA visual
- ✅ tsc clean + lint clean + design-tokens gate clean

### Anti-objetivos

- ❌ NO refactorizar lógica de negocio (cálculos, fetchs, state machines)
- ❌ NO mover el módulo entero a dynamic (ya está con dynamic en TabRouter)
- ❌ NO migrar a otra librería de charts (Recharts se mantiene)

### Tiempo estimado

3-5 días de un dev + 1 día QA visual. Total: **1 semana de sprint**.

---

## Alternativas consideradas

### A. Hacer ahora (en este branch)
- ✅ Cierra el audit completo
- ❌ Riesgo alto: 5000 LOC, sin baseline visual, en zona financiera
- ❌ Mezcla scope con los P0 críticos ya commiteados

**Rechazada.**

### B. Diferir indefinidamente
- ✅ Zero riesgo inmediato
- ❌ Pierde tracking — el ROI de performance se olvida

**Rechazada.**

### C. ✅ Diferir con ADR explícito + sprint specced (elegida)
- ✅ Documenta la decisión y el alcance
- ✅ Permite priorizar contra otros sprints (Stripe Connect, mobile, etc.)
- ✅ Mantiene visibilidad sin bloquear el merge del audit P0

---

## Consecuencias

### Positivas
- Audit P0 mergea limpio con 12/14 cerrados sin contaminación de scope
- El sprint de performance frontend queda formalizado con criterios claros
- Las métricas baseline (INP actual de los 3 tabs) se pueden capturar antes para comparación post-fix

### Negativas
- Los 3 tabs siguen cargando ~80KB extra al navegar (INP +200ms aprox)
- Si nunca se ejecuta el sprint, queda como deuda permanente

### Mitigación
- Marcar en `MEMORIA-PROYECTO.md` o roadmap del próximo trimestre
- Re-priorizar si Brandon agrega vendors masivos al marketplace (más cargas del tab tesorería)

---

## Referencias

- `reports/audit-admin-deep/REPORT.md` — audit profundo completo
- `reports/audit-admin-deep/03-performance.md` — detalle P-P0-3 y P-P0-4
- `app/admin/_components/TabRouter.tsx` — donde los 3 módulos ya están con `dynamic()`
- ADR-070 — Design system tokens (relevant para preservar theming en extracción)

---

**Última actualización:** 2026-05-17 · Diferido por Brandon post hot-fix audit profundo.
