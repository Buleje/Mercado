# SuperAdmin Module: High-Impact Improvement Plan

## Executive Summary

Transform the monolithic 1875-line app/superadmin/page.tsx into a modular multi-page architecture with deep per-tenant analytics, global platform health KPIs, and specialized management modules. The design follows the same patterns used by the admin module (350+ components, dynamic loading, sidebar navigation) but at the platform level.

---

## 1. Architecture: Modular Page Structure

### Current Problem
Everything lives in one use-client file: types, helper components, theme hooks, modals, all 4 tabs, and 900+ lines of JSX. This causes:
- Massive initial JS bundle (~30KB+ for a single page)
- All tab content loaded even when viewing only one tab
- Impossible to deep-link to specific views
- State management nightmare (20+ useState calls in one component)
### Solution: Next.js App Router Nested Layouts

Convert the flat page into a nested route group with a shared layout (sidebar + header) and individual route segments per module.

New directory structure:

    app/superadmin/
      layout.tsx                      -- EXISTS, enhance with sidebar + auth guard
      page.tsx                        -- REPLACE: redirect to /superadmin/dashboard
      login/page.tsx                  -- EXISTS, keep as-is
      dashboard/page.tsx              -- NEW: Platform health overview
      tenants/
        page.tsx                      -- NEW: Tenant list (extracted from current Tenants tab)
        [slug]/page.tsx               -- NEW: Per-tenant deep-dive dashboard
      analytics/page.tsx              -- NEW: Global analytics (extracted)
      activity/page.tsx               -- NEW: Activity log (extracted)
      settings/page.tsx               -- NEW: Platform settings (extracted)
      stores/page.tsx                 -- NEW: Cross-tenant store management

### Shared Layout Pattern

The enhanced app/superadmin/layout.tsx will:
1. Server-side auth check via cookies() + getPlatformSession()
2. Redirect to /superadmin/login if no valid session
3. Render persistent sidebar + header (same icon-sidebar pattern as current)
4. Use usePathname() in a client component to highlight active nav item

Shell components to create:
- components/superadmin/SuperAdminShell.tsx -- Client: sidebar + header + theme + toast
- components/superadmin/SuperAdminNav.tsx -- Client: navigation items with active state
- components/superadmin/PlatformKPIBar.tsx -- Client: always-visible top KPI strip
- components/superadmin/ImpersonationBanner.tsx -- Client: extracted from page.tsx

---

## 2. New Modules -- Detailed Breakdown

### Module A: Platform Dashboard (/superadmin/dashboard)

Purpose: At-a-glance platform health. The first thing a superadmin sees.

KPI Cards (top strip):
| KPI | Source | Sparkline |
|-----|--------|----------|
| Total Tenants | tenant.count() | 30-day signup trend |
| MRR | Sum of active plan prices | 6-month MRR trend |
| Orders Today | cross-tenant order.count | 7-day daily orders |
| Avg Ticket | SUM(order.total)/COUNT(order) this month | -- |
| At-Risk Tenants | cancelAtPeriodEnd OR trial expired | -- |
| Active Users Today | activityLog.count for logins | 7-day DAU |

Charts:
1. Revenue Trend (AreaChart, 12 months) -- MRR over time
2. Tenant Growth (ComposedChart: Bar = new signups, Line = cumulative) -- 12 months
3. Order Volume Heatmap per tenant per week
4. Plan Distribution (DonutChart)
5. Top 5 Tenants by Revenue (horizontal BarChart)

Quick Actions: Create Tenant, Recent activity feed, System alerts

Files: components/superadmin/DashboardModule.tsx, GET /api/superadmin/dashboard

---

### Module B: Tenant List (/superadmin/tenants)

Improvements over current:
1. URL-based filters via useSearchParams()
2. Sortable columns: name, plan, orders, created date
3. Bulk actions: Select multiple, bulk change plan, bulk suspend
4. Health score column: Computed 0-100 score
5. Export: CSV/Excel export

Health Score: orderFrequency(0.3) + planUtilization(0.2) + userActivity(0.2) + revenue(0.15) + tenure(0.15)

Sub-components: TenantTable, TenantCard, TenantFilters, TenantBulkActions, TenantHealthBadge

---

### Module C: Per-Tenant Deep Dive (/superadmin/tenants/[slug]) -- HIGHEST IMPACT

Purpose: Full-page dashboard replacing the basic 4-metric modal.

C1: Tenant Header -- Name, slug, plan, status, quick actions (Impersonate, Change plan, Suspend, Reset password), health score

C2: Revenue KPIs:
| KPI | Query |
|-----|-------|
| Revenue This Month | SUM(sale.total) WHERE tenantId AND createdAt >= monthStart |
| Orders This Month | COUNT(order) same filter |
| Avg Ticket | Revenue / Orders |
| Revenue Growth MoM | Compare to previous month |
| Top Product | Most sold product this month |
| Active Customers | Distinct customerPhone in orders |

C3: Charts:
1. Daily Revenue (AreaChart, 30 days) -- from DailySummary model
2. Orders by Status (DonutChart) -- pendiente/confirmado/en_camino/entregado/cancelado
3. Top 10 Products (horizontal BarChart) -- by units sold
4. Customer Acquisition (LineChart) -- new customers per week

C4: Users Table -- AdminUser records with role, active, last login
C5: Inventory Health -- Below stockMin, expiring within 30 days, stock value estimate
C6: Store Info -- Published status, rating, products, commission
C7: Usage and Limits -- Visual bars vs plan limits
C8: Activity Timeline -- Last 50 logs, filterable

Sub-components (8 files): TenantHeader, TenantRevenueKPIs, TenantCharts, TenantUsersTable, TenantInventoryHealth, TenantStoreInfo, TenantUsageBars, TenantActivityTimeline

API: GET /api/superadmin/tenants/[slug]/detail -- uses prismaReadonly, Promise.allSettled() for 10+ parallel queries, getOrSet() with 30s TTL

---

### Module D: Global Analytics (/superadmin/analytics)

New additions: Cohort Analysis, Revenue per Plan (stacked area), Conversion Funnel, Churn Rate trend, LTV Estimate, Enhanced Commission Analytics

Sub-components: RevenueCharts (enhanced), CohortTable, ConversionFunnel, ChurnMetrics, CommissionAnalytics
APIs: GET /api/superadmin/analytics/cohorts, GET /api/superadmin/analytics/funnel

---

### Module E: Store Management (/superadmin/stores)

List ALL Store records cross-tenant. Filter by published/category/zone. Aggregate stats.
API: GET /api/superadmin/stores

---

### Module F: Activity (/superadmin/activity)

Visual timeline, entity-click navigation, CSV export, date range picker, polling.

### Module G: Settings (/superadmin/settings)

Critical: Replace localStorage with DB-persisted PlatformConfig model.
API: GET/PUT /api/superadmin/settings

---

## 3. API Endpoints Summary

| Endpoint | Method | Cache TTL | Description |
|----------|--------|-----------|-------------|
| /api/superadmin/dashboard | GET | 60s | Aggregated platform health |
| /api/superadmin/tenants/[slug]/detail | GET | 30s | Per-tenant deep dive |
| /api/superadmin/stores | GET | 120s | Cross-tenant store list |
| /api/superadmin/analytics/cohorts | GET | 300s | Cohort retention |
| /api/superadmin/analytics/funnel | GET | 300s | Conversion funnel |
| /api/superadmin/settings | GET/PUT | none | Platform config |

All use: prismaReadonly, Promise.allSettled(), getOrSet(), applyRateLimit(), export const dynamic = force-dynamic
Auth: New shared requirePlatformAPI() from lib/superadmin-auth.ts

---

## 4. Database Schema Change

### New: PlatformConfig model (singleton, id = singleton)

Fields: priceFree(Float), pricePro(Float), priceBusiness(Float), priceEnterprise(Float), commissionDefault(Float), limitsJson(String?), allowNewStores(Boolean), maintenanceMode(Boolean), maintenanceMessage(String?), updatedAt(DateTime), updatedBy(String)

### No changes to existing models needed

Existing models cover all needs: DailySummary, Sale, Order, Product (stock/stockMin/expiresAt), AdminUser, Store/StoreProduct/StorePermission, ActivityLog, CommissionLedger, InventoryMovement, Turno

---

## 5. Shared Components: components/superadmin/_shared/

- SAStatCard.tsx -- KPI card with optional sparkline (reuses AnalyticsKPIBarV2 pattern)
- SAChart.tsx -- Recharts wrapper with dark mode theme
- SADataTable.tsx -- Sortable, filterable, paginated table
- SABadge.tsx -- Plan/status badge (extracted from PlanBadge)
- SAModal.tsx -- Reusable modal
- SAEmptyState.tsx -- Empty state with icon + message
- SASkeleton.tsx -- Loading skeletons
- SAToast.tsx -- Toast notifications
- SAHealthScore.tsx -- Health score circle indicator
- chart-theme.ts -- Colors: primary #0f766e, secondary #14b8a6

---

## 6. Auth Helper: lib/superadmin-auth.ts

Extract repeated requirePlatform() (duplicated in all 6 API routes):
- requirePlatformAPI(req) -- returns PlatformSession or 401 NextResponse
- requirePlatformPage() -- uses cookies(), redirects to login

---

## 7. Implementation Priority

### Phase 1: Foundation (2-3 days) -- HIGH IMPACT
1. Create lib/superadmin-auth.ts
2. Create components/superadmin/_shared/ (10 components)
3. Enhance app/superadmin/layout.tsx with server auth guard
4. Create SuperAdminShell.tsx and SuperAdminNav.tsx
5. Extract tabs to route pages (dashboard, tenants, analytics, activity, settings)
6. Update page.tsx to redirect to /superadmin/dashboard

### Phase 2: Per-Tenant Deep Dive (3-4 days) -- HIGHEST IMPACT
1. Create GET /api/superadmin/tenants/[slug]/detail
2. Create 8 tenant-detail sub-components
3. Create app/superadmin/tenants/[slug]/page.tsx
4. Update tenant list with Link navigation

### Phase 3: Enhanced Analytics (2-3 days)
1. Create optimized dashboard API
2. Create cohorts and funnel endpoints
3. Create CohortTable, ConversionFunnel, ChurnMetrics components

### Phase 4: Stores + Settings (2 days)
1. Add PlatformConfig Prisma model + migration
2. Create settings and stores APIs
3. Create StoresModule and SettingsModule

---

## 8. Performance Strategy

Caching: getOrSet() with sa: prefix, 30s-300s TTL, invalidateByPrefix(sa:) after mutations
Queries: prismaReadonly, Promise.allSettled(), DailySummary reuse, take: limits, groupBy for counts
Bundle: dynamic() for charts (ssr:false), route-based code splitting

---

## 9. Navigation

| Module | Path | Icon |
|--------|------|------|
| Dashboard | /superadmin/dashboard | LayoutDashboard |
| Tiendas | /superadmin/tenants | Building2 |
| Marketplace | /superadmin/stores | ShoppingBag |
| Analytics | /superadmin/analytics | BarChart3 |
| Actividad | /superadmin/activity | Activity |
| Config | /superadmin/settings | Settings |

---

## 10. Key Design Decisions

1. Route-based modules: Next.js segments for SSR, code splitting, deep linking
2. Server auth in layout: Pages guaranteed authenticated
3. Double-dynamic charts: page -> module(dynamic) -> chart(dynamic, ssr:false)
4. Read replica: prismaReadonly protects primary DB
5. Cache prefix scheme: All keys sa:*, prefix invalidation
6. Health score computed: Not stored in DB, cached via getOrSet
7. PlatformConfig singleton: Single row
8. Recharts theme preserved: Same teal/dark palette
9. Spanish UI preserved: All labels in Spanish
10. force-dynamic: Following project convention
