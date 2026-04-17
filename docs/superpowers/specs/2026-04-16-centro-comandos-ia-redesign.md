# Centro de Comandos IA — Rediseno completo

**Fecha:** 2026-04-16
**Estado:** Spec aprobado
**Impacto:** 77% reduccion de codigo (11,361 → ~2,600 LOC), 10 tabs → 4 secciones

---

## Problema

El Centro de Comandos IA actual tiene 10 tabs con 19 archivos y 11,361 lineas de codigo. Problemas:

1. **Solapamiento masivo** — Briefing, Diagnostico y Coach dicen lo mismo de forma diferente. Plan, Asesor y OpportunityFinder dan recomendaciones en 3 lugares distintos.
2. **Features enterprise sin uso** — Decision Log, Natural Query Engine, Market Research con datos hardcodeados. Un dueno de bodega en Pucallpa no usa estas herramientas.
3. **Navegacion saturada** — 10 tabs horizontales con scroll en mobile. El usuario se pierde.
4. **Diseno inconsistente** — cada tab tiene su propio layout, densidad y estilo de cards.

## Solucion

Reestructurar en **4 secciones** con navegacion por **sidebar lateral** dentro del area de contenido del admin.

### Mapa de fusion

```
ANTES (10 tabs)              →  DESPUES (4 secciones)
─────────────────────           ─────────────────────
Briefing (1,164 LOC)       ─┐
Diagnostico (1,025 LOC)     ├→  RESUMEN (~800 LOC)
RiskRadar (583 LOC)         ─┤
OpportunityFinder (509 LOC) ─┤
Coach metrics (parcial)     ─┘

Plan (947 LOC)              ─┐
DailyChecklist (98 LOC)      ├→  ACCIONES (~600 LOC)
Asesor (363 LOC)            ─┘

Precios (287 LOC)           ─┐
Simulador (901 LOC)          ├→  ANALISIS (~700 LOC)
BusinessCalculators (149 LOC)┘

FiadoDashboard (515 LOC)    ─→   FIADOS (~500 LOC)
```

### Componentes eliminados

| Componente | LOC | Razon |
|---|---|---|
| AIDecisionLog | 535 | Overhead enterprise, no usado |
| AINaturalQueryEngine | 552 | Overkill para el usuario objetivo |
| AIMarketResearch | 430 | Datos de competidores hardcodeados, no reales |
| AIStrategicAdvisor (standalone) | 363 | Recomendaciones se fusionan en Acciones |
| AIPerformanceCoach (chat + calendar) | ~1,200 | Chat redundante con Chat IA tab existente |
| AIWeeklyReport (standalone) | 623 | Se convierte en boton "Exportar reporte" en Resumen |
| AIRiskRadar (standalone) | 583 | Alertas se muestran inline en Resumen |
| AIOpportunityFinder (standalone) | 509 | Oportunidades inline en Resumen |

**Total eliminado: ~4,795 LOC en componentes completos + ~3,966 LOC refactorizados = ~8,761 LOC eliminados**

---

## Arquitectura

### Estructura de archivos nueva

```
components/admin/ai-center/
├── ai-center.types.ts           (NUEVO — BusinessData, Product, Order, Sale, Customer, ExpenseSummary)
├── AICommandCenter.tsx          (REESCRIBIR — router + data fetching, usa AdminSubSidebar, ~200 LOC)
├── sections/
│   ├── ResumenSection.tsx       (NUEVO — KPIs + alertas + oportunidades + trend, ~800 LOC)
│   ├── AccionesSection.tsx      (NUEVO — tareas priorizadas + checklist + recomendaciones, ~600 LOC)
│   ├── AnalisisSection.tsx      (NUEVO — precios + simulador + calculadora, ~700 LOC)
│   └── FiadosSection.tsx        (NUEVO — vista read-only de creditos + deep-link a FiadosModule, ~400 LOC)
├── HITLApprovalsBanner.tsx      (SIN CAMBIOS — se mantiene)
└── AIModuleSkeleton.tsx         (SIN CAMBIOS — se mantiene)
```

Archivos eliminados (19 → 8):
- `AIDailyBriefing.tsx` — absorbido por ResumenSection
- `AIActionPlan.tsx` — absorbido por AccionesSection
- `AIBusinessHealthScore.tsx` — absorbido por ResumenSection
- `AIPerformanceCoach.tsx` — eliminado (metricas utiles van a Resumen)
- `AIWhatIfSimulator.tsx` — absorbido por AnalisisSection
- `AIRiskRadar.tsx` — absorbido por ResumenSection (inline)
- `AIOpportunityFinder.tsx` — absorbido por ResumenSection (inline)
- `AINaturalQueryEngine.tsx` — eliminado
- `AIWeeklyReport.tsx` — eliminado (boton en Resumen)
- `AIFiadoDashboard.tsx` — reescrito como FiadosSection
- `AIDecisionLog.tsx` — eliminado
- `AIMarketResearch.tsx` — eliminado
- `AIStrategicAdvisor.tsx` — absorbido por AccionesSection
- `AISmartPricing.tsx` — absorbido por AnalisisSection
- `BusinessCalculators.tsx` — absorbido por AnalisisSection
- `DailyChecklist.tsx` — absorbido por AccionesSection

### Navegacion: reutilizar AdminSubSidebar existente

El proyecto ya tiene `components/admin/layout/AdminSubSidebar.tsx` (w-48, border-l-[3px] emerald, mobile slide-over drawer). Lo reutilizamos en vez de crear otro sidebar custom.

```
┌─────────────────────────────────────────────────────┐
│ Admin sidebar │  AdminSubSidebar │   Contenido      │
│ (existente)   │  (reutilizado)   │                  │
│               │                  │                  │
│ Dashboard     │  ● Resumen       │  [KPIs]  [KPIs]  │
│ Inventario    │    Acciones 5    │  [Alertas][Trend] │
│ Ventas        │    Analisis      │  [Oportunidades] │
│ ► Centro IA   │    Fiados  3     │                  │
│ Clientes      │                  │                  │
│ ...           │  Hace 2 min      │                  │
└─────────────────────────────────────────────────────┘
```

Configuracion del AdminSubSidebar:
- `categoryLabel`: "Centro IA"
- `tabs`: array con las 4 secciones
- `onTabChange`: callback para cambiar seccion activa
- `alerts`: badge counts (acciones pendientes, fiados vencidos)
- Mobile: usa el slide-over drawer existente del AdminSubSidebar (consistencia con Clientes y otros modulos)

### Data fetching (sin cambios en la estrategia)

El AICommandCenter mantiene el fetch centralizado de 4 endpoints:
- `/api/admin/dashboard` → productos, ordenes, alertas
- `/api/sales?limit=500` → historial de ventas
- `/api/customers` → datos de clientes
- `/api/expenses/summary` → gastos

Auto-refresh cada 5 minutos. Datos pasados como props a cada seccion.

---

## Secciones detalladas

### 1. RESUMEN (~800 LOC)

Vista que el dueno ve al llegar cada manana. Todo lo importante en una pantalla.

**Layout:**
```
[Saludo corto + fecha]                    [Boton: Exportar reporte]
[KPI: Ventas] [KPI: Transacciones] [KPI: Ticket promedio] [KPI: Salud negocio]
[Alertas activas (lista)]                 [Mini chart ventas 7 dias]
[Oportunidades detectadas (3 cards)]
```

**Componentes internos:**
- `GreetingBar` — una linea: "Buenos dias, Brandon" + fecha + boton exportar
- `KPIGrid` — 4 cards con valor, comparacion vs ayer, trend color
- `AlertsList` — lista de alertas priorizadas (dot rojo/amarillo + texto + severidad)
- `WeeklyTrendChart` — bar chart simple con recharts (ya es dependencia del proyecto, usado en FiadosModule y dashboard)
- `OpportunitiesRow` — 3 cards verdes con oportunidad + impacto estimado en soles

**Calculo del Health Score (simplificado de AIBusinessHealthScore):**
- Pesos: revenue growth 25%, inventory rotation 20%, margin strength 20%, fiado risk 15%, customer growth 10%, operational efficiency 10%
- Score 0-100, color: <40 rojo, 40-60 amarillo, 60-80 emerald, >80 emerald intenso
- Se muestra como KPI, no como componente expandido

**Alertas (de RiskRadar, simplificado):**
- Stock bajo: productos con stock <= stockMin
- Fiados vencidos: fiados con status overdue
- Pedidos pendientes: orders con status pendiente/en_proceso
- Productos por vencer: items con expiresAt < 7 dias
- Prioridad: Urgente (rojo), Importante (amarillo)

**Oportunidades (de OpportunityFinder, simplificado):**
- Top 3 oportunidades detectadas de datos reales
- Cada una con: titulo + impacto estimado en soles
- Tipos: subir precio de producto con margen alto, combo frecuente, clientes inactivos

### 2. ACCIONES (~600 LOC)

Tareas generadas por la IA basadas en el estado actual del negocio.

**Layout:**
```
[Checklist diario (5 items fijos)]
[Tareas generadas]
  ├── URGENTE (rojo)
  │   ├── Reabastecer: Arroz 50kg (stock: 3, min: 10) — impacto: S/X
  │   └── Cobrar fiado vencido: Juan Perez — S/120, 15 dias vencido
  ├── IMPORTANTE (amarillo)
  │   ├── Procesar 2 pedidos pendientes
  │   └── Revisar precios de 3 productos con margen < 10%
  └── RECOMENDADO (gris)
      ├── Enviar WhatsApp a 12 clientes inactivos
      └── Crear combo arroz+aceite (73% compra conjunta)
```

**Componentes internos:**
- `DailyChecklist` — 5 tareas fijas (abrir caja, revisar stock, etc.), persist en localStorage
- `TaskList` — tareas agrupadas por prioridad, generadas dinamicamente de BusinessData
- Cada task: descripcion + impacto monetario + boton "Hecho"

**Generacion de tareas (de AIActionPlan + AIStrategicAdvisor, simplificado):**
- Urgente: stock bajo → "Reabastecer X", fiados vencidos → "Cobrar a Y"
- Importante: pedidos pendientes, productos con margen bajo
- Recomendado: clientes inactivos, combos sugeridos, ajustes de precio

### 3. ANALISIS (~700 LOC)

Herramientas para cuando el dueno tiene tiempo de profundizar.

**Layout con sub-tabs internos (3):**
```
[Sub-tabs: Margenes | Simulador | Calculadora]

--- Margenes ---
[Tabla: producto | costo | precio | margen% | recomendacion]
  Arroz 50kg    S/85    S/98    13.3%    ↑ Subir a S/102 (+4.1%)
  Aceite 1L     S/7.50  S/9.90  24.0%    ✓ Margen saludable
  ...

--- Simulador ---
[Input: Si subo el precio de ___ en ___% ]
[Output: Ventas estimadas: S/X → S/Y | Margen: Z% → W%]

--- Calculadora ---
[Calculadora de margen]
  Costo: [___]  Margen deseado: [___%]  → Precio sugerido: S/___
```

**Componentes internos:**
- `MarginTable` — tabla de productos con costo, precio, margen, recomendacion
- `WhatIfSimulator` — input de escenario + output de impacto (version compacta del actual)
- `MarginCalculator` — la calculadora de margen del actual BusinessCalculators

**Se eliminan:** calculadora break-even y ROI (el dueno no las usa), analisis de mercado, investigacion de competidores.

### 4. FIADOS (~400 LOC) — READ-ONLY

Vista de creditos dentro del Centro IA. **Solo lectura** — las acciones de mutacion (cobrar, ajustar) se hacen en el modulo FiadosModule existente.

**Layout:**
```
[KPIs: Total fiados | Vencidos | Clientes con fiado | Riesgo]
[Lista de clientes con fiado]
  ├── Juan Perez — S/120 — VENCIDO 15d
  ├── Maria Lopez — S/85 — Vence en 5d
  └── Pedro Garcia — S/200 — Al dia
[Filtros: Todos | Vencidos | Por vencer | Al dia]
[Boton: "Gestionar fiados →" (deep-link a FiadosModule)]
```

**Componentes internos:**
- `FiadoKPIs` — 4 metricas clave arriba
- `FiadoList` — lista read-only de clientes con saldo, estado, dias
- Deep-link al modulo FiadosModule para acciones de mutacion
- Status enum: usa `"ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO"` (uppercase, consistente con FiadosModule)

---

## Diseno visual

Siguiendo el estilo Holded que ya se usa en el admin:

- **Colores:** emerald-500 como acento principal, grises para texto, rojo solo para alertas criticas
- **Tipografia:** text-sm (13px) para contenido, text-xs (11px) para labels, font-semibold para valores
- **Cards:** bg-white, border border-gray-200, rounded-lg, padding 14-16px
- **Sin sombras**, sin emojis, sin gradientes
- **Iconos:** Lucide, tamano w-4 h-4, color gray-400 (no coloreados)
- **Spacing:** gap-3 entre cards, gap-4 entre secciones
- **Dark mode:** soportado via clases dark: existentes

### Mobile (< 768px)

- Sub-sidebar colapsa a 4 tabs horizontales compactos en la parte superior
- KPI grid: 2 columnas en vez de 4
- Oportunidades: stack vertical
- Tabla de margenes: scroll horizontal

---

## Migracion

### Fase 0: Preparacion de tipos
1. Crear `ai-center.types.ts` — extraer BusinessData, Product, Order, Sale, Customer, ExpenseSummary del actual AICommandCenter.tsx
2. Actualizar imports en todos los archivos existentes que usan `import type { BusinessData } from "./AICommandCenter"` para que apunten al nuevo types file
3. Usar nueva localStorage key `"ai-center-section-v2"` con ids: `"resumen" | "acciones" | "analisis" | "fiados"` (el viejo key `"ai-center-active-tab"` se ignora)
4. **Gate: `npx tsc --noEmit` debe pasar antes de continuar**

### Fase 1: Crear nuevos componentes
5. Crear `sections/` directory
6. Implementar ResumenSection.tsx
7. Implementar AccionesSection.tsx
8. Implementar AnalisisSection.tsx
9. Implementar FiadosSection.tsx (read-only)

### Fase 2: Reescribir AICommandCenter
10. Reescribir AICommandCenter.tsx: usa AdminSubSidebar existente + router a 4 secciones + data fetching centralizado
11. Mantener HITLApprovalsBanner sin cambios
12. **Gate: `npx tsc --noEmit` debe pasar antes de eliminar archivos**

### Fase 3: Limpieza
13. Eliminar los 16 archivos obsoletos uno por uno, verificando imports tras cada eliminacion
14. Actualizar imports en AsistenteIAModule.tsx y AICommandModule.tsx
15. Grep exhaustivo: `grep -r "from.*ai-center/" --include="*.tsx" --include="*.ts"` para detectar imports rotos

### Fase 4: Verificacion final
16. `npx tsc --noEmit` — cero errores
17. `npm run lint` — cero errores
18. `npm run build` — build exitoso
19. Test manual en navegador: las 4 secciones cargan correctamente
20. Test mobile: responsive funciona

---

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Imports rotos tras eliminar archivos | Grep exhaustivo antes de borrar + tsc gate entre fases |
| Perdida de logica de negocio util enterrada en componentes grandes | Extraer funciones helper antes de eliminar |
| Regresion en data fetching | No cambiar la estrategia de fetch, solo reorganizar consumidores |
| Mobile layout roto | Probar breakpoints durante implementacion |
| BusinessData type desaparece al reescribir | Fase 0: extraer tipos a ai-center.types.ts antes de todo |
| localStorage deserializa tab id viejo | Usar key nueva "ai-center-section-v2" con validacion |
| Doble sidebar inconsistente | Reutilizar AdminSubSidebar existente, no crear sidebar custom |
| FiadosSection duplica mutaciones de FiadosModule | FiadosSection es read-only, deep-link para acciones |

---

## Metricas de exito

- 10 tabs → 4 secciones
- 11,361 LOC → ~2,600 LOC (77% reduccion)
- 19 archivos → 8 archivos (58% reduccion)
- Tiempo de carga: menos componentes lazy = faster initial render
- Experiencia: dueno de bodega ve lo importante en 1 pantalla sin navegar 10 tabs
