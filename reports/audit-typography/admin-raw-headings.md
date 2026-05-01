# Auditoría — `<h1/h2/h3>` raw en admin

**Fecha:** 2026-05-01
**Total:** 33 archivos en `components/admin/**` que usan `<h1/h2/h3 className="...">` en lugar de los primitivos del DS (`PageTitle`, `SectionTitle`, `CardTitle`).

> Regla violada: ADR-075 + `docs/typography-system.md` §2.
> Acción correctiva: reemplazar por el primitivo correspondiente.

## Mapping de reemplazo

| Si el archivo tiene… | Reemplazar por |
|---|---|
| `<h1 className="...">{titulo}</h1>` | `<PageTitle>{titulo}</PageTitle>` o `<AdminModuleHeader title={titulo}/>` |
| `<h2 className="text-xl font-bold ...">` | `<SectionTitle>` |
| `<h3 className="text-base font-semibold ...">` | `<CardTitle>` |

## Lista de archivos (priorizada por impacto)

### 🔴 Alta prioridad — módulos visibles del día a día (refactor en próxima sesión)

| Archivo | Motivo |
|---|---|
| `components/admin/inicio/InicioDashboard.tsx` | Dashboard principal del admin |
| `components/admin/DashboardTab.tsx` | Tab de dashboard |
| `components/admin/CashRegisterTab.tsx` | Caja, uso operativo |
| `components/admin/TurnosModule.tsx` | Turnos, uso operativo |
| `components/admin/marketplace/MarketplaceDashboard.tsx` | Hub marketplace |
| `components/admin/unified/MarketplaceModule.tsx` | Módulo marketplace |
| `components/admin/StoreAnalyticsModule.tsx` | Analytics |
| `components/admin/unified/ChatIAModule.tsx` | Chat IA, uso frecuente |

### 🟡 Media prioridad — vistas secundarias

| Archivo | Motivo |
|---|---|
| `components/admin/SystemHealthTab.tsx` | Salud sistema |
| `components/admin/SmartRemindersTab.tsx` | Recordatorios |
| `components/admin/KanbanBoardTab.tsx` | Kanban |
| `components/admin/PlanTierSelector.tsx` | Selector de plan |
| `components/admin/StoreReviewsAdminModule.tsx` | Reviews |
| `components/admin/AdminInvitationsTab.tsx` | Invitaciones |
| `components/admin/AchievementBadges.tsx` | Logros |
| `components/admin/unified/GiftCardsAdminModule.tsx` | Gift cards |
| `components/admin/inicio/_shared/ChartPresentationModal.tsx` | Modal presentación |

### 🟢 Baja prioridad — modales/cards/widgets

| Archivo | Motivo |
|---|---|
| `components/admin/BulkImportModal.tsx` | Modal de import |
| `components/admin/DailyReportWACard.tsx` | Card de reporte WA |
| `components/admin/DynamicPricingSuggestionsCard.tsx` | Card sugerencias |
| `components/admin/PriceRadarCard.tsx` | Card precios |
| `components/admin/QuickFlashPromoCard.tsx` | Card flash promo |
| `components/admin/chat-ia/ChatIAClean.tsx` | Subcomponente |
| `components/admin/delivery/DeliveryPartnersLiveMap.tsx` | Live map |
| `components/admin/delivery/ManualAssignModal.tsx` | Modal asignación |
| `components/admin/fiados/FiadoFormModal.tsx` | Modal fiado |
| `components/admin/inventario/ProductModifiersEditor.tsx` | Editor modifiers |
| `components/admin/pos/PuntoCompraView.tsx` | Vista POS |
| `components/admin/shared/ActionableEmptyState.tsx` | Empty state |
| `components/admin/shared/ChartManager.tsx` | Chart manager |
| `components/admin/shared/ImageValidationPanel.tsx` | Image validation |
| `components/admin/shared/KeyboardShortcutsHelp.tsx` | Atajos |
| `components/admin/shared/SidebarConfigurator.tsx` | Configurador |

## Cómo aplicar el fix (snippet)

```tsx
// Antes
<h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
  Sección
</h2>

// Después
import { SectionTitle } from "@buleje/design-system";

<SectionTitle className="mb-2">Sección</SectionTitle>
```

## Comando para detectar nuevos casos

```bash
grep -rln "<h1 className\|<h2 className\|<h3 className" components/admin --include="*.tsx"
```

Cuando este comando devuelva 0, el admin está al 100% en el DS.
