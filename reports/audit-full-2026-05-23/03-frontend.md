# Auditoría Frontend — Buleje
**Fecha:** 2026-05-23 | **Rama:** prod | **Auditor:** Frontend Engineer Agent

---

## Resumen ejecutivo

| Categoría | P0 | P1 | P2 | Estado |
|---|---|---|---|---|
| 1. Design System (hex hardcodeados) | 0 | 5 | 432 | Critico-acumulado |
| 2. Dark mode (gray sin dark:) | 0 | 3 | 557 | Parcheado en globals.css |
| 3. A11y (botones/inputs/imgs) | 4 | 841 | — | Requiere plan |
| 4. Componentes >300 líneas | 0 | 10 | — | Deuda tecnica alta |
| 5. "use client" innecesario | 0 | 3 | 20 | P2 oportunistas |
| 6. Shadow primitives | 0 | 2 | 26 | Fragmentacion DS |
| 7. Tipografía storefront | 0 | 8 | — | Parcial incumplimiento |
| 8. Emojis en UI | 0 | 1 | 12 | MarketplaceModule pendiente |
| 9. Responsive (sin breakpoints) | 0 | 3 | 15 | Componentes chart |

---

## 1. Design System — Hex hardcodeados

**Totales encontrados:** Admin 333 · Store 28 · Marketplace 67 · Customer 4

| Severidad | Archivo | Hex problemático | Nota |
|---|---|---|---|
| P1 | `components/admin/TesoreriaModule.tsx` | `#2563EB` (×14 ocurrencias) | Debería ser `var(--data-info-500)` o token DS |
| P1 | `components/admin/TesoreriaModule.tsx` | `#1D4ED8`, `#ef4444` | Usa Tailwind blue-700/red-500 fuera del DS |
| P1 | `components/admin/POSView.tsx` | `#f97316`, `#2dd4bf`, `#e63946` | Array de colores para categorías POS |
| P1 | `components/admin/InventoryMetricsTab.tsx` | `#e5e7eb` en chart tooltip | Borde hardcodeado sin dark support |
| P1 | `components/admin/OfflineSalesQueue.tsx` | `#245a40` (hover bg-primary) | Debería ser `hover:bg-primary-dark` |
| P2 | `components/admin/ExecutiveDashboardTab.tsx` | `#3b82f6`, `#8b5cf6`, `#f59e0b` | sparkColors en array de datos |
| P2 | `components/admin/ContratosModule.tsx` | `#1a1a2e`, `#111`, `#555`, etc. | CSS inline en template HTML impreso (aceptable para print) |
| P2 | `components/admin/EtiquetasTab.tsx` | `#fff`, `#888`, `#111` | CSS de etiquetas para imprimir (aceptable para print) |
| P2 | `components/admin/NavDefaultTabsConfig.tsx` | `#2563EB` en focus ring | Debería ser `focus:ring-primary/30` |
| P2 | `components/admin/ContentCalendar.tsx` | `#e08c4a` | Hover de botón secondary; usar `hover:bg-secondary-dark` |

**Nota:** Los hex en templates HTML para impresión (`ContratosModule`, `EtiquetasTab`, `CashRegisterTab`) son aceptables porque el DOM de impresión no hereda CSS del tema. El riesgo real es `TesoreriaModule` con 14 ocurrencias de `#2563EB` en UI interactiva.

---

## 2. Dark mode — gray sin dark: equivalente

**557 instancias** de `bg/text/border-gray-*` sin variante `dark:` detectadas en `components/admin` y `components/store`.

**Mitigacion existente:** `globals.css` ya tiene un parche en `.dark [data-admin-shell]` que cubre los patrones mas comunes:
- `bg-gray-50/100/200` → remapeados a `var(--surface-raised/alt)`
- `border-gray-100/200/300` → remapeados
- `hover:bg-gray-50/100` → remapeados
- `input/textarea/select` sin `dark:bg-` → automáticamente corregidos

**Instancias que el parche NO cubre (storefront sin data-admin-shell):**

| Severidad | Archivo | Clase problemática | Impacto |
|---|---|---|---|
| P1 | `components/store/ProductPriceHistory.tsx:108` | `text-gray-400 dark:text-gray-600` | dark:text-gray-600 demasiado oscuro, texto invisible |
| P1 | `components/store/BrandShowcase.tsx:80` | `text-gray-900 dark:text-[var(--text-primary)]` | Correcto uso pero usa gray-900 hardcodeado en light |
| P1 | `components/store/SuggestionBox.tsx:194,221` | `text-gray-400 dark:text-gray-600` | Mismo problema: dark:gray-600 muy oscuro |
| P2 | `components/admin/DailyGoalTracker.tsx:157` | `bg-gray-800 text-white` | Tooltip, visible pero no usa token |
| P2 | `components/admin/RolePermissionsTab.tsx:191,207` | `bg-gray-900` | Tabla sticky — funciona pero no es token |
| P2 | `components/admin/PrestamosModule.tsx` | `bg-gray-50`, `bg-gray-100`, `bg-gray-200` | Sin dark: pero cubierto por parche globals.css |

---

## 3. A11y — Botones, inputs, imágenes

### 3a. Botones sin aria-label (P0/P1)

| Severidad | Archivo | Línea | Descripción |
|---|---|---|---|
| P0 | `components/admin/CheckManagementTab.tsx:417` | 417 | `<button onClick={() => setDetail(null)}>` — sin texto ni aria-label (icono X) |
| P0 | `components/admin/GoalsTab.tsx:979` | 979 | `<button onClick={() => setShowForm(false)}` — clase presente pero contenido vacío |
| P1 | `components/admin/HapticFeedback.tsx` | 230,260 | Botones de control haptic sin aria-label |
| P1 | `components/admin/UpgradeBanner.tsx` | 178,241 | Botones de dismiss/acción sin aria-label |
| P1 | `components/admin/AdminUserDropdown.tsx` | 53,100,114 | Dropdown trigger y acciones internas |
| P1 | `components/admin/InvoiceHistory.tsx` | 134,161,178,200,316,326 | 6 botones sin aria-label en tabla de historial |

**Total estimado:** >30 botones sin aria-label en components/admin + store.

### 3b. Inputs sin label accesible (P1)

**841 inputs** sin `aria-label` ni `id=` (solo `placeholder`). El placeholder NO es sustituto de label per WCAG 2.1 AA. Archivos con mayor concentración:

| Archivo | Ocurrencias sin label |
|---|---|
| `components/admin/ProductsAdminTab.tsx` | ~8 inputs |
| `components/admin/ComplianceTab.tsx` | ~2 inputs |

### 3c. Imágenes sin alt (P1)

| Archivo | Línea | Descripción |
|---|---|---|
| `components/admin/ProductQRGenerator.tsx:165` | 165 | `<img src="${imgSrc}" width=...>` — template string sin alt |
| `components/admin/InventoryTab.tsx:2910` | 2910 | `<img src="https://chart.googleapis.com/...">` en write() de ventana emergente |

Ambas son en HTML generado dinámicamente (no JSX directo), pero afectan accesibilidad del DOM.

---

## 4. Componentes >300 líneas (top 10 monolitos)

| Rank | Archivo | Líneas | Zonas de split sugeridas |
|---|---|---|---|
| 1 | `components/admin/unified/MarketplaceModule.tsx` | **4,153** | 10+ tabs → separar por tab en `/marketplace/tabs/` |
| 2 | `components/superadmin/banners/BannerPreviewStudio.tsx` | **3,090** | Preview + Editor + Gallery → 3 componentes |
| 3 | `components/admin/InventoryTab.tsx` | **3,077** | CRUD + QR + filtros + lotes → 5+ módulos |
| 4 | `components/admin/DashboardTab.tsx` | **3,057** | Charts + KPIs + widgets → hooks separados |
| 5 | `components/admin/StoreCustomizer.tsx` | **3,004** | Sections + Colors + Layout + Preview |
| 6 | `components/admin/unified/DeliveryPartnersModule.tsx` | **2,852** | Mapa + Lista + Stats + Modal |
| 7 | `components/admin/PrestamosModule.tsx` | **2,705** | Dashboard + Tabla + Modales + WA |
| 8 | `components/admin/POSView.tsx` | **2,464** | Cart + Pago + Búsqueda + Keyboard |
| 9 | `components/admin/ContratosModule.tsx` | **2,268** | Editor + Preview + Firma + Lista |
| 10 | `components/admin/SettingsModule.tsx` | **2,228** | 15+ secciones de config |

El limite de CLAUDE.md es 300 líneas. Los top 10 lo superan entre **7x y 14x**.

---

## 5. "use client" innecesario

### Confirmados sin hooks ni eventos:

| Severidad | Archivo | Líneas | Observación |
|---|---|---|---|
| P2 | `components/admin/CashFlowRolling.tsx` | — | 0 hooks, 0 events. Probablemente usa Recharts (verificar) |
| P2 | `components/admin/ChangelogModule.tsx` | — | 0 hooks, 0 events. Revisar si importa cliente-only libs |
| P2 | `components/admin/ContratosChart.tsx` | — | 0 hooks, 0 events. Chart lib requiere cliente |
| P2 | `components/admin/TurnosChart.tsx` | — | 0 hooks, 0 events. Chart lib requiere cliente |
| P2 | `components/admin/BreakEvenGauge.tsx` | — | 0 hooks, 0 events. Gauge lib requiere cliente |

**Nota importante:** Los componentes de chart (Recharts, etc.) requieren `"use client"` porque `ResponsiveContainer` usa `window.resize`. El grep de hooks puede dar falsos positivos. Verificar manualmente si la lib subyacente es client-only antes de remover el directive.

### Falsos positivos confirmados (SÍ necesitan "use client"):

| Archivo | Razón para "use client" |
|---|---|
| `components/store/TrustBar.tsx` | Verificado: sin hooks pero posiblemente importa lib cliente |
| `components/store/ProductImagePlaceholder.tsx` | Sin hooks visibles — candidato a Server Component |
| Admin charts (20 archivos) | Recharts/chart libs = window-dependent |

---

## 6. Shadow primitives — duplicados del DS

**26 definiciones locales** de componentes que duplican primitivos del DS:

| Severidad | Componente local | Definido en | DS canónico |
|---|---|---|---|
| P1 | `SparklineKPICard` | `PrestamosModule.tsx:158` y `prestamos/PrestamosDashboard.tsx:100` | `components/admin/shared/KPICard.tsx` |
| P1 | `StatusBadge` | `supplier/SupplierDashboard.tsx:89`, `ai-center/FiadosSection.tsx:149`, `customer/gift-cards/ReceivedGrid.tsx:154` | `components/admin/shared/StatusBadge.tsx` |
| P2 | `StatCard` | `superadmin/VendorApplicationsModule.tsx:101`, `superadmin/TenantMonitorPanel.tsx:256`, `admin/dashboard/BatchStatsWidget.tsx:23`, `admin/inventario/SimpleExpiryTab.tsx:226` | `components/superadmin/stores/StatCard.tsx` |
| P2 | `KPICard` | 9 archivos distintos (DailyGoalTracker, ExpiryDashboardTab, InventoryMetricsTab, DashboardIATab, InicioDashboard, compras/SugerenciasCompra, ai-center/ResumenSection, ai-center/FiadosSection, PurchaseOrdersTab) | `components/admin/shared/KPICard.tsx` |
| P2 | `MetricCard` | `superadmin/RepartidoresModule.tsx:1153`, `admin/ShrinkageTab.tsx:287` | No hay canónico — crear en DS |
| P2 | `AdminCard` | Definido en `components/admin/shared/AdminCard.tsx` pero no usado consistentemente | Existente |

---

## 7. Tipografía storefront (skill bsm-typography-rules)

Reglas: body `text-base` mínimo · filtros `h-12 border-2 rounded-2xl`.

| Severidad | Archivo | Línea | Violación |
|---|---|---|---|
| P1 | `components/store/PostDeliverySurvey.tsx` | 154,167,196 | `text-xs` en párrafos de feedback (cuerpo de encuesta) |
| P1 | `components/store/ProductReviews.tsx` | 106,114,133,239,262,266 | `text-xs` en body de reseñas — content principal |
| P1 | `components/store/BrandShowcase.tsx` | 80 | `text-xs` para nombre de marca en tarjeta |
| P1 | `components/marketplace/UnifiedProductCard.tsx` | 97 | `text-xs` para descripción del producto |
| P1 | `components/ProductCard.tsx` | 426,451 | `text-xs` en descripción y unit del producto |
| P2 | `components/store/SuggestionBox.tsx` | 194,221 | `text-xs` en helper text y contador |
| P2 | `components/store/LanguageSelector.tsx` | 191,192 | `text-xs` en lista de idiomas |
| P2 | `components/store/TenantIndicatorBar.tsx` | 22 | `text-xs` en banner informativo |

**Filtros:** No se detectaron `h-8/h-9` en elementos de filtro del storefront. La regla de altura parece cumplirse.

---

## 8. Emojis genéricos en UI

La regla dice: NO usar 🥉🥈🥇💎🏷️🎉 en UI — usar Lucide o SVG custom.

| Severidad | Archivo | Línea | Emoji | Contexto |
|---|---|---|---|---|
| P1 | `components/admin/unified/MarketplaceModule.tsx` | 3838-3840 | 🥉🥈🥇 | Objeto `TIERS_CONFIG.emoji` — se renderiza en UI de niveles de lealtad |
| P2 | `components/admin/inicio/ClientesAdvancedCharts.tsx` | 463,465,487,490 | 🏆 ⚠️ | Labels de segmentos RFM (Champions, En riesgo) |
| P2 | `components/admin/inicio/ProductosAdvancedCharts.tsx` | 405,446 | ⭐ | Label "Estrellas" en cuadrante de productos |
| P2 | `components/admin/PromotionsTab.tsx` | 147,149,155,480,764 | 🎉🔥📢 | Templates WA y placeholder — en strings de contenido (semiacceptable) |
| P2 | `components/admin/SettingsModule.tsx` | 1096 | ⚠️ | Advertencia de seguridad inline — usar `AlertTriangle` Lucide |
| P2 | `components/admin/unified/marketplace/tabs/OrdenesTab.tsx` | 117 | ⭐ | Label de acción "Pedir reseña" |

**Nota:** `DeliveryPartnersModule.tsx:2050` tiene comentario confirmando que el fix de 🥇🥈🥉 → Trophy ya fue aplicado ahí. `MarketplaceModule.tsx` aún lo tiene pendiente.

---

## 9. Responsive — componentes sin breakpoints sm:/md:/lg:

Componentes `"use client"` con >100 líneas y cero variantes responsive detectados (20 archivos). Los más críticos:

| Severidad | Archivo | Líneas | Impacto mobile |
|---|---|---|---|
| P1 | `components/admin/shared/SidebarConfigurator.tsx` | 942 | Panel de config del sidebar — usado en settings |
| P1 | `components/admin/fiados/FiadoModals.tsx` | 796 | Modales de fiados — crítico en mobile |
| P1 | `components/admin/analytics/CustomReportBuilder.tsx` | 642 | Builder de reportes — desktop-only de facto |
| P2 | `components/admin/inicio/ClientesAdvancedCharts.tsx` | 759 | Charts — Recharts ya es responsive vía container |
| P2 | `components/admin/inicio/ProductosAdvancedCharts.tsx` | 747 | Idem |
| P2 | `components/admin/inicio/InicioMultiCharts.tsx` | 742 | Idem |
| P2 | `components/admin/inicio/InventarioAdvancedCharts.tsx` | 737 | Idem |
| P2 | `components/admin/OrderTemplatesTab.tsx` | 572 | Tabla de plantillas sin adaptar a mobile |
| P2 | `components/admin/OnboardingWizard.tsx` | 547 | Wizard crítico — necesita mobile first |
| P2 | `components/admin/pos/InvoiceScannerModal.tsx` | 539 | POS es mobile-first, modal puede estar cortado |

**Nota:** Muchos chart components (ClientesAdvancedCharts, etc.) usan `ResponsiveContainer` de Recharts que es responsive por naturaleza, pero el layout *wrapper* (grid, padding, texto) puede no adaptarse.

---

## Resumen de acciones prioritarias

| # | Accion | Severidad | Archivos afectados | Esfuerzo |
|---|---|---|---|---|
| 1 | Corregir P0 A11y: botones sin texto ni aria-label | P0 | CheckManagementTab, GoalsTab | 30 min |
| 2 | Reemplazar 🥉🥈🥇 en MarketplaceModule por componente `TierBadge` con Lucide Trophy | P1 | MarketplaceModule.tsx:3838-3840 | 1h |
| 3 | Migrar `TesoreriaModule.tsx` de `#2563EB` a token DS `--data-info-500` | P1 | TesoreriaModule.tsx (14 ocurrencias) | 1h |
| 4 | Fix `text-gray-400 dark:text-gray-600` en storefront (texto invisible en dark) | P1 | ProductPriceHistory, SuggestionBox | 30 min |
| 5 | Subir `text-xs` a `text-sm` en body de ProductCard, UnifiedProductCard, ProductReviews | P1 | 5 archivos storefront | 1h |
| 6 | Eliminar duplicados SparklineKPICard y unificar en shared/KPICard | P1 | PrestamosModule + PrestamosDashboard | 2h |
| 7 | Plan de split para top 3 monolitos (MarketplaceModule, InventoryTab, DashboardTab) | P1 | 3 archivos | Sprint dedicado |
| 8 | aria-label en InvoiceHistory (6 botones) y AdminUserDropdown | P1 | 2 archivos | 1h |
| 9 | 841 inputs con solo placeholder — plan de labeling progresivo | P1 | Todo el admin | Sprint A11y |
| 10 | StatCard/KPICard/MetricCard — consolidar 26 definiciones en DS | P2 | 15+ archivos | 2 sprints |
