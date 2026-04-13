# Ola 1: Compra Recurrente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 5 interconnected features (order history + reorder, favorites, price compare, shopping lists, coupons/referrals) so marketplace customers keep coming back.

**Architecture:** Extend existing Prisma schema with 2 new tables (Favorite, CouponRedemption) and migrate 2 existing ones (ShoppingList, Coupon). New `lib/db/*.db.ts` files follow the `export const XxxDB = {}` pattern with tenantId-first params. Reuse existing `/api/me/` routes (order-history, reorder, favorites) — extend them instead of creating duplicates. New marketplace routes only where no equivalent exists. Auth via `requireCustomer()` — always use `customer.tenantId` from session (not `getTenantIdFromRequest`). New pages under `/app/marketplace/mi-cuenta/`. Components in `/components/marketplace/`.

> **IMPORTANT EXISTING ROUTES:** The following routes already exist and must be EXTENDED, not duplicated:
> - `GET /api/me/order-history` — customer order history (paginated)
> - `POST /api/me/reorder/[orderId]` — reorder with stock/price validation
> - `GET /api/me/favorites?ids=1,2,3` — enriches product data for favorites (localStorage-based)
> - `GET /api/me/referral-status` — referral info
> The plan uses these existing routes and only creates new routes where no equivalent exists.

**Tech Stack:** Next.js 16 App Router, Prisma, Zod (safeParse), TypeScript, Tailwind CSS, Vitest, existing cart-context reducer pattern.

**Spec:** `docs/superpowers/specs/2026-04-13-ola1-compra-recurrente-design.md`

---

## File Structure

### New Files
```
prisma/migrations/XXXXXXXX_ola1_compra_recurrente/migration.sql

lib/db/favorites.db.ts
lib/db/shopping-lists.db.ts
lib/validations/favorite.schema.ts
lib/validations/shopping-list.schema.ts
lib/validations/coupon-redeem.schema.ts

app/marketplace/mi-cuenta/layout.tsx
app/marketplace/mi-cuenta/page.tsx
app/marketplace/mi-cuenta/pedidos/page.tsx
app/marketplace/mi-cuenta/favoritos/page.tsx
app/marketplace/mi-cuenta/listas/page.tsx
app/marketplace/mi-cuenta/listas/[id]/page.tsx
app/marketplace/mi-cuenta/cupones/page.tsx
app/marketplace/mi-cuenta/referidos/page.tsx

app/api/marketplace/favorites/route.ts          — NEW: DB-backed favorites (replaces localStorage)
app/api/marketplace/favorites/[id]/route.ts      — NEW: delete favorite
app/api/marketplace/favorites/check/route.ts     — NEW: batch check for product cards
app/api/marketplace/products/[id]/prices/route.ts
app/api/marketplace/shopping-lists/route.ts
app/api/marketplace/shopping-lists/[id]/route.ts
app/api/marketplace/shopping-lists/[id]/items/route.ts
app/api/marketplace/shopping-lists/[id]/items/[itemId]/route.ts
app/api/marketplace/shopping-lists/[id]/add-to-cart/route.ts
app/api/marketplace/my-coupons/route.ts
app/api/marketplace/my-referral/route.ts
app/api/marketplace/referral/register/route.ts
app/api/cron/birthday-coupons/route.ts

components/marketplace/FavoriteButton.tsx
components/marketplace/FavoritesPage.tsx
components/marketplace/FavoriteCard.tsx
components/marketplace/PriceBadge.tsx
components/marketplace/PriceCompareTable.tsx
components/marketplace/OrderHistory.tsx
components/marketplace/OrderCard.tsx
components/marketplace/ReorderModal.tsx
components/marketplace/ShoppingListsPage.tsx
components/marketplace/ShoppingListDetail.tsx
components/marketplace/AddToListButton.tsx
components/marketplace/ShoppingListModal.tsx
components/marketplace/MyCouponsPage.tsx
components/marketplace/CouponCard.tsx
components/marketplace/ReferralPage.tsx
components/marketplace/CouponInput.tsx
components/marketplace/ShareReferralButton.tsx
components/marketplace/UserMenuDropdown.tsx

__tests__/lib/db/favorites.db.test.ts
__tests__/lib/db/shopping-lists.db.test.ts
__tests__/api/marketplace/my-orders.test.ts
__tests__/api/marketplace/favorites.test.ts
__tests__/api/marketplace/shopping-lists.test.ts
__tests__/api/marketplace/my-coupons.test.ts
```

### Modified Files
```
prisma/schema.prisma                              — Add Favorite, CouponRedemption, extend ShoppingList/Item/Coupon + relation arrays on Tenant/Product/Store/Order/Customer
components/marketplace/UnifiedProductCard.tsx       — Add FavoriteButton + PriceBadge + AddToListButton
components/marketplace/MarketplaceNavbar.tsx        — Add UserMenuDropdown when logged in
components/marketplace/MarketplaceCheckoutModal.tsx — Add CouponInput
app/api/coupons/validate/route.ts                  — Add 1-use-per-customer check (import CouponsDB from @/lib/jsondb)
app/api/me/order-history/route.ts                  — Already exists, no changes needed
app/api/me/reorder/[orderId]/route.ts              — Already exists, no changes needed
lib/db/coupons.db.ts                               — Add redeemCoupon(), getMyCoupons()
lib/jsondb.ts (CouponsDB)                          — Add hasCustomerUsed() method
contexts/cart-context.tsx                           — Add ADD_MULTIPLE action support (if not exists)
```

---

## Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration SQL (via `npx prisma migrate dev`)

- [ ] **Step 1: Add Favorite model to schema.prisma**

After the `ShoppingListItem` model (line ~924), add:

```prisma
// ─── Favorites (Marketplace) ────────────────────────────
model Favorite {
  id            String   @id @default(cuid())
  customerPhone String
  productId     Int
  storeId       String
  tenantId      String
  createdAt     DateTime @default(now())

  customer Customer @relation(fields: [customerPhone], references: [phone], onDelete: Cascade)
  product  Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  store    Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  tenant   Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([customerPhone, productId, tenantId])
  @@index([customerPhone, tenantId])
  @@index([tenantId])
}
```

- [ ] **Step 2: Add CouponRedemption model**

After the `Coupon` model (line ~866), add:

```prisma
model CouponRedemption {
  id              String   @id @default(cuid())
  couponId        String
  customerPhone   String
  orderId         String?
  discountApplied Decimal  @db.Decimal(12, 2)
  tenantId        String
  redeemedAt      DateTime @default(now())

  coupon   Coupon   @relation(fields: [couponId], references: [id])
  customer Customer @relation(fields: [customerPhone], references: [phone])
  order    Order?   @relation(fields: [orderId], references: [id])
  tenant   Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([couponId, customerPhone, tenantId])
  @@index([customerPhone])
  @@index([couponId])
  @@index([tenantId])
}
```

- [ ] **Step 3: Extend Coupon model with new fields**

Add to existing `Coupon` model:

```prisma
  type          String    @default("promotional") // welcome | referral | promotional | birthday
  maxDiscount   Decimal?  @db.Decimal(12, 2)
  createdBy     String?
  redemptions   CouponRedemption[]
```

- [ ] **Step 4: Extend ShoppingList model**

Add to existing `ShoppingList` model:

```prisma
  isDefault Boolean @default(false)
  customer  Customer @relation(fields: [customerPhone], references: [phone], onDelete: Cascade)
```

- [ ] **Step 5: Extend ShoppingListItem model**

Add to existing `ShoppingListItem` model:

```prisma
  storeId   String?
  notes     String?
  sortOrder Int     @default(0)

  product Product @relation(fields: [productId], references: [id])
  store   Store?  @relation(fields: [storeId], references: [id])
```

- [ ] **Step 6: Add relation arrays to existing models**

In `Tenant` model, add:
```prisma
  favorites         Favorite[]
  couponRedemptions CouponRedemption[]
```

In `Customer` model, add:
```prisma
  favorites         Favorite[]
  shoppingLists     ShoppingList[]
  couponRedemptions CouponRedemption[]
```

In `Product` model, add:
```prisma
  favorites         Favorite[]
  shoppingListItems ShoppingListItem[]
```

In `Store` model, add:
```prisma
  favorites         Favorite[]
  shoppingListItems ShoppingListItem[]
```

In `Order` model, add:
```prisma
  couponRedemptions CouponRedemption[]
```

In `Coupon` model, add (if not already):
```prisma
  redemptions CouponRedemption[]
```

> **CRITICAL:** Prisma requires BOTH sides of every relation. Missing any back-relation array will fail `prisma migrate dev`. Double-check every `@relation` in new models has its corresponding array in the target model.

- [ ] **Step 7: Run migration**

```bash
cd bodega-san-martin
npx prisma migrate dev --name ola1_compra_recurrente
```

Expected: Migration creates Favorite table, CouponRedemption table, adds columns to ShoppingList/ShoppingListItem/Coupon.

- [ ] **Step 8: Verify generated client**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 9: Commit**

```bash
git add prisma/
git commit -m "feat(db): add Favorite, CouponRedemption models + extend ShoppingList, Coupon for Ola 1"
```

---

## Task 2: Validation Schemas

**Files:**
- Create: `lib/validations/favorite.schema.ts`
- Create: `lib/validations/shopping-list.schema.ts`
- Create: `lib/validations/coupon-redeem.schema.ts`

- [ ] **Step 1: Create favorite schema**

```typescript
// lib/validations/favorite.schema.ts
import { z } from "zod";

export const AddFavoriteSchema = z.object({
  productId: z.number().int().positive(),
  storeId: z.string().min(1),
});

export const CheckFavoritesSchema = z.object({
  productIds: z.string().regex(/^\d+(,\d+)*$/, "Comma-separated integers"),
});

export type AddFavoriteInput = z.infer<typeof AddFavoriteSchema>;
```

- [ ] **Step 2: Create shopping list schema**

```typescript
// lib/validations/shopping-list.schema.ts
import { z } from "zod";

export const CreateShoppingListSchema = z.object({
  name: z.string().min(1).max(50).trim(),
});

export const UpdateShoppingListSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  isDefault: z.boolean().optional(),
});

export const AddShoppingListItemSchema = z.object({
  productId: z.number().int().positive(),
  storeId: z.string().min(1).nullish(),
  quantity: z.number().int().min(1).max(99).default(1),
  notes: z.string().max(200).trim().nullish(),
});

export const UpdateShoppingListItemSchema = z.object({
  quantity: z.number().int().min(1).max(99).optional(),
  notes: z.string().max(200).trim().nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateShoppingListInput = z.infer<typeof CreateShoppingListSchema>;
export type AddShoppingListItemInput = z.infer<typeof AddShoppingListItemSchema>;
```

- [ ] **Step 3: Create coupon redeem schema**

```typescript
// lib/validations/coupon-redeem.schema.ts
import { z } from "zod";

export const ValidateCouponSchema = z.object({
  code: z.string().min(3).max(30).trim().toUpperCase(),
  cartTotal: z.number().positive(),
});

export type ValidateCouponInput = z.infer<typeof ValidateCouponSchema>;
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/validations/
git commit -m "feat(validation): add Zod schemas for favorites, shopping lists, coupons"
```

---

## Task 3: DB Layer — Favorites

**Files:**
- Create: `lib/db/favorites.db.ts`
- Create: `__tests__/lib/db/favorites.db.test.ts`

- [ ] **Step 1: Write failing test for FavoritesDB.toggle**

```typescript
// __tests__/lib/db/favorites.db.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock prisma before import
vi.mock("@/lib/prisma", () => ({
  prisma: {
    favorite: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { FavoritesDB } from "@/lib/db/favorites.db";
import { prisma } from "@/lib/prisma";

describe("FavoritesDB", () => {
  const tenantId = "tenant-1";
  const customerPhone = "51999999999";

  it("toggle adds favorite when not exists", async () => {
    vi.mocked(prisma.favorite.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.favorite.count).mockResolvedValue(0);
    vi.mocked(prisma.favorite.upsert).mockResolvedValue({
      id: "fav-1",
      customerPhone,
      productId: 1,
      storeId: "store-1",
      tenantId,
      createdAt: new Date(),
    });

    const result = await FavoritesDB.toggle(tenantId, customerPhone, 1, "store-1");
    expect(result.added).toBe(true);
  });

  it("toggle removes favorite when exists", async () => {
    vi.mocked(prisma.favorite.findFirst).mockResolvedValue({
      id: "fav-1",
      customerPhone,
      productId: 1,
      storeId: "store-1",
      tenantId,
      createdAt: new Date(),
    });
    vi.mocked(prisma.favorite.delete).mockResolvedValue({} as never);

    const result = await FavoritesDB.toggle(tenantId, customerPhone, 1, "store-1");
    expect(result.added).toBe(false);
  });

  it("toggle rejects when at max (100)", async () => {
    vi.mocked(prisma.favorite.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.favorite.count).mockResolvedValue(100);

    const result = await FavoritesDB.toggle(tenantId, customerPhone, 1, "store-1");
    expect(result.error).toBe("Máximo 100 favoritos alcanzado");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run __tests__/lib/db/favorites.db.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement FavoritesDB**

```typescript
// lib/db/favorites.db.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { invalidateByPrefix } from "@/lib/cache";

const MAX_FAVORITES = 100;

export const FavoritesDB = {
  async toggle(
    tenantId: string,
    customerPhone: string,
    productId: number,
    storeId: string,
  ): Promise<{ added: boolean; id?: string; error?: string }> {
    const existing = await prisma.favorite.findFirst({
      where: { customerPhone, productId, tenantId },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      invalidateByPrefix(`favorites:${customerPhone}`).catch(() => {});
      logActivity("favorite_removed", "Favorite", `Product ${productId}`, existing.id, customerPhone, undefined, tenantId).catch(() => {});
      return { added: false };
    }

    const count = await prisma.favorite.count({ where: { customerPhone, tenantId } });
    if (count >= MAX_FAVORITES) {
      return { added: false, error: "Máximo 100 favoritos alcanzado" };
    }

    const fav = await prisma.favorite.upsert({
      where: { customerPhone_productId_tenantId: { customerPhone, productId, tenantId } },
      create: { customerPhone, productId, storeId, tenantId },
      update: { storeId },
    });

    invalidateByPrefix(`favorites:${customerPhone}`).catch(() => {});
    logActivity("favorite_added", "Favorite", `Product ${productId}`, fav.id, customerPhone, undefined, tenantId).catch(() => {});
    return { added: true, id: fav.id };
  },

  async list(tenantId: string, customerPhone: string) {
    return prisma.favorite.findMany({
      where: { customerPhone, tenantId },
      include: {
        product: { select: { id: true, name: true, price: true, image: true, stock: true, unit: true, category: true, tenantId: true } },
        store: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async checkBatch(tenantId: string, customerPhone: string, productIds: number[]): Promise<number[]> {
    const favs = await prisma.favorite.findMany({
      where: { customerPhone, tenantId, productId: { in: productIds } },
      select: { productId: true },
    });
    return favs.map((f) => f.productId);
  },

  async remove(tenantId: string, id: string, customerPhone: string) {
    const fav = await prisma.favorite.findFirst({ where: { id, customerPhone, tenantId } });
    if (!fav) return null;
    await prisma.favorite.delete({ where: { id } });
    return fav;
  },
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run __tests__/lib/db/favorites.db.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/favorites.db.ts __tests__/lib/db/favorites.db.test.ts
git commit -m "feat(db): add FavoritesDB with toggle, list, checkBatch, remove"
```

---

## Task 4: DB Layer — Shopping Lists

**Files:**
- Create: `lib/db/shopping-lists.db.ts`
- Create: `__tests__/lib/db/shopping-lists.db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/lib/db/shopping-lists.db.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shoppingList: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    shoppingListItem: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { ShoppingListsDB } from "@/lib/db/shopping-lists.db";
import { prisma } from "@/lib/prisma";

describe("ShoppingListsDB", () => {
  const tenantId = "tenant-1";
  const customerPhone = "51999999999";

  it("create rejects when at max (10)", async () => {
    vi.mocked(prisma.shoppingList.count).mockResolvedValue(10);
    const result = await ShoppingListsDB.create(tenantId, customerPhone, "Nueva");
    expect(result.error).toBe("Máximo 10 listas alcanzado");
  });

  it("create succeeds when under limit", async () => {
    vi.mocked(prisma.shoppingList.count).mockResolvedValue(3);
    vi.mocked(prisma.shoppingList.create).mockResolvedValue({
      id: "list-1",
      customerPhone,
      name: "Semanal",
      isDefault: false,
      tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await ShoppingListsDB.create(tenantId, customerPhone, "Semanal");
    expect(result.data?.name).toBe("Semanal");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run __tests__/lib/db/shopping-lists.db.test.ts
```

- [ ] **Step 3: Implement ShoppingListsDB**

```typescript
// lib/db/shopping-lists.db.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";

const MAX_LISTS = 10;
const MAX_ITEMS = 50;

export const ShoppingListsDB = {
  async list(tenantId: string, customerPhone: string) {
    return prisma.shoppingList.findMany({
      where: { customerPhone, tenantId },
      include: { items: { include: { product: { select: { id: true, name: true, price: true, image: true, stock: true } } } } },
      orderBy: { updatedAt: "desc" },
    });
  },

  async create(tenantId: string, customerPhone: string, name: string) {
    const count = await prisma.shoppingList.count({ where: { customerPhone, tenantId } });
    if (count >= MAX_LISTS) return { error: "Máximo 10 listas alcanzado" } as const;

    const data = await prisma.shoppingList.create({
      data: { customerPhone, name, tenantId },
    });
    logActivity("shopping_list_created", "ShoppingList", name, data.id, customerPhone, undefined, tenantId).catch(() => {});
    return { data } as const;
  },

  async getById(tenantId: string, customerPhone: string, id: string) {
    return prisma.shoppingList.findFirst({
      where: { id, customerPhone, tenantId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, image: true, stock: true, unit: true, active: true, tenantId: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  },

  async update(tenantId: string, customerPhone: string, id: string, data: { name?: string; isDefault?: boolean }) {
    const list = await prisma.shoppingList.findFirst({ where: { id, customerPhone, tenantId } });
    if (!list) return null;
    if (data.isDefault) {
      await prisma.shoppingList.updateMany({ where: { customerPhone, tenantId, isDefault: true }, data: { isDefault: false } });
    }
    return prisma.shoppingList.update({ where: { id }, data });
  },

  async remove(tenantId: string, customerPhone: string, id: string) {
    const list = await prisma.shoppingList.findFirst({ where: { id, customerPhone, tenantId } });
    if (!list) return null;
    return prisma.shoppingList.delete({ where: { id } });
  },

  async addItem(tenantId: string, customerPhone: string, listId: string, item: { productId: number; storeId?: string | null; quantity: number; notes?: string | null }) {
    const list = await prisma.shoppingList.findFirst({ where: { id: listId, customerPhone, tenantId }, include: { items: true } });
    if (!list) return { error: "Lista no encontrada" } as const;
    if (list.items.length >= MAX_ITEMS) return { error: "Máximo 50 items por lista" } as const;

    const existing = list.items.find((i) => i.productId === item.productId);
    if (existing) {
      const updated = await prisma.shoppingListItem.update({ where: { id: existing.id }, data: { quantity: item.quantity, notes: item.notes } });
      return { data: updated } as const;
    }

    const data = await prisma.shoppingListItem.create({
      data: { shoppingListId: listId, productId: item.productId, storeId: item.storeId ?? null, quantity: item.quantity, notes: item.notes ?? null, sortOrder: list.items.length },
    });
    return { data } as const;
  },

  async updateItem(tenantId: string, customerPhone: string, listId: string, itemId: number, data: { quantity?: number; notes?: string | null; sortOrder?: number }) {
    const list = await prisma.shoppingList.findFirst({ where: { id: listId, customerPhone, tenantId } });
    if (!list) return null;
    const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId, shoppingListId: listId } });
    if (!item) return null;
    return prisma.shoppingListItem.update({ where: { id: itemId }, data });
  },

  async removeItem(tenantId: string, customerPhone: string, listId: string, itemId: number) {
    const list = await prisma.shoppingList.findFirst({ where: { id: listId, customerPhone, tenantId } });
    if (!list) return null;
    const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId, shoppingListId: listId } });
    if (!item) return null;
    return prisma.shoppingListItem.delete({ where: { id: itemId } });
  },
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run __tests__/lib/db/shopping-lists.db.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/shopping-lists.db.ts __tests__/lib/db/shopping-lists.db.test.ts
git commit -m "feat(db): add ShoppingListsDB with CRUD + item management"
```

---

## Task 5: Extend CouponsDB — Redemption Tracking

**Files:**
- Modify: `lib/db/coupons.db.ts`
- Modify: `app/api/coupons/validate/route.ts`

- [ ] **Step 1: Add redeemCoupon and getMyCoupons to CouponsDB**

In `lib/db/coupons.db.ts`, add these methods to the `CouponsDB` object:

```typescript
  async redeemCoupon(tenantId: string, couponId: string, customerPhone: string, orderId: string, discountApplied: number) {
    return prisma.couponRedemption.create({
      data: { couponId, customerPhone, orderId, discountApplied, tenantId },
    });
  },

  async hasCustomerUsed(tenantId: string, couponId: string, customerPhone: string): Promise<boolean> {
    const existing = await prisma.couponRedemption.findFirst({
      where: { couponId, customerPhone, tenantId },
    });
    return !!existing;
  },

  async getMyCoupons(tenantId: string, customerPhone: string) {
    const allCoupons = await prisma.coupon.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "desc" },
    });

    const redemptions = await prisma.couponRedemption.findMany({
      where: { customerPhone, tenantId },
      select: { couponId: true, redeemedAt: true },
    });

    const usedIds = new Set(redemptions.map((r) => r.couponId));
    const now = new Date();

    return {
      available: allCoupons.filter((c) => !usedIds.has(c.id) && (!c.expiresAt || c.expiresAt > now) && (!c.maxUses || c.usedCount < c.maxUses)),
      used: allCoupons.filter((c) => usedIds.has(c.id)),
      expired: allCoupons.filter((c) => !usedIds.has(c.id) && c.expiresAt && c.expiresAt <= now),
    };
  },
```

- [ ] **Step 2: Add hasCustomerUsed to the CouponsDB in `lib/jsondb.ts`**

> **IMPORTANT:** The validate route imports `CouponsDB` from `@/lib/jsondb`, NOT from `@/lib/db/coupons.db.ts`. Add the method there.

In `lib/jsondb.ts`, find the `CouponsDB` object and add:

```typescript
  async hasCustomerUsed(tenantId: string, couponId: string, customerPhone: string): Promise<boolean> {
    const existing = await prisma.couponRedemption.findFirst({
      where: { couponId, customerPhone, tenantId },
    });
    return !!existing;
  },
```

- [ ] **Step 3: Add 1-use-per-customer check to validate route**

In `app/api/coupons/validate/route.ts`, after line 27 (maxUses check), add:

```typescript
    // Check 1-use-per-customer
    if (customerPhone) {
      const alreadyUsed = await CouponsDB.hasCustomerUsed(tenantId, coupon.id, customerPhone);
      if (alreadyUsed) return NextResponse.json({ error: "Ya usaste este cupón" }, { status: 400 });
    }
```

Also update the request body parsing to accept optional `customerPhone`:
```typescript
    const { code, cartTotal, customerPhone } = await req.json();
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/coupons.db.ts app/api/coupons/validate/route.ts
git commit -m "feat(coupons): add redemption tracking + 1-use-per-customer check"
```

---

## Task 6: Verify Existing Order History + Reorder Routes

**Files:**
- Verify: `app/api/me/order-history/route.ts` (already exists)
- Verify: `app/api/me/reorder/[orderId]/route.ts` (already exists)

> **These routes already exist and work.** No new routes needed. This task verifies they meet our requirements.

- [ ] **Step 1: Verify order-history endpoint works**

```bash
# Start dev server, then test (needs auth cookie):
curl -s http://localhost:3000/api/me/order-history | head -100
```

The existing route:
- Uses `requireCustomer()` ✓
- Extracts `tenantId` from `customer` payload ✓
- Paginates with `?page=1&limit=10` ✓
- Includes order items with product data ✓

- [ ] **Step 2: Verify reorder endpoint works**

The existing `POST /api/me/reorder/[orderId]` already:
- Validates stock in real-time ✓
- Reports price changes (with `originalPrice` and `priceDifference`) ✓
- Returns items ready for cart ✓

> **Note:** The existing reorder uses `item.name` (not `item.productName`). The OrderItem model's field is `name`.

- [ ] **Step 3: No commit needed — routes already exist**

Skip. These routes are production-ready.

---

## Task 7: API Routes — Favorites

**Files:**
- Create: `app/api/marketplace/favorites/route.ts`
- Create: `app/api/marketplace/favorites/[id]/route.ts`
- Create: `app/api/marketplace/favorites/check/route.ts`

- [ ] **Step 1: Create favorites CRUD routes**

```typescript
// app/api/marketplace/favorites/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { FavoritesDB } from "@/lib/db/favorites.db";
import { AddFavoriteSchema } from "@/lib/validations/favorite.schema";

export async function GET(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ data: [] });

    const data = await FavoritesDB.list(tenantId, customer.customerId);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "Perfil incompleto" }, { status: 400 });

    const body = await req.json();
    const parsed = AddFavoriteSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });

    const result = await FavoritesDB.toggle(tenantId, customer.customerId, parsed.data.productId, parsed.data.storeId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ added: result.added, id: result.id });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create favorites delete route**

```typescript
// app/api/marketplace/favorites/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { FavoritesDB } from "@/lib/db/favorites.db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "Perfil incompleto" }, { status: 400 });

    const { id } = await params;
    const result = await FavoritesDB.remove(tenantId, id, customer.customerId);
    if (!result) return NextResponse.json({ error: "Favorito no encontrado" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create favorites batch check route**

```typescript
// app/api/marketplace/favorites/check/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { FavoritesDB } from "@/lib/db/favorites.db";

export async function GET(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ data: [] });

    const url = new URL(req.url);
    const idsParam = url.searchParams.get("productIds") || "";
    const productIds = idsParam.split(",").map(Number).filter((n) => !isNaN(n) && n > 0).slice(0, 50);

    if (productIds.length === 0) return NextResponse.json({ data: [] });

    const data = await FavoritesDB.checkBatch(tenantId, customer.customerId, productIds);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/marketplace/favorites/
git commit -m "feat(api): add marketplace favorites CRUD + batch check"
```

---

## Task 8: API Routes — Shopping Lists

**Files:**
- Create: `app/api/marketplace/shopping-lists/route.ts`
- Create: `app/api/marketplace/shopping-lists/[id]/route.ts`
- Create: `app/api/marketplace/shopping-lists/[id]/items/route.ts`
- Create: `app/api/marketplace/shopping-lists/[id]/items/[itemId]/route.ts`
- Create: `app/api/marketplace/shopping-lists/[id]/add-to-cart/route.ts`

- [ ] **Step 1: Create shopping-lists CRUD route**

```typescript
// app/api/marketplace/shopping-lists/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ShoppingListsDB } from "@/lib/db/shopping-lists.db";
import { CreateShoppingListSchema } from "@/lib/validations/shopping-list.schema";

export async function GET(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ data: [] });

    const data = await ShoppingListsDB.list(tenantId, customer.customerId);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "Perfil incompleto" }, { status: 400 });

    const body = await req.json();
    const parsed = CreateShoppingListSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });

    const result = await ShoppingListsDB.create(tenantId, customer.customerId, parsed.data.name);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create [id] route (GET/PUT/DELETE)**

```typescript
// app/api/marketplace/shopping-lists/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ShoppingListsDB } from "@/lib/db/shopping-lists.db";
import { UpdateShoppingListSchema } from "@/lib/validations/shopping-list.schema";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id } = await params;
    const data = await ShoppingListsDB.getById(tenantId, customer.customerId, id);
    if (!data) return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateShoppingListSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const data = await ShoppingListsDB.update(tenantId, customer.customerId, id, parsed.data);
    if (!data) return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id } = await params;
    const data = await ShoppingListsDB.remove(tenantId, customer.customerId, id);
    if (!data) return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create items route (POST)**

```typescript
// app/api/marketplace/shopping-lists/[id]/items/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ShoppingListsDB } from "@/lib/db/shopping-lists.db";
import { AddShoppingListItemSchema } from "@/lib/validations/shopping-list.schema";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const parsed = AddShoppingListItemSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });

    const result = await ShoppingListsDB.addItem(tenantId, customer.customerId, id, parsed.data);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create items/[itemId] route (PUT/DELETE)**

```typescript
// app/api/marketplace/shopping-lists/[id]/items/[itemId]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ShoppingListsDB } from "@/lib/db/shopping-lists.db";
import { UpdateShoppingListItemSchema } from "@/lib/validations/shopping-list.schema";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id, itemId } = await params;
    const body = await req.json();
    const parsed = UpdateShoppingListItemSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const data = await ShoppingListsDB.updateItem(tenantId, customer.customerId, id, Number(itemId), parsed.data);
    if (!data) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id, itemId } = await params;
    const data = await ShoppingListsDB.removeItem(tenantId, customer.customerId, id, Number(itemId));
    if (!data) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create add-to-cart route**

```typescript
// app/api/marketplace/shopping-lists/[id]/add-to-cart/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ShoppingListsDB } from "@/lib/db/shopping-lists.db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { id } = await params;
    const list = await ShoppingListsDB.getById(tenantId, customer.customerId, id);
    if (!list) return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });

    const items = [];
    const warnings = [];

    for (const item of list.items) {
      if (!item.product.active || (item.product.stock !== null && item.product.stock <= 0)) {
        warnings.push({ productId: item.productId, name: item.product.name, issue: "sin_stock" });
        continue;
      }
      items.push({
        id: item.product.id,
        name: item.product.name,
        price: Number(item.product.price),
        image: item.product.image,
        unit: item.product.unit,
        quantity: item.quantity,
        stock: item.product.stock,
      });
    }

    return NextResponse.json({ items, warnings });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/api/marketplace/shopping-lists/
git commit -m "feat(api): add marketplace shopping lists CRUD + items + add-to-cart"
```

---

## Task 9: API Routes — My Coupons + My Referral

**Files:**
- Create: `app/api/marketplace/my-coupons/route.ts`
- Create: `app/api/marketplace/my-referral/route.ts`
- Create: `app/api/marketplace/referral/register/route.ts`
- Create: `app/api/cron/birthday-coupons/route.ts`

- [ ] **Step 1: Create my-coupons route**

```typescript
// app/api/marketplace/my-coupons/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { CouponsDB } from "@/lib/db/coupons.db";

export async function GET(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ available: [], used: [], expired: [] });

    const data = await CouponsDB.getMyCoupons(tenantId, customer.customerId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create my-referral route**

```typescript
// app/api/marketplace/my-referral/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ReferralsDB } from "@/lib/db/referrals.db";

export async function GET(req: NextRequest) {
  try {
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const { tenantId } = customer;
    if (!customer.customerId) return NextResponse.json({ error: "Perfil incompleto" }, { status: 400 });

    const [code, referrals] = await Promise.all([
      ReferralsDB.generateCodeForCustomer(tenantId, customer.customerId),
      ReferralsDB.listReferralsByCustomer(tenantId, customer.customerId),
    ]);

    return NextResponse.json({ code, referrals });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create referral register route**

```typescript
// app/api/marketplace/referral/register/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getTenantIdFromRequest } from "@/lib/tenant"; // Public route — no requireCustomer, so use getTenantId
import { ReferralsDB } from "@/lib/db/referrals.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const RegisterSchema = z.object({
  referralCode: z.string().min(1).max(20).trim(),
  refereePhone: z.string().min(6).max(20),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`referral-register:${ip}`, 5, 300);
  if (!allowed) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

  try {
    const tenantId = getTenantIdFromRequest(req);
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const referrer = await ReferralsDB.getCustomerByReferralCode(tenantId, parsed.data.referralCode);
    if (!referrer) return NextResponse.json({ error: "Código de referido no válido" }, { status: 404 });

    const result = await ReferralsDB.registerReferral(tenantId, referrer.phone, parsed.data.refereePhone);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create birthday coupons cron**

```typescript
// app/api/cron/birthday-coupons/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Find customers with birthday today (across all tenants)
    const customers = await prisma.$queryRaw<{ phone: string; name: string; tenantId: string }[]>`
      SELECT phone, name, "tenantId"
      FROM "Customer"
      WHERE EXTRACT(MONTH FROM birthday) = ${month}
        AND EXTRACT(DAY FROM birthday) = ${day}
        AND birthday IS NOT NULL
    `;

    let created = 0;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    for (const c of customers) {
      const code = `CUMPLE-${c.phone.replace(/\D/g, "").slice(-6)}-${today.getFullYear()}`;
      const exists = await prisma.coupon.findFirst({ where: { tenantId: c.tenantId, code } });
      if (exists) continue;

      await prisma.coupon.create({
        data: {
          tenantId: c.tenantId,
          code,
          description: `¡Feliz cumpleaños ${c.name}! S/10 de descuento`,
          discountType: "fixed",
          discountValue: 10,
          type: "birthday",
          maxUses: 1,
          expiresAt,
          active: true,
        },
      });
      created++;
    }

    logger.info(`[birthday-coupons] Created ${created} coupons for ${customers.length} customers`);
    return NextResponse.json({ created, total: customers.length });
  } catch (e) {
    logger.error("[birthday-coupons] Error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/api/marketplace/my-coupons/ app/api/marketplace/my-referral/ app/api/marketplace/referral/ app/api/cron/birthday-coupons/
git commit -m "feat(api): add my-coupons, my-referral, referral register, birthday cron"
```

---

## Task 10: API Route — Price Compare

**Files:**
- Create: `app/api/marketplace/products/[id]/prices/route.ts`

- [ ] **Step 1: Create price compare endpoint**

```typescript
// app/api/marketplace/products/[id]/prices/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const product = await prisma.product.findFirst({
      where: { id: productId, active: true, deletedAt: null },
      select: { name: true, barcode: true, tenantId: true },
    });

    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    // Find same product in other stores by name match or barcode
    const where = product.barcode
      ? { OR: [{ name: product.name, active: true, deletedAt: null }, { barcode: product.barcode, active: true, deletedAt: null }] }
      : { name: product.name, active: true, deletedAt: null };

    const allPrices = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        tenantId: true,
      },
    });

    // Get store info for each tenant
    const tenantIds = [...new Set(allPrices.map((p) => p.tenantId))];
    const stores = await prisma.store.findMany({
      where: { tenantId: { in: tenantIds }, isPublished: true },
      select: { id: true, tenantId: true, name: true, slug: true },
    });

    const storeMap = new Map(stores.map((s) => [s.tenantId, s]));

    const prices = allPrices
      .map((p) => {
        const store = storeMap.get(p.tenantId);
        if (!store) return null;
        return {
          productId: p.id,
          price: Number(p.price),
          stock: p.stock,
          storeId: store.id,
          storeName: store.name,
          storeSlug: store.slug,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.price - b!.price);

    return NextResponse.json({ data: prices });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript + Commit**

```bash
npx tsc --noEmit
git add app/api/marketplace/products/
git commit -m "feat(api): add price compare endpoint for marketplace products"
```

---

## Task 11: Mi Cuenta Layout + Pages (Server Components)

**Files:**
- Create: `app/marketplace/mi-cuenta/layout.tsx`
- Create: `app/marketplace/mi-cuenta/page.tsx`
- Create: all subpages

- [ ] **Step 1: Create mi-cuenta layout with auth guard**

```typescript
// app/marketplace/mi-cuenta/layout.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function MiCuentaLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = cookieStore.get("buleje-customer-sess");

  if (!session?.value) {
    redirect("/marketplace?login=true");
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create mi-cuenta index page**

```typescript
// app/marketplace/mi-cuenta/page.tsx
import Link from "next/link";

const sections = [
  { href: "/marketplace/mi-cuenta/pedidos", icon: "📋", label: "Mis pedidos", desc: "Historial y repetir pedidos" },
  { href: "/marketplace/mi-cuenta/favoritos", icon: "❤️", label: "Mis favoritos", desc: "Productos guardados" },
  { href: "/marketplace/mi-cuenta/listas", icon: "🛒", label: "Mis listas", desc: "Listas de compras" },
  { href: "/marketplace/mi-cuenta/cupones", icon: "🎟️", label: "Mis cupones", desc: "Descuentos disponibles" },
  { href: "/marketplace/mi-cuenta/referidos", icon: "👥", label: "Invitar amigos", desc: "Gana S/10 por cada amigo" },
];

export default function MiCuentaPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Mi cuenta</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors hover:bg-gray-50">
            <span className="text-3xl">{s.icon}</span>
            <span className="font-medium">{s.label}</span>
            <span className="text-xs text-gray-500">{s.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create stub pages for each section**

Create minimal client components for each page that will be fleshed out in UI tasks:

- `app/marketplace/mi-cuenta/pedidos/page.tsx` → renders `<OrderHistory />`
- `app/marketplace/mi-cuenta/favoritos/page.tsx` → renders `<FavoritesPage />`
- `app/marketplace/mi-cuenta/listas/page.tsx` → renders `<ShoppingListsPage />`
- `app/marketplace/mi-cuenta/listas/[id]/page.tsx` → renders `<ShoppingListDetail />`
- `app/marketplace/mi-cuenta/cupones/page.tsx` → renders `<MyCouponsPage />`
- `app/marketplace/mi-cuenta/referidos/page.tsx` → renders `<ReferralPage />`

Each page follows this pattern:

```typescript
"use client";
import { OrderHistory } from "@/components/marketplace/OrderHistory";
export default function PedidosPage() {
  return <OrderHistory />;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/marketplace/mi-cuenta/
git commit -m "feat(pages): add mi-cuenta layout + section pages"
```

---

## Task 12: UI Components — Order History + Reorder

**Files:**
- Create: `components/marketplace/OrderHistory.tsx`
- Create: `components/marketplace/OrderCard.tsx`
- Create: `components/marketplace/ReorderModal.tsx`

- [ ] **Step 1: Implement OrderHistory**

Client component that fetches `/api/marketplace/my-orders` with pagination. Renders list of `OrderCard`. Empty state: "Aún no tienes pedidos."

- [ ] **Step 2: Implement OrderCard**

Shows: date (relative via `Intl.RelativeTimeFormat`), status badge (color-coded), product thumbnails (max 4 + "+N"), total formatted as `S/XX.XX`, and "Pedir de nuevo" button.

- [ ] **Step 3: Implement ReorderModal**

Calls `/api/marketplace/my-orders/[id]/reorder`, shows returned items with warnings (stock/price changes), allows quantity edits, "Agregar al carrito" button dispatches `ADD_MULTIPLE` to cart context.

- [ ] **Step 4: Test in browser**

Navigate to `http://localhost:3000/marketplace/mi-cuenta/pedidos`. Verify pagination, reorder flow, warnings display.

- [ ] **Step 5: Commit**

```bash
git add components/marketplace/OrderHistory.tsx components/marketplace/OrderCard.tsx components/marketplace/ReorderModal.tsx
git commit -m "feat(ui): add OrderHistory, OrderCard, ReorderModal components"
```

---

## Task 13: UI Components — Favorites

**Files:**
- Create: `components/marketplace/FavoriteButton.tsx`
- Create: `components/marketplace/FavoritesPage.tsx`
- Create: `components/marketplace/FavoriteCard.tsx`
- Modify: `components/marketplace/UnifiedProductCard.tsx`

- [ ] **Step 1: Implement FavoriteButton**

Heart icon toggle. Calls `POST /api/marketplace/favorites` with `{ productId, storeId }`. Optimistic UI: toggle immediately, revert on error. If not logged in → open auth modal.

- [ ] **Step 2: Implement FavoriteCard**

Shows product info + "Guardado de: [tienda] S/XX" + alternativas más baratas (fetches from `/api/marketplace/products/[id]/prices`). "Agregar al carrito" button.

- [ ] **Step 3: Implement FavoritesPage**

Fetches `/api/marketplace/favorites`. Renders grid of FavoriteCard. Empty state: "Aún no tienes favoritos. Explora el marketplace y marca los productos que te gustan."

- [ ] **Step 4: Add FavoriteButton to UnifiedProductCard**

In `UnifiedProductCard.tsx`, add `<FavoriteButton productId={product.id} storeId={product.storeId} />` in the top-right corner of the card. Use the batch check endpoint to preload favorite state for all visible cards.

- [ ] **Step 5: Test in browser**

Toggle favorites, check /mi-cuenta/favoritos, verify alternatives show.

- [ ] **Step 6: Commit**

```bash
git add components/marketplace/FavoriteButton.tsx components/marketplace/FavoritesPage.tsx components/marketplace/FavoriteCard.tsx components/marketplace/UnifiedProductCard.tsx
git commit -m "feat(ui): add Favorites with FavoriteButton, FavoritesPage, price alternatives"
```

---

## Task 14: UI Components — Price Compare

**Files:**
- Create: `components/marketplace/PriceBadge.tsx`
- Create: `components/marketplace/PriceCompareTable.tsx`
- Modify: `components/marketplace/UnifiedProductCard.tsx`

- [ ] **Step 1: Implement PriceBadge**

Accepts `cheapestPrice`, `currentPrice`, `cheapestStoreName`. Logic: if current is cheapest → green "Mejor precio". If difference >= S/0.50 → orange "S/X menos en [tienda]". Else → null (no render).

- [ ] **Step 2: Implement PriceCompareTable**

Fetches `/api/marketplace/products/[id]/prices`. Renders sorted table: store name, price, stock status, "Agregar" button per row. Best price row highlighted.

- [ ] **Step 3: Add PriceBadge to UnifiedProductCard**

Add badge below price in the card. The cheapest alternative data comes from the marketplace products listing API (extended in Task 10).

- [ ] **Step 4: Test in browser**

Check badges appear on product cards, compare table works on product detail.

- [ ] **Step 5: Commit**

```bash
git add components/marketplace/PriceBadge.tsx components/marketplace/PriceCompareTable.tsx components/marketplace/UnifiedProductCard.tsx
git commit -m "feat(ui): add PriceBadge and PriceCompareTable for price comparison"
```

---

## Task 15: UI Components — Shopping Lists

**Files:**
- Create: `components/marketplace/ShoppingListsPage.tsx`
- Create: `components/marketplace/ShoppingListDetail.tsx`
- Create: `components/marketplace/AddToListButton.tsx`
- Create: `components/marketplace/ShoppingListModal.tsx`

- [ ] **Step 1: Implement ShoppingListsPage**

Fetches `/api/marketplace/shopping-lists`. Grid of list cards showing: name, item count, estimated total. "Nueva lista" button opens modal. Empty state message.

- [ ] **Step 2: Implement ShoppingListDetail**

Fetches `/api/marketplace/shopping-lists/[id]`. Shows items with current prices, quantity editors, notes, remove button. "Agregar todo al carrito" button calls add-to-cart endpoint and dispatches ADD_MULTIPLE to cart.

- [ ] **Step 3: Implement AddToListButton + ShoppingListModal**

Button on product cards: list icon. Opens modal with user's lists to pick from, or "Nueva lista" quick-create. Calls POST items endpoint.

- [ ] **Step 4: Add AddToListButton to UnifiedProductCard**

Place next to FavoriteButton.

- [ ] **Step 5: Test in browser**

Create list, add items, edit quantities, add-to-cart flow, verify cart receives items.

- [ ] **Step 6: Commit**

```bash
git add components/marketplace/ShoppingListsPage.tsx components/marketplace/ShoppingListDetail.tsx components/marketplace/AddToListButton.tsx components/marketplace/ShoppingListModal.tsx components/marketplace/UnifiedProductCard.tsx
git commit -m "feat(ui): add Shopping Lists with detail view, add-to-list flow"
```

---

## Task 16: UI Components — Coupons + Referrals

**Files:**
- Create: `components/marketplace/MyCouponsPage.tsx`
- Create: `components/marketplace/CouponCard.tsx`
- Create: `components/marketplace/ReferralPage.tsx`
- Create: `components/marketplace/CouponInput.tsx`
- Create: `components/marketplace/ShareReferralButton.tsx`
- Modify: `components/marketplace/MarketplaceCheckoutModal.tsx`

- [ ] **Step 1: Implement MyCouponsPage**

Fetches `/api/marketplace/my-coupons`. Tabs: Disponibles / Usados / Expirados. Grid of CouponCard.

- [ ] **Step 2: Implement CouponCard**

Shows: type badge (bienvenida/referido/promo/cumpleaños), code, discount description, expiration countdown, min purchase, "Copiar código" button.

- [ ] **Step 3: Implement ReferralPage**

Fetches `/api/marketplace/my-referral`. Shows code prominently, ShareReferralButton (WhatsApp priority + copy link), referral history list.

- [ ] **Step 4: Implement ShareReferralButton**

Uses Web Share API on mobile, fallback to WhatsApp deeplink + copy button. Share text: "Comprá en Buleje con mi código [CODE] y ambos ganamos S/5. [link]".

- [ ] **Step 5: Implement CouponInput**

Input field + "Aplicar" button. Calls POST `/api/coupons/validate`. Shows inline success (discount amount) or error message. Integrates into checkout flow.

- [ ] **Step 6: Add CouponInput to MarketplaceCheckoutModal**

Before payment section, add CouponInput component. Pass `cartTotal` and `customerPhone`. On valid coupon, update displayed total.

- [ ] **Step 7: Test in browser**

Check coupons page, referral sharing, coupon validation in checkout.

- [ ] **Step 8: Commit**

```bash
git add components/marketplace/MyCouponsPage.tsx components/marketplace/CouponCard.tsx components/marketplace/ReferralPage.tsx components/marketplace/CouponInput.tsx components/marketplace/ShareReferralButton.tsx components/marketplace/MarketplaceCheckoutModal.tsx
git commit -m "feat(ui): add Coupons, Referrals, CouponInput in checkout"
```

---

## Task 17: User Menu Dropdown in Navbar

**Files:**
- Create: `components/marketplace/UserMenuDropdown.tsx`
- Modify: `components/marketplace/MarketplaceNavbar.tsx`

- [ ] **Step 1: Implement UserMenuDropdown**

Dropdown with avatar initial, user name, links to all mi-cuenta sections, "Cerrar sesión" at bottom. Positioned as popover on desktop, full-screen on mobile.

- [ ] **Step 2: Modify MarketplaceNavbar**

Replace "Ingresar" button with UserMenuDropdown when customer session exists. Check session cookie client-side or via API.

- [ ] **Step 3: Test in browser**

Login → verify dropdown appears. Click each link → navigates correctly. Mobile responsive.

- [ ] **Step 4: Commit**

```bash
git add components/marketplace/UserMenuDropdown.tsx components/marketplace/MarketplaceNavbar.tsx
git commit -m "feat(ui): add UserMenuDropdown replacing Ingresar button when logged in"
```

---

## Task 18: Final Integration Tests + Verification

**Files:**
- Create: `__tests__/api/marketplace/my-orders.test.ts`
- Create: `__tests__/api/marketplace/favorites.test.ts`
- Create: `__tests__/api/marketplace/shopping-lists.test.ts`
- Create: `__tests__/api/marketplace/my-coupons.test.ts`

- [ ] **Step 1: Write API integration tests**

Test each endpoint: auth required, CRUD operations, edge cases (max limits, duplicates, not found).

- [ ] **Step 2: Run full test suite**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 3: Run lint + type check + build**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Expected: No errors.

- [ ] **Step 4: Manual E2E verification in browser**

Full flow:
1. Login as customer
2. Browse marketplace → toggle favorites → verify heart state
3. Check price badges on cards
4. Create shopping list → add items → edit → add-to-cart
5. Go to mi-cuenta/pedidos → pedir de nuevo
6. Apply coupon in checkout
7. Check mi-cuenta/cupones
8. Share referral link

- [ ] **Step 5: Final commit**

```bash
git add __tests__/
git commit -m "test: add integration tests for Ola 1 marketplace features"
```
