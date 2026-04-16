# Centro de Comandos IA Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure AI Command Center from 10 tabs/11,361 LOC to 4 sections/~2,600 LOC with sidebar navigation.

**Architecture:** Extract shared types to dedicated file. Create 4 focused section components. Rewrite AICommandCenter as thin router using AdminSubSidebar. Delete 16 obsolete files.

**Tech Stack:** React, TypeScript, Tailwind CSS, recharts, Lucide icons, AdminSubSidebar

**Spec:** `docs/superpowers/specs/2026-04-16-centro-comandos-ia-redesign.md`

---

### Task 1: Extract shared types to ai-center.types.ts

**Files:**
- Create: `components/admin/ai-center/ai-center.types.ts`
- Modify: `components/admin/ai-center/AICommandCenter.tsx`

- [ ] **Step 1:** Create `components/admin/ai-center/ai-center.types.ts` with all shared types extracted from AICommandCenter.tsx (Product, OrderItem, Order, SaleItem, Sale, Customer, ExpenseSummary, BusinessData)

- [ ] **Step 2:** Update AICommandCenter.tsx to import types from the new file instead of defining them inline

- [ ] **Step 3:** Update all existing ai-center components that import BusinessData from AICommandCenter to import from ai-center.types.ts instead

- [ ] **Step 4:** Run `npx tsc --noEmit` — must pass with zero errors

- [ ] **Step 5:** Commit: `refactor(ai-center): extract shared types to ai-center.types.ts`

---

### Task 2: Create ResumenSection

**Files:**
- Create: `components/admin/ai-center/sections/ResumenSection.tsx`

- [ ] **Step 1:** Create ResumenSection.tsx with:
  - GreetingBar: one line greeting + date + export button
  - KPIGrid: 4 cards (ventas hoy, transacciones, ticket promedio, salud negocio) with vs-yesterday comparison
  - AlertsList: prioritized alerts (stock bajo, fiados vencidos, pedidos pendientes)
  - WeeklyTrendChart: recharts BarChart, 7 days
  - OpportunitiesRow: 3 opportunity cards with estimated impact in soles
  - Health score calculation (weighted: revenue 25%, inventory 20%, margin 20%, fiado risk 15%, customer 10%, ops 10%)

- [ ] **Step 2:** Run `npx tsc --noEmit` — verify no type errors

- [ ] **Step 3:** Commit: `feat(ai-center): add ResumenSection — KPIs, alerts, trend, opportunities`

---

### Task 3: Create AccionesSection

**Files:**
- Create: `components/admin/ai-center/sections/AccionesSection.tsx`

- [ ] **Step 1:** Create AccionesSection.tsx with:
  - DailyChecklist: 5 fixed daily tasks, localStorage persisted
  - TaskList: auto-generated tasks grouped by priority (Urgente/Importante/Recomendado)
  - Task generation logic from BusinessData: low stock → restock, overdue fiados → collect, pending orders → process, low margin → review price, inactive customers → WhatsApp
  - Each task: description + monetary impact + "Hecho" button

- [ ] **Step 2:** Run `npx tsc --noEmit` — verify no type errors

- [ ] **Step 3:** Commit: `feat(ai-center): add AccionesSection — prioritized tasks + checklist`

---

### Task 4: Create AnalisisSection

**Files:**
- Create: `components/admin/ai-center/sections/AnalisisSection.tsx`

- [ ] **Step 1:** Create AnalisisSection.tsx with 3 internal sub-tabs:
  - MarginTable: product table with cost, price, margin%, recommendation
  - WhatIfSimulator: compact price change scenario simulator
  - MarginCalculator: cost + desired margin → suggested price

- [ ] **Step 2:** Run `npx tsc --noEmit` — verify no type errors

- [ ] **Step 3:** Commit: `feat(ai-center): add AnalisisSection — margins, simulator, calculator`

---

### Task 5: Create FiadosSection (read-only)

**Files:**
- Create: `components/admin/ai-center/sections/FiadosSection.tsx`

- [ ] **Step 1:** Create FiadosSection.tsx (read-only) with:
  - FiadoKPIs: 4 metrics (total, vencidos, clientes, riesgo)
  - FiadoList: read-only customer list with balance, status (ACTIVO/PAGADO/VENCIDO/CANCELADO), days
  - Filters: Todos/Vencidos/Por vencer/Al dia
  - Deep-link button to FiadosModule for mutations
  - Fetches from /api/fiados endpoint

- [ ] **Step 2:** Run `npx tsc --noEmit` — verify no type errors

- [ ] **Step 3:** Commit: `feat(ai-center): add FiadosSection — read-only credit dashboard`

---

### Task 6: Rewrite AICommandCenter with sidebar navigation

**Files:**
- Rewrite: `components/admin/ai-center/AICommandCenter.tsx`

- [ ] **Step 1:** Rewrite AICommandCenter.tsx:
  - Import AdminSubSidebar from layout
  - 4 sections: resumen, acciones, analisis, fiados
  - Centralized data fetching (4 endpoints, 5-min refresh) — preserve existing logic
  - localStorage key: "ai-center-section-v2"
  - Lazy load sections with Suspense
  - Keep HITLApprovalsBanner
  - Keep offline/error detection
  - Badge counts on sidebar items

- [ ] **Step 2:** Update AsistenteIAModule.tsx and AICommandModule.tsx imports if needed

- [ ] **Step 3:** Run `npx tsc --noEmit` — must pass

- [ ] **Step 4:** Commit: `refactor(ai-center): rewrite AICommandCenter — 4 sections + sidebar`

---

### Task 7: Delete obsolete files

**Files:**
- Delete: 16 files from components/admin/ai-center/

- [ ] **Step 1:** Grep for imports of each file to confirm no external consumers

- [ ] **Step 2:** Delete obsolete files:
  - AIDailyBriefing.tsx, AIActionPlan.tsx, AIBusinessHealthScore.tsx
  - AIPerformanceCoach.tsx, AIWhatIfSimulator.tsx, AIRiskRadar.tsx
  - AIOpportunityFinder.tsx, AINaturalQueryEngine.tsx, AIWeeklyReport.tsx
  - AIFiadoDashboard.tsx, AIDecisionLog.tsx, AIMarketResearch.tsx
  - AIStrategicAdvisor.tsx, AISmartPricing.tsx
  - BusinessCalculators.tsx, DailyChecklist.tsx

- [ ] **Step 3:** Run `npx tsc --noEmit` — zero errors

- [ ] **Step 4:** Run `npm run lint` — zero errors

- [ ] **Step 5:** Commit: `refactor(ai-center): delete 16 obsolete components — 8,761 LOC removed`

---

### Task 8: Build verification + browser test

- [ ] **Step 1:** Run `npm run build` — must succeed

- [ ] **Step 2:** Start dev server, navigate to Centro de Comandos IA, verify all 4 sections load

- [ ] **Step 3:** Final commit if any fixes needed
