# Marketplace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign marketplace with uniform product cards, smart search, auth modal, and Alegra-style colors across all public pages.

**Architecture:** 6 parallel workstreams touching marketplace, landing, negocios pages. UnifiedProductCard replaces all card variants. AuthModal replaces page navigation. SearchBar upgraded to 1-char trigger with mixed product+store results.

**Tech Stack:** Next.js 16, React, Tailwind CSS, framer-motion (m alias), Zod, NextAuth patterns.

---

### Task 1: UnifiedProductCard Component

**Files:**
- Create: `components/marketplace/UnifiedProductCard.tsx`
- Modify: `components/marketplace/CatalogSections.tsx`

- [ ] **Step 1: Create UnifiedProductCard**

Uniform card for ALL product displays (flash sales, top sellers, regular catalog). Fixed aspect-square image, consistent padding, price, store name, badges.

```tsx
// Props: { product, variant?: "default"|"flash"|"top", rank?: number }
// Variants only change badge overlay (countdown for flash, rank# for top)
// ALL cards: same w-full grid item, rounded-2xl, shadow-sm, hover:shadow-lg
```

- [ ] **Step 2: Refactor CatalogSections to use UnifiedProductCard**

Replace inline card markup in featured, flashDeals, topSellers, liquidations sections.

- [ ] **Step 3: Verify tsc + lint**
- [ ] **Step 4: Commit**

---

### Task 2: Catalog Mode Layout (Categories + Sections)

**Files:**
- Modify: `components/marketplace/MarketplaceContent.tsx`
- Modify: `components/marketplace/CatalogSections.tsx`

- [ ] **Step 1: Move categories bar ABOVE flash sales in catalog mode**

Categories as horizontal scrollable pills at top of catalog view.

- [ ] **Step 2: Ensure catalog shows: Categories → Flash Sales → Top Ventas → Products**

- [ ] **Step 3: Store mode: conditionally hide Flash Sales and Top Ventas sections**

When `viewMode === "tiendas"`, render ONLY StoreCard grid. No flash, no top sellers.

- [ ] **Step 4: Verify tsc + visual test**
- [ ] **Step 5: Commit**

---

### Task 3: Smart Search Bar (1-char trigger, mixed results)

**Files:**
- Modify: `components/marketplace/SearchAutocomplete.tsx`

- [ ] **Step 1: Change trigger from 2 chars to 1 char**
- [ ] **Step 2: Show mixed results: "Productos" section + "Tiendas" section in dropdown**
- [ ] **Step 3: Add slide-down animation with m.div (framer-motion m alias)**
- [ ] **Step 4: Add search result highlighting (bold matching chars)**
- [ ] **Step 5: Verify tsc + lint**
- [ ] **Step 6: Commit**

---

### Task 4: Auth Modal (Login/Register)

**Files:**
- Create: `components/auth/AuthModal.tsx`
- Modify: `components/marketplace/MarketplaceNavbar.tsx`

- [ ] **Step 1: Create AuthModal component**

Modal with white bg, rounded corners, shadow. Contains:
- Tab toggle: "Iniciar sesion" / "Registrarse"
- Phone input (OTP flow placeholder)
- Google button
- Facebook button
- Divider "o continua con"

- [ ] **Step 2: Replace navbar Link to /registro with button that opens AuthModal**
- [ ] **Step 3: Add close on Escape + backdrop click**
- [ ] **Step 4: Verify tsc + lint**
- [ ] **Step 5: Commit**

---

### Task 5: Alegra Color Consistency

**Files:**
- Modify: `app/(store)/page.tsx` (landing)
- Modify: `app/(store)/negocios/page.tsx`
- Modify: `components/marketplace/MarketplaceContent.tsx`

- [ ] **Step 1: Audit color usage across 3 pages — replace hardcoded hex with CSS vars**
- [ ] **Step 2: Add gradient CTA buttons (primary→accent) consistently**
- [ ] **Step 3: Ensure hover states use primary/secondary palette**
- [ ] **Step 4: Commit**

---

### Task 6: Integration + Polish

- [ ] **Step 1: Test catalog mode flow (categories → flash → top → products)**
- [ ] **Step 2: Test store mode flow (only stores, no flash/top)**
- [ ] **Step 3: Test search (1 char, mixed results, animations)**
- [ ] **Step 4: Test auth modal (open, switch tabs, close)**
- [ ] **Step 5: Dark mode verification across all changes**
- [ ] **Step 6: Mobile responsive verification**
- [ ] **Step 7: Final commit**
