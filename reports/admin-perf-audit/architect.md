# Auditoría arquitectural — Navegación entre tabs del panel admin

> **Fecha:** 2026-05-16
> **Autor:** solution-architect
> **Scope:** `app/admin/page.tsx` (shell único) + `app/admin/_components/TabRouter.tsx`
> **Aclaración:** `app/t/[slug]/admin/page.tsx` es solo un **gateway** que setea cookie + redirige a `/admin`. NO existen 2 shells, solo uno.

---

## 1. Resumen ejecutivo

La lentitud al cambiar de tab **no viene del routing de Next** (no hay hard navigation — `navigateTab` usa `history.replaceState`). Viene de **3 problemas arquitecturales acumulados**:

| # | Síntoma | Causa raíz |
|---|---|---|
| 1 | Tab → Tab parpadea, pierde scroll, re-monta árbol entero | `AnimatePresence mode="wait"` con `key={tab}` **desmonta** el módulo anterior y **monta** el nuevo cada vez — no hay keep-alive |
| 2 | Re-render del shell completo (sidebar, header, breadcrumbs) al cambiar tab | El estado `tab` vive en `AdminPage()` (root) y baja por props a `AdminNavigation` + `AdminMainContent` — React re-renderiza toda la rama |
| 3 | Primera vez que se abre un tab tarda 1-3s aunque ya esté prefetched | Cada módulo es `dynamic(() => import(...))` con `loading: TabSpinner`. El chunk está cacheado en JS, pero el módulo **dispara fetch + hidrata estado interno desde cero** |

**Veredicto:** la arquitectura actual está optimizada para **bundle size** (lazy chunks), no para **fluidez SPA**. Brandon necesita lo contrario para los ~10 tabs calientes.

---

## 2. Diagrama del flujo actual (cambio de tab)

```
Usuario click "ventas-caja" en AdminSidebar
  │
  ▼
navigateTab("ventas-caja")  ← useAdminTabs.navigateTab
  │
  ├─► setState(tab)                ── re-render <AdminPage> ROOT
  ├─► localStorage.setItem(...)
  ├─► history.replaceState(?tab=) ── NO triggers router, sí dispara useSearchParams en providers.tsx
  ├─► addRecent + trackTab
  │
  ▼
React re-renderiza TODO <AdminPage>:
  ├── AdminNavigation     (sidebar) ── recibe nuevas props, re-render (memo en niños?)
  ├── AdminTopHeader              ── recibe `tab`-derivados? No, solo navigate
  ├── AdminAlertsBanner           ── re-render trivial
  ├── AdminMainContent            ──  ◄── AQUÍ ESTÁ EL PROBLEMA
  │     │
  │     └── <AnimatePresence mode="wait">
  │           │
  │           ├─► EXIT módulo viejo (200ms animación)
  │           │     └─► UNMOUNT — pierde estado interno (scroll, forms, queries)
  │           │
  │           └─► MOUNT módulo nuevo
  │                 ├─► Si chunk no cargado → TabSpinner + import()  (300-1500ms)
  │                 ├─► Si cargado          → ejecuta efectos, fetch APIs, hidrata desde localStorage
  │                 └─► Entry animation     (280ms)
  │
  └── AdminOverlaysLayer + AdminGlobalModals
```

**Total percibido:** 200ms (exit) + 280ms (entry) + 0-1500ms (chunk + data) = **0.5-2s parpadeo**.

---

## 3. Trade-offs de la arquitectura actual

| Aspecto | Costo |
|---|---|
| `AnimatePresence mode="wait"` | Garantiza animación bonita pero **fuerza unmount** — irreconciliable con keep-alive |
| `dynamic()` por módulo (45 splits) | Bundle inicial pequeño (bueno) PERO sin warmup explícito de los hot 10 |
| Estado `tab` en root | Cualquier cambio re-renderiza todo el shell. No hay isolación |
| QueryString `?tab=...` | OK para deep-link, NO usa Next routing → no aprovecha `parallel routes` / `loading.tsx` |
| Hidratación por módulo | Cada uno carga sus datos cuando se monta — no hay store global de queries |

---

## 4. Cambios arquitecturales propuestos (orden riesgo ascendente)

### Propuesta A — **Keep-alive de tabs montados** (BAJO RIESGO, ALTO ROI)

Reemplazar `AnimatePresence mode="wait"` por un **multiplexor con `display: none`**: mantener montados los últimos N tabs visitados (N=5), ocultar los inactivos via CSS.

```
<TabMultiplexer activeTab={tab} maxKeepAlive={5}>
  {mountedTabs.map(tabId => (
    <div key={tabId} style={{ display: tabId === tab ? "block" : "none" }}>
      <TabRouter tab={tabId} … />
    </div>
  ))}
</TabMultiplexer>
```

| Trade-off | Detalle |
|---|---|
| **Esfuerzo** | 1 archivo nuevo + cambio en `AdminMainContent.tsx`. ~80 LOC |
| **Compatibilidad** | Pierde animación cross-tab (aceptable: la fluidez vale más) |
| **Memoria** | +30-80MB con 5 tabs montados (admin desktop, OK) |
| **Riesgo** | Algunos módulos asumen "mount = refetch" → bug si se quedan stale. Mitigar con `visibilitychange` por tab y un `useTabActive()` hook |
| **ROI** | Cambio tab → tab visitada = **instantáneo** (0ms) |

### Propuesta B — **Aislar `tab` state del shell** (BAJO RIESGO)

Mover `tab` + `navigateTab` a un **Context dedicado** (`AdminTabContext`). Sidebar lee del context; `AdminTopHeader` y demás no se suscriben → no re-renderizan.

| Trade-off | Detalle |
|---|---|
| **Esfuerzo** | 1 context nuevo + cambios en page.tsx + sidebar. ~120 LOC |
| **Compatibilidad** | 100% — los hooks existentes siguen funcionando |
| **Riesgo** | Bajo. Mismo patrón que `theme-context` |
| **ROI** | Re-render solo donde importa (sidebar activo + content) — ~40% menos trabajo de React por cambio |

### Propuesta C — **Warmup de los 10 tabs calientes en idle** (BAJO RIESGO)

Extender `useAdminPrefetch` para precargar también los **chunks JS** de los 10 tabs más usados (`useTabFrequency` ya los rankea) tras 3s de idle.

```ts
requestIdleCallback(() => {
  TOP_10_TABS.forEach(id => PREFETCH_LOADERS[id]?.());
});
```

| Trade-off | Detalle |
|---|---|
| **Esfuerzo** | 1 hook nuevo + extensión de PREFETCH_LOADERS map. ~50 LOC |
| **Compatibilidad** | 100% — solo agrega prefetch, no cambia render |
| **Costo de red** | ~500KB extra en idle (aceptable en admin desktop) |
| **ROI** | Primer click a tab nuevo = **sin TabSpinner** |

### Propuesta D — **Parallel Routes (`@modal/@panel`)** (MEDIO RIESGO)

Migrar `?tab=X` a `app/admin/@module/[tab]/page.tsx` con [Parallel Routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes). Sidebar es el shell estable; cada módulo es ruta hermana. Next maneja loading.tsx + streaming.

| Trade-off | Detalle |
|---|---|
| **Esfuerzo** | ALTO — mover 45 módulos a route segments, refactor de Sidebar a `Link`s |
| **Compatibilidad** | Rompe deep-links actuales (migración suave con redirects) |
| **Riesgo** | Alto: ADRs 019 + Next 16 `cacheComponents` necesitan validación. Streaming RSC con un panel que es 100% client-side (`use client`) no aporta mucho |
| **ROI** | Streaming nativo + loading.tsx por segmento, pero NO resuelve keep-alive (Next desmonta segments también) |

### Propuesta E — **State machine global de módulos (XState)** (ALTO RIESGO)

Cada módulo registra su estado (idle/loading/fresh/stale) en una máquina XState compartida. Cambio de tab = transición declarativa con persistencia transparente.

| Trade-off | Detalle |
|---|---|
| **Esfuerzo** | MUY ALTO. Refactor cross-cutting de 45 módulos |
| **Compatibilidad** | Requiere ADR + migración por fases |
| **Riesgo** | Alto — sobre-engineering para el problema actual |
| **ROI** | Único caso: si quieres también "pause/resume" con scroll restore exacto y deep-tab-state. **No es lo que pide Brandon ahora.** |

---

## 5. Recomendación final

**Implementar A + B + C en este orden** (1-2 sprints, ~250 LOC totales):

1. **C primero** (semana 1): warmup idle → primer click sin spinner. Cero riesgo. Mide impacto.
2. **B después** (semana 1): `AdminTabContext` → aísla re-renders del shell.
3. **A al final** (semana 2): TabMultiplexer con keep-alive de 5 → cambio tab→tab instantáneo + preserva scroll/forms.

Saltar D y E. Parallel Routes es un cambio masivo que **no resuelve el problema central** (keep-alive). XState es overkill.

**Métrica de éxito:** tiempo entre click-en-sidebar y first-paint del módulo activo:
- Hoy: 500ms-2s
- Post A+B+C: <50ms para tabs ya visitados, <300ms para primera visita

---

## 6. ADR sugerido

**ADR-113 — Tab multiplexer con keep-alive en panel admin**

- **Status:** Proposed
- **Context:** Panel admin con 45 módulos lazy-loaded; `AnimatePresence mode="wait"` desmonta el módulo anterior; usuarios pierden scroll, forms abiertos y datos cargados al alternar entre `ventas-caja` ↔ `inventario`.
- **Decision:** Reemplazar AnimatePresence por TabMultiplexer que mantiene los últimos 5 tabs visitados montados con `display: none`. Combinar con AdminTabContext para aislar re-renders y prefetch idle de los top-10 tabs.
- **Consequences:** +30-80MB memoria por sesión admin (aceptable desktop); pierde animación cross-tab; requiere `useTabActive()` para módulos que necesitan refetch al activarse; ganamos navegación instantánea SPA-grade.
- **Alternatives rejected:** Parallel Routes (no resuelve keep-alive), XState global (sobre-engineering).

---

## 7. Verificación post-cambio

```bash
cd buleje
npm run lint && npm run build && npm run test
# Smoke admin:
node scripts/visual-verify-admin-focused.mjs
```

Métricas a capturar con Performance API en dev:
- `performance.mark` antes/después de `navigateTab`
- React DevTools Profiler — renders del shell por cambio tab
- Chrome heap snapshot tras visitar 10 tabs (validar límite memoria)
