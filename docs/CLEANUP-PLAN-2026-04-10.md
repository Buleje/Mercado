# Cleanup Plan — Working Tree Recovery 2026-04-10

> **Context:** At session start on 2026-04-10 19:30, `feature/td018-float-to-decimal` had **208 dirty files** (76 modified + 132 untracked) accumulated from multiple prior sessions (luis-triple-tier-s, wave-2, and earlier drift). Guardrail §5 of `feedback_continuous_improvement_loop.md` requires escalation when >50 files are dirty. This document is the escalation artifact: a step-by-step recovery plan grouped into **15 atomic Conventional Commits**, with explicit zona-peligrosa warnings and rollback steps. **No commits are executed until Brandon approves this plan.**

**Branch state:**
- Current branch: `feature/td018-float-to-decimal`
- Commits ahead of `origin/master`: **67** (un-pushed)
- Dirty files: **208** (76 M + 132 ??)
- TSC: ✅ green (per session-state)
- Tests: ✅ 16/16 pass (per session-state)
- Last session: luis-triple-tier-s — completed F1 (whatsapp AI) + F2 (billing metering) + F3 (pgvector recommender) + ADRs 042-044

**Risk flags:**
- 🔴 Branch name (`td018-float-to-decimal`) does NOT match 90% of the dirty content (loyalty, recetas, 2FA, security, wave 2 modules). The branch has been reused as a catch-all.
- 🔴 Zones peligrosas touched without prior `/audit-first`: `proxy.ts`, `app/api/sales/*`, `app/api/orders/[id]/*`, `components/checkout/hooks/useCheckoutState.ts`, `lib/db/coupons.db.ts`, `lib/db/recetas.db.ts`.
- 🟡 Four `proposed-*.sql` migrations (pgvector, admin-totp, superadmin-totp, db-indexes-wave-1) are NOT yet applied to the DB. They must be flagged as "proposal only" in the commit message.
- 🟡 Two duplicate hook files suspected: `hooks/use-table-export.ts` and `hooks/useTableExport.ts` — must be reconciled before commit.
- 🟡 `.claude/` contains a full "swarm harness v2" (15 new agents + contracts/reviews/reports directories) that may not be intended for permanent commit — confirm with Brandon if this is production config or local experimentation.

---

## Execution strategy

1. **Pre-flight (before any commit):**
   - Audit duplicated files (`use-table-export` vs `useTableExport`) → keep one, delete the other.
   - Audit `.claude/` swarm harness v2 → confirm commit-worthiness.
   - Run `npm run lint && npx tsc --noEmit && npm run test` to confirm baseline.
   - Verify no secrets in `.env.example` diff and no `.env*` files in untracked.
   - Review zona peligrosa diffs manually (6 files listed below).

2. **Commits:** execute in order 1→15. Each commit is atomic, revertable, and scoped. Stop immediately if any commit breaks TSC/lint/tests.

3. **Post-cleanup:** `git push origin feature/td018-float-to-decimal` (pushes 67 prior + 15 new = 82 commits). Then open a recovery PR with a checklist referencing this plan.

4. **Rollback per commit:** if a commit is wrong, `git reset --soft HEAD~1` before the next step. Never force-push.

---

## Commit 1 — `chore(gitignore): exclude build and session artifacts`

**Rationale:** Five files are tool artifacts that should never be tracked.

**Actions:**
- Append to `.gitignore`:
  ```
  # Build and tool artifacts
  lint-output.txt
  lint-compact.txt
  .claude/.state/
  .claude/session-state.json
  .husky/.showcase-auto-pending
  ```
- Do NOT `git add` the artifact files themselves — they stay untracked and gitignored.

**Files staged:** `.gitignore` only.

**Verification:** `git status --short | grep -E "lint-|\.state|session-state|showcase-auto"` returns nothing.

---

## Commit 2 — `chore(claude): swarm harness v2 — agents, contracts, orchestrator, settings`

⚠️ **CONFIRM WITH BRANDON BEFORE EXECUTING** — this adds 15 new agent definitions and an entire swarm coordination harness. Validate it is production config, not local experimentation.

**Files staged:**
- M `.claude/agents/orchestrator-config.json`
- M `.claude/settings.json`
- M `.claude/skills/luis/SKILL.md`
- ?? `.claude/AUDIT-PRE-SWARM.md`
- ?? `.claude/AUDIT-SWARM-V2.md`
- ?? `.claude/BIDDING.md`
- ?? `.claude/CONTRACTS/` (directory)
- ?? `.claude/COORDINATION.md`
- ?? `.claude/HISTORY.md`
- ?? `.claude/LESSONS.md`
- ?? `.claude/LOCKS.md`
- ?? `.claude/REPORTS/` (directory)
- ?? `.claude/REVIEWS/` (directory)
- ?? `.claude/SWARM-README.md`
- ?? `.claude/dashboard.html`
- ?? `.claude/agents/ai-ml-engineer.md`
- ?? `.claude/agents/architect.md`
- ?? `.claude/agents/compressor.md`
- ?? `.claude/agents/frente-back.md`
- ?? `.claude/agents/frente-front.md`
- ?? `.claude/agents/frente-qa-integration.md`
- ?? `.claude/agents/frente-qa-unit.md`
- ?? `.claude/agents/frente-qa.md`
- ?? `.claude/agents/healer.md`
- ?? `.claude/agents/incident-commander.md`
- ?? `.claude/agents/marketplace-specialist.md`
- ?? `.claude/agents/optimizer.md`
- ?? `.claude/agents/orchestrator.md`
- ?? `.claude/agents/reviewer.md`
- ?? `.claude/agents/scribe.md`
- ?? `.claude/hooks/pre-commit-lock-check.sh`
- ?? `.claude/hooks/stop-alert-sound.mjs`

**Count:** 32 files (3 M + 29 ??).

**Verification:** `git diff --cached --stat | tail -1` shows ~32 files changed.

---

## Commit 3 — `feat(recommender): pgvector hybrid recommender (ADR-042)`

Tier S item #4 from ROADMAP. pgvector migration is **proposal only** — not applied to DB.

**Files staged:**
- ?? `docs/adr/042-pgvector-hybrid-recommender.md`
- ?? `prisma/migrations/proposed-pgvector.sql` ⚠️ **proposal only, not applied**
- ?? `lib/recommender/` (directory)
- ?? `app/api/recommender/` (directory)

**Verification:** `npm run test -- recommender` green.

**Post-commit action:** open GitHub issue "Apply pgvector migration manually on staging → run backfill script → validate query times <200ms" — do NOT auto-apply in this PR.

---

## Commit 4 — `feat(whatsapp): AI intent classifier (ADR-043)`

Tier S item #6 from ROADMAP.

**Files staged:**
- ?? `docs/adr/043-whatsapp-ai-intent-classifier.md`
- ?? `lib/whatsapp/ai-intent.ts`
- ?? `__tests__/whatsapp-ai-intent.test.ts`
- ?? `lib/ai/circuit-breaker.ts`
- ?? `lib/ai/cost-control.ts`

**Verification:** `npm run test -- whatsapp-ai-intent` green. Circuit breaker tests included.

---

## Commit 5 — `feat(billing): metering events endpoint (ADR-044)`

Tier S item #8 from ROADMAP.

**Files staged:**
- ?? `docs/adr/044-billing-metering-events.md`
- ?? `lib/billing/` (directory)
- ?? `app/api/billing/meter/` (directory)
- ?? `__tests__/billing-metering.test.ts`
- ?? `lib/cost-tracking.ts`

**Verification:** `npm run test -- billing-metering` green.

---

## Commit 6 — `feat(security): 2FA/TOTP + CSRF + audit + compliance + tenant flags`

⚠️ **ZONA PELIGROSA — security layer.** Invoke `security-pentester` agent on diff before executing this commit.

**Files staged:**
- ?? `app/api/admin/2fa/` (directory)
- ?? `lib/auth/totp.ts`
- ?? `lib/csrf.ts`
- ?? `lib/compliance/` (directory)
- ?? `lib/security/` (directory)
- ?? `lib/audit/superadmin-audit.ts`
- ?? `app/api/superadmin/audit/` (directory)
- ?? `app/api/superadmin/costs/` (directory)
- ?? `lib/flags/tenant-flags.ts`
- ?? `prisma/migrations/proposed-admin-totp.sql` ⚠️ **proposal only**
- ?? `prisma/migrations/proposed-superadmin-totp.sql` ⚠️ **proposal only**
- ?? `prisma/migrations/proposed-db-indexes-wave-1.sql` ⚠️ **proposal only**

**Verification:** `npm run lint && npx tsc --noEmit` green. Pentest report attached in PR description.

---

## Commit 7 — `feat(sprint2): loyalty auto-earn + recetas cost breakdown`

**Files staged (loyalty):**
- ?? `lib/loyalty/` (directory)
- ?? `app/api/loyalty/auto-earn/` (directory)
- ?? `app/api/loyalty/[phone]/history/` (directory)
- ?? `components/loyalty/` (directory)
- ?? `__tests__/loyalty-auto-earn.test.ts`
- ?? `app/(store)/mi-puntos/` (directory)
- M `app/(store)/puntos/page.tsx`

**Files staged (recetas):**
- ?? `lib/recipes/` (directory)
- ?? `app/api/recipes/` (directory)
- ?? `app/api/recetas/[id]/cost-breakdown/` (directory)
- ?? `app/api/recetas/[id]/produce/` (directory)
- M `lib/db/recetas.db.ts` ⚠️ zona peligrosa — audit diff first
- ?? `lib/types/recetas.ts`
- ?? `__tests__/recipe-cost.test.ts`
- M `components/admin/RecetasModule.tsx`

**Verification:** `npm run test -- loyalty-auto-earn recipe-cost` green.

---

## Commit 8 — `feat(sprint2): wave 2 domain libs — churn/delivery/digest/disputes/finance/growth/i18n/inventory/ocr/pricing/products/promos/reviews/subscriptions/supplier`

**Rationale:** All new server-side libraries from wave 2 that share a single architectural pattern (domain lib without API route yet). Grouped to avoid 15 separate single-file commits.

**Files staged:**
- ?? `lib/churn/customer-churn.ts`
- ?? `lib/delivery/` (directory)
- ?? `lib/digest/` (directory)
- ?? `lib/disputes/` (directory)
- ?? `lib/finance/bank-reconciliation.ts`
- ?? `lib/growth/` (directory)
- ?? `lib/i18n/` (directory)
- ?? `lib/inventory/` (directory)
- ?? `lib/ocr/` (directory)
- ?? `lib/pricing/yape-rounding.ts`
- ?? `lib/products/` (directory)
- ?? `lib/promos/` (directory)
- ?? `lib/reviews/` (directory)
- ?? `lib/subscriptions/` (directory)
- ?? `lib/supplier/` (directory)
- ?? `app/api/customers/at-risk/` (directory)

**Verification:** `npx tsc --noEmit` green. No test coverage yet — issue "add unit tests for wave 2 domain libs" opened post-commit.

---

## Commit 9 — `feat(store-ux): wishlist + favoritos + scarcity + flash sale + cart recovery + loading states`

**Files staged (new components):**
- ?? `components/CartRecoveryToast.tsx`
- ?? `components/QuickReorderButton.tsx`
- ?? `components/ScarcityBadge.tsx`
- ?? `components/WishlistButton.tsx`
- ?? `components/store/FlashSaleBanner.tsx`
- ?? `components/store/PromoBannerRotator.tsx`
- ?? `components/store/QuickReorderButton.tsx`

**Files staged (new routes & context):**
- ?? `app/(store)/favoritos/` (directory)
- ?? `contexts/wishlist-context.tsx`
- ?? `hooks/use-shopping-list.ts`

**Files staged (loading states for all store segments):**
- ?? `app/(store)/cuenta/loading.tsx`
- ?? `app/(store)/delivery/loading.tsx`
- ?? `app/(store)/mi-credito/loading.tsx`
- ?? `app/(store)/mis-pedidos/loading.tsx`
- ?? `app/(store)/tienda/loading.tsx`
- ?? `app/(store)/tracking/loading.tsx`
- ?? `app/(store)/zona/[ciudad]/loading.tsx`
- ?? `app/(store)/zona/loading.tsx`

**Files staged (accessibility layer):**
- ?? `components/accessibility/` (directory)
- ?? `lib/accessibility/` (directory)

**Files staged (data):**
- ?? `data/catalog-peru.ts`

**⚠️ Duplicate reconciliation required BEFORE commit:**
- `hooks/use-table-export.ts`
- `hooks/useTableExport.ts`
- `__tests__/use-table-export.test.ts`
- Decide which naming convention wins (kebab vs camel) and delete the other. Tests must point at the surviving file.

**Verification:** `npm run lint && npx tsc --noEmit && npm run test -- use-table-export` green.

---

## Commit 10 — `refactor(store-ui): modernize home, catalog, product detail, quick view, reviews`

**Files staged (all modified):**
- M `app/(store)/cuenta/page.tsx`
- M `app/(store)/page.tsx`
- M `app/(store)/tienda/page.tsx`
- M `components/AdvancedSearchPanel.tsx`
- M `components/CTABanner.tsx`
- M `components/CommandPalette.tsx`
- M `components/CompareBar.tsx`
- M `components/DailyDeal.tsx`
- M `components/DailySpecial.tsx`
- M `components/FloatingStoreCTA.tsx`
- M `components/Hero.tsx`
- M `components/HomeClientShell.tsx`
- M `components/NewsletterWhatsApp.tsx`
- M `components/NotificationPrompt.tsx`
- M `components/ProductCard.tsx`
- M `components/ProductCatalog.tsx`
- M `components/ProductDetailClient.tsx`
- M `components/QuickViewModal.tsx`
- M `components/ReviewModal.tsx`
- M `components/SocialProofToast.tsx`
- M `components/StoreProviders.tsx`
- M `components/store/SeasonalProducts.tsx`
- M `components/store/StoreFloatingWidgets.tsx`
- M `components/marketing/RegistrationForm.tsx`
- M `components/saas/SaasPricing.tsx`
- M `components/onboarding/OnboardingStep1Brand.tsx`
- M `data/zones.ts`

**Count:** 27 modified files.

**Verification:** Manual smoke test on `/`, `/tienda`, `/cuenta`, `/puntos`. Playwright snapshot via MCP if available.

---

## Commit 11 — `feat(admin-ux): empty states + forecasting + support inbox + tenant lifecycle + onboarding import`

**Files staged:**
- ?? `components/admin/EmptyState.tsx`
- ?? `components/admin/EmptyStateAction.tsx`
- ?? `components/admin/forecasting/` (directory)
- ?? `components/admin/support/` (directory)
- ?? `components/superadmin/SupportInbox.tsx`
- ?? `components/superadmin/TenantLifecycleKanban.tsx`
- M `components/superadmin/stores/PersonalizarTab.tsx`
- ?? `app/superadmin/marketplace/` (directory)
- ?? `app/api/admin/support/` (directory)
- ?? `app/api/onboarding/import-catalog/` (directory)

**Verification:** `npx tsc --noEmit` green. Visual smoke on `/superadmin/marketplace`.

---

## Commit 12 — `refactor(admin): tab router + modules + unified dashboard`

**Files staged (tab router core):**
- M `app/admin/_components/TabRouter.tsx`
- M `app/admin/_lib/tab-categories.ts`
- M `app/admin/_lib/tab-data.ts`
- M `app/admin/_lib/tabs.types.ts`
- M `app/admin/cms/pages/[id]/page.tsx`

**Files staged (modified admin components):**
- M `components/admin/AdminChatTab.tsx`
- M `components/admin/AdminMobileBottomBar.tsx`
- M `components/admin/CashRegisterTab.tsx`
- M `components/admin/CouponsTab.tsx`
- M `components/admin/OrdersTab/OrdersList.tsx`
- M `components/admin/ProductsAdminTab.tsx`
- M `components/admin/PromotionsTab.tsx`
- M `components/admin/ReturnsTab.tsx`
- M `components/admin/SettingsModule.tsx`
- M `components/admin/StoreCustomizer.tsx`
- M `components/admin/StorefrontEditor.tsx`
- M `components/admin/compras/PuntoDeCompraTab.tsx`
- M `components/admin/inventario/ConteoFisicoWizard.tsx`
- M `components/admin/pos/POSPaymentModal.tsx`
- M `components/admin/unified/AnalyticsBIModule.tsx`
- M `components/admin/unified/InventarioAlmacenesModule.tsx`

**Count:** 21 modified files.

**Verification:** Smoke on `/admin` — verify all tabs route and render.

---

## Commit 13 — `refactor(api): multi-tenant hardening — sales, orders, cash, bundles, backups, coupons`

⚠️ **ZONA PELIGROSA — checkout-adjacent.** Invoke `checkout-specialist` + `security-pentester` on diff before commit. Requires `/audit-first orders.db.ts coupons.db.ts` prior.

**Files staged:**
- M `app/api/admin-users/route.ts`
- M `app/api/backups/route.ts`
- M `app/api/bundles/route.ts`
- M `app/api/cash-registers/route.ts`
- M `app/api/cierre-diario/route.ts`
- M `app/api/coupons/route.ts`
- M `app/api/marketplace/coupons/route.ts`
- M `app/api/marketplace/coupons/validate/route.ts`
- M `app/api/orders/[id]/route.ts` 🔴
- M `app/api/sales/[id]/route.ts` 🔴
- M `app/api/sales/route.ts` 🔴
- ?? `lib/db/coupons.db.ts` 🔴
- ?? `__tests__/coupons-store-isolation.test.ts`
- M `__tests__/api-marketplace-slug.test.ts`
- M `__tests__/api-marketplace-stores.test.ts`
- M `__tests__/security-multitenant-marketplace.test.ts`
- M `components/checkout/hooks/useCheckoutState.ts` 🔴

**Count:** 17 files (6 ?? + 11 M).

**Verification:** `npm run test -- marketplace multitenant coupons` green. Manual checkout smoke test with cupón + fiado + yape.

---

## Commit 14 — `refactor(platform): proxy + next.config + middleware + plans + tenant-fetch + health + crons`

⚠️ **ZONA PELIGROSA — proxy.ts edge path.** Invoke `security-pentester` + `performance-engineer` on diff.

**Files staged:**
- M `proxy.ts` 🔴
- M `next.config.ts`
- M `lib/middleware-utils.ts`
- M `lib/plans.ts`
- M `lib/tenant-fetch.ts`
- M `.env.example` (validate no secrets)
- ?? `app/api/health/deep/` (directory)
- ?? `app/api/cron/midday-push/` (directory)
- ?? `app/api/abandoned-cart/mine/` (directory)

**Verification:** `npm run build` must pass. Load test `/api/health/deep` with 100 concurrent requests.

---

## Commit 15 — `chore(scripts): swarm dry-run + smoke test + dashboard gen + tenant snapshot + roadmap apply`

**Files staged:**
- ?? `scripts/apply-roadmap-sprint-2026-04-10.ts`
- ?? `scripts/generate-dashboard.sh`
- ?? `scripts/pre-merge-tag.sh`
- ?? `scripts/smoke-test.sh`
- ?? `scripts/swarm-dry-run.sh`
- ?? `scripts/tenant-snapshot-backup.ts`

**Verification:** `bash scripts/smoke-test.sh --dry-run` exits 0.

---

## Final push

After all 15 commits:

```bash
git log --oneline origin/master..HEAD | wc -l   # should be 82
git push origin feature/td018-float-to-decimal
```

Then open a recovery PR on GitHub:
- Title: `chore(recovery): cleanup 208-file drift + Tier S wave 2 (ADRs 042-044)`
- Body: link to this plan document + verification checklist + screenshots of green pipelines.

---

## Post-plan action items (NOT part of commits — tracked as GitHub issues)

1. **Rename branch** — `feature/td018-float-to-decimal` is misleading. Rename to `chore/wave-2-recovery` or close TD018 as done and cut a fresh branch for wave 2.
2. **Apply `proposed-*.sql` migrations** manually on Supabase staging with DBA review (pgvector extension, admin-totp, superadmin-totp, db-indexes-wave-1).
3. **Backfill embeddings script** — run once pgvector is live (item from session-state `pendingForNextSession`).
4. **Integrate AI intent in conversation engine** — hook `lib/whatsapp/ai-intent.ts` into the existing WhatsApp message handler.
5. **Instrument real metering callers** — wire `lib/billing/` into the sales, order, and AI cost hot paths.
6. **Admin dashboard metering card** — visualize metering data per tenant in the admin unified dashboard.
7. **Audit duplicate files** — resolve `use-table-export.ts` vs `useTableExport.ts` before commit 9.
8. **Confirm swarm harness v2** — Brandon must validate whether `.claude/CONTRACTS/`, `REPORTS/`, `REVIEWS/`, 15 new agent defs are production config or experimentation.

---

## Rollback plan

If any commit breaks CI or introduces a regression:

```bash
# Reset the bad commit (keeps files staged)
git reset --soft HEAD~1

# Or fully discard
git reset --hard HEAD~1

# Never force-push. Never rebase public history.
```

If the full plan needs to be aborted mid-execution:

```bash
# Restore working tree to the state before this plan
git reset --hard <commit-sha-before-plan-started>
```

The commit SHA to record before starting is: `$(git rev-parse HEAD)` — capture it in the PR description as the recovery anchor.
