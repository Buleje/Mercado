# Ola 2: Confianza y Engagement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 5 features (category images, reviews with photos, recipes + cart, flash deals, store stories) that generate visual trust and daily return visits to the marketplace.

**Architecture:** Extend existing Prisma schema with 2 new tables (FlashDeal, StoreStory), extend Receta with presentation fields. Reuse existing ReviewsMarketplaceDB, review upload endpoint, and RecetarioClient. New `lib/db/*.db.ts` files follow `export const XxxDB = {}` pattern. Auth via `requireCustomer()` using `customer.tenantId`. Cron jobs use GET + `CRON_SECRET`.

**Tech Stack:** Next.js 16 App Router, Prisma, Zod (safeParse), TypeScript, Tailwind CSS, sharp (image resize), Supabase Storage, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-13-ola2-confianza-engagement-design.md`

**Implementation order:** 3 → 2 → 5 → 1 → 4 (lowest to highest effort)

---

## File Structure

### New Files
```
prisma/migrations/XXXXXXXX_ola2_confianza_engagement/migration.sql

lib/db/flash-deals.db.ts
lib/db/stories.db.ts
lib/db/recetas-marketplace.db.ts
lib/validations/flash-deal.schema.ts
lib/validations/story.schema.ts

app/api/marketplace/flash-deals/route.ts
app/api/marketplace/flash-deals/featured/route.ts
app/api/marketplace/flash-deals/[id]/route.ts
app/api/marketplace/stories/route.ts
app/api/marketplace/stories/[id]/view/route.ts
app/api/marketplace/recetas/route.ts
app/api/cron/expire-flash-deals/route.ts
app/api/cron/cleanup-stories/route.ts

components/marketplace/FlashDealBanner.tsx
components/marketplace/FlashDealCard.tsx
components/marketplace/FlashDealBadge.tsx
components/marketplace/FlashDealsSection.tsx
components/marketplace/CountdownTimer.tsx
components/marketplace/StoreStoriesBar.tsx
components/marketplace/StoreStoryCircle.tsx
components/marketplace/StoryViewer.tsx
components/marketplace/ReviewPhotoUpload.tsx
components/marketplace/ReviewPhotoGallery.tsx
components/marketplace/ReviewForm.tsx
components/marketplace/RecipeCard.tsx
components/marketplace/RecipeDetail.tsx
components/marketplace/RecipeIngredientList.tsx
components/marketplace/AddIngredientsButton.tsx

public/images/categories/bodegas.webp
public/images/categories/restaurantes.webp
public/images/categories/licoreria.webp
public/images/categories/farmacia.webp
public/images/categories/frutas-verduras.webp
public/images/categories/panaderia.webp
public/images/categories/limpieza.webp
public/images/categories/mascotas.webp
public/images/categories/carniceria.webp
public/images/categories/congelados.webp
public/images/categories/snacks.webp
public/images/categories/higiene.webp

__tests__/lib/db/flash-deals.db.test.ts
__tests__/lib/db/stories.db.test.ts
__tests__/api/marketplace/flash-deals.test.ts
```

### Modified Files
```
prisma/schema.prisma                              — Add FlashDeal, StoreStory, extend Receta + back-references
app/api/marketplace/reviews/upload/route.ts        — Add requireCustomer() auth
components/marketplace/UnifiedProductCard.tsx       — Add FlashDealBadge
components/marketplace/MarketplaceContent.tsx       — Add FlashDealsSection + StoreStoriesBar
components/marketplace/StoreDetail.tsx              — Add ReviewPhotoGallery to reviews
components/store/RecetarioClient.tsx                — Integrate new RecipeCard + AddIngredientsButton
```

---

## Task 1: Category Images (Feature 3 — zero DB changes)

**Files:**
- Create: `public/images/categories/*.webp` (12 images)
- Modify: landing page category section
- Modify: `components/marketplace/MarketplaceFilters.tsx`

- [ ] **Step 1: Create category image map**

Find the landing page component that renders the 12 category cards (with emojis). Create a constant map:

```typescript
// In the component that renders categories
const CATEGORY_IMAGES: Record<string, { image: string; emoji: string }> = {
  bodegas:         { image: "/images/categories/bodegas.webp",         emoji: "🏪" },
  restaurantes:    { image: "/images/categories/restaurantes.webp",    emoji: "🍔" },
  licoreria:       { image: "/images/categories/licoreria.webp",       emoji: "🍺" },
  farmacia:        { image: "/images/categories/farmacia.webp",        emoji: "💊" },
  "frutas-verduras": { image: "/images/categories/frutas-verduras.webp", emoji: "🥦" },
  panaderia:       { image: "/images/categories/panaderia.webp",       emoji: "🍞" },
  limpieza:        { image: "/images/categories/limpieza.webp",        emoji: "🧹" },
  mascotas:        { image: "/images/categories/mascotas.webp",        emoji: "🐾" },
  carniceria:      { image: "/images/categories/carniceria.webp",      emoji: "🥩" },
  congelados:      { image: "/images/categories/congelados.webp",      emoji: "🧊" },
  snacks:          { image: "/images/categories/snacks.webp",          emoji: "🍿" },
  higiene:         { image: "/images/categories/higiene.webp",         emoji: "🧴" },
};
```

- [ ] **Step 2: Generate placeholder category images**

Create 12 placeholder images using simple colored gradients with category text overlay (400x300 WebP). These will be replaced with real photos later.

```bash
# Use sharp or a script to generate placeholder images
# For now, create simple SVG placeholders converted to WebP
mkdir -p public/images/categories
```

- [ ] **Step 3: Update landing page category cards**

Replace emoji-only rendering with `<Image>` + emoji fallback:

```tsx
<div className="relative w-full h-32 rounded-xl overflow-hidden">
  <Image
    src={CATEGORY_IMAGES[slug]?.image || ""}
    alt={name}
    fill
    className="object-cover"
    onError={(e) => { e.currentTarget.style.display = "none"; }}
  />
  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
  <div className="absolute bottom-2 left-3 text-white font-semibold text-sm">
    {name}
  </div>
</div>
```

With fallback to emoji if image fails to load.

- [ ] **Step 4: Update MarketplaceFilters with same images**

Apply same image treatment to the category filter buttons in the marketplace.

- [ ] **Step 5: Test in browser**

Navigate to landing and marketplace. Verify images load, fallback works, responsive on mobile.

- [ ] **Step 6: Commit**

```bash
git add public/images/categories/ components/ app/
git commit -m "feat(ui): add category images replacing emojis on landing and marketplace"
```

---

## Task 2: Prisma Schema — FlashDeal + StoreStory + Receta Extension

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add FlashDeal model**

```prisma
// ─── Flash Deals (Marketplace) ──────────────────────────
model FlashDeal {
  id            String   @id @default(cuid())
  tenantId      String
  productId     Int
  storeId       String
  originalPrice Decimal  @db.Decimal(12, 2)
  dealPrice     Decimal  @db.Decimal(12, 2)
  maxUnits      Int?
  soldUnits     Int      @default(0)
  startsAt      DateTime
  endsAt        DateTime
  active        Boolean  @default(true)
  featured      Boolean  @default(false)
  createdBy     String?
  createdAt     DateTime @default(now())

  product Product @relation(fields: [productId], references: [id])
  store   Store   @relation(fields: [storeId], references: [id])
  tenant  Tenant  @relation(fields: [tenantId], references: [id])

  @@index([tenantId, active])
  @@index([endsAt])
  @@index([storeId])
}
```

- [ ] **Step 2: Add StoreStory model**

```prisma
// ─── Store Stories (Marketplace) ────────────────────────
model StoreStory {
  id        String   @id @default(cuid())
  tenantId  String
  storeId   String
  type      String   @default("update") // update | promo | new_product | announcement
  title     String
  imageUrl  String?
  productId Int?
  linkUrl   String?
  viewCount Int      @default(0)
  active    Boolean  @default(true)
  expiresAt DateTime
  createdAt DateTime @default(now())

  store   Store    @relation(fields: [storeId], references: [id])
  tenant  Tenant   @relation(fields: [tenantId], references: [id])
  product Product? @relation(fields: [productId], references: [id])

  @@index([tenantId, expiresAt])
  @@index([storeId])
}
```

- [ ] **Step 3: Extend Receta model**

Add to existing `Receta` model:

```prisma
  emoji         String?
  tiempoMinutos Int?
  porciones     Int?
  dificultad    String?  @default("Facil")
  categoria     String?  @default("platos-de-fondo")
  pasosJson     String?
  imageUrl      String?
```

- [ ] **Step 4: Add back-reference arrays to existing models**

In `Product`:
```prisma
  flashDeals  FlashDeal[]
  stories     StoreStory[]
```

In `Store`:
```prisma
  flashDeals  FlashDeal[]
  stories     StoreStory[]
```

In `Tenant`:
```prisma
  flashDeals  FlashDeal[]
  stories     StoreStory[]
```

- [ ] **Step 5: Run migration**

```bash
npx prisma migrate dev --name ola2_confianza_engagement
npx prisma generate
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(db): add FlashDeal, StoreStory models + extend Receta for Ola 2"
```

---

## Task 3: Validation Schemas (Ola 2)

**Files:**
- Create: `lib/validations/flash-deal.schema.ts`
- Create: `lib/validations/story.schema.ts`

- [ ] **Step 1: Create flash deal schema**

```typescript
// lib/validations/flash-deal.schema.ts
import { z } from "zod";

export const CreateFlashDealSchema = z.object({
  productId: z.number().int().positive(),
  storeId: z.string().min(1),
  originalPrice: z.number().positive(),
  dealPrice: z.number().positive(),
  maxUnits: z.number().int().positive().nullish(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  featured: z.boolean().default(false),
}).refine((d) => d.dealPrice < d.originalPrice * 0.9, {
  message: "El descuento debe ser al menos 10%",
});

export const UpdateFlashDealSchema = z.object({
  dealPrice: z.number().positive().optional(),
  maxUnits: z.number().int().positive().nullish(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
});

export type CreateFlashDealInput = z.infer<typeof CreateFlashDealSchema>;
```

- [ ] **Step 2: Create story schema**

```typescript
// lib/validations/story.schema.ts
import { z } from "zod";

export const CreateStorySchema = z.object({
  storeId: z.string().min(1),
  type: z.enum(["update", "promo", "new_product", "announcement"]).default("update"),
  title: z.string().min(1).max(100).trim(),
  imageUrl: z.string().url().nullish(),
  productId: z.number().int().positive().nullish(),
  linkUrl: z.string().url().nullish(),
  expiresInHours: z.number().int().min(1).max(168).default(24), // max 7 days
});

export type CreateStoryInput = z.infer<typeof CreateStorySchema>;
```

- [ ] **Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add lib/validations/
git commit -m "feat(validation): add Zod schemas for flash deals and stories"
```

---

## Task 4: DB Layer — Flash Deals

**Files:**
- Create: `lib/db/flash-deals.db.ts`
- Create: `__tests__/lib/db/flash-deals.db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/lib/db/flash-deals.db.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    flashDeal: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

import { FlashDealsDB } from "@/lib/db/flash-deals.db";
import { prisma } from "@/lib/prisma";

describe("FlashDealsDB", () => {
  it("listActive returns only active non-expired deals", async () => {
    vi.mocked(prisma.flashDeal.findMany).mockResolvedValue([]);
    const result = await FlashDealsDB.listActive("tenant-1");
    expect(result).toEqual([]);
    expect(prisma.flashDeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-1", active: true }),
      }),
    );
  });

  it("create rejects deals with < 10% discount", async () => {
    const result = await FlashDealsDB.create("tenant-1", {
      productId: 1, storeId: "s1", originalPrice: 20, dealPrice: 19,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86400000),
    });
    expect(result.error).toContain("10%");
  });
});
```

- [ ] **Step 2: Run test — verify fail**

```bash
npx vitest run __tests__/lib/db/flash-deals.db.test.ts
```

- [ ] **Step 3: Implement FlashDealsDB**

```typescript
// lib/db/flash-deals.db.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { invalidateByPrefix } from "@/lib/cache";

const MAX_ACTIVE_PER_STORE = 5;
const MAX_FEATURED = 3;
const MIN_DISCOUNT_PCT = 0.10;

export const FlashDealsDB = {
  async listActive(tenantId: string, storeId?: string) {
    const now = new Date();
    return prisma.flashDeal.findMany({
      where: {
        tenantId,
        active: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, image: true, stock: true, unit: true, category: true } },
        store: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { endsAt: "asc" },
    });
  },

  async listFeatured(tenantId: string) {
    const now = new Date();
    return prisma.flashDeal.findMany({
      where: { tenantId, active: true, featured: true, startsAt: { lte: now }, endsAt: { gt: now } },
      include: {
        product: { select: { id: true, name: true, image: true, stock: true, unit: true } },
        store: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { endsAt: "asc" },
      take: MAX_FEATURED,
    });
  },

  async create(tenantId: string, data: {
    productId: number; storeId: string; originalPrice: number; dealPrice: number;
    maxUnits?: number | null; startsAt: Date; endsAt: Date; featured?: boolean; createdBy?: string;
  }) {
    const discount = 1 - (data.dealPrice / data.originalPrice);
    if (discount < MIN_DISCOUNT_PCT) {
      return { error: "El descuento debe ser al menos 10%" } as const;
    }

    const activeCount = await prisma.flashDeal.count({
      where: { tenantId, storeId: data.storeId, active: true, endsAt: { gt: new Date() } },
    });
    if (activeCount >= MAX_ACTIVE_PER_STORE) {
      return { error: `Máximo ${MAX_ACTIVE_PER_STORE} deals activos por tienda` } as const;
    }

    if (data.featured) {
      const featuredCount = await prisma.flashDeal.count({
        where: { tenantId, active: true, featured: true, endsAt: { gt: new Date() } },
      });
      if (featuredCount >= MAX_FEATURED) {
        return { error: `Máximo ${MAX_FEATURED} deals featured simultáneos` } as const;
      }
    }

    const deal = await prisma.flashDeal.create({ data: { tenantId, ...data } });
    invalidateByPrefix(`flash-deals:${tenantId}`).catch(() => {});
    logActivity("flash_deal_created", "FlashDeal", `Product ${data.productId} deal`, deal.id, data.createdBy || "system", undefined, tenantId).catch(() => {});
    return { data: deal } as const;
  },

  async incrementSoldUnits(tenantId: string, dealId: string): Promise<boolean> {
    const result = await prisma.$executeRaw`
      UPDATE "FlashDeal"
      SET "soldUnits" = "soldUnits" + 1
      WHERE id = ${dealId}
        AND "tenantId" = ${tenantId}
        AND ("maxUnits" IS NULL OR "soldUnits" < "maxUnits")
    `;
    return result > 0;
  },

  async deactivate(tenantId: string, id: string) {
    const deal = await prisma.flashDeal.findFirst({ where: { id, tenantId } });
    if (!deal) return null;
    const updated = await prisma.flashDeal.update({ where: { id }, data: { active: false } });
    invalidateByPrefix(`flash-deals:${tenantId}`).catch(() => {});
    return updated;
  },

  async expireAll() {
    const now = new Date();
    const result = await prisma.$executeRaw`
      UPDATE "FlashDeal" SET "active" = false
      WHERE "active" = true AND "endsAt" <= ${now}
    `;
    return result;
  },
};
```

- [ ] **Step 4: Run test — verify pass**

```bash
npx vitest run __tests__/lib/db/flash-deals.db.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/flash-deals.db.ts __tests__/lib/db/flash-deals.db.test.ts
git commit -m "feat(db): add FlashDealsDB with CRUD, atomic soldUnits, expire"
```

---

## Task 5: DB Layer — Stories

**Files:**
- Create: `lib/db/stories.db.ts`

- [ ] **Step 1: Implement StoriesDB**

```typescript
// lib/db/stories.db.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { invalidateByPrefix } from "@/lib/cache";

const MAX_STORIES_PER_STORE = 5;

export const StoriesDB = {
  async listActiveGrouped(tenantId: string) {
    const now = new Date();
    const stories = await prisma.storeStory.findMany({
      where: { tenantId, active: true, expiresAt: { gt: now } },
      include: {
        store: { select: { id: true, name: true, slug: true, logo: true } },
        product: { select: { id: true, name: true, price: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by store
    const grouped = new Map<string, { store: typeof stories[0]["store"]; stories: typeof stories }>();
    for (const story of stories) {
      const existing = grouped.get(story.storeId);
      if (existing) {
        existing.stories.push(story);
      } else {
        grouped.set(story.storeId, { store: story.store, stories: [story] });
      }
    }
    return Array.from(grouped.values());
  },

  async create(tenantId: string, data: {
    storeId: string; type: string; title: string;
    imageUrl?: string | null; productId?: number | null;
    linkUrl?: string | null; expiresInHours?: number;
  }) {
    const activeCount = await prisma.storeStory.count({
      where: { tenantId, storeId: data.storeId, active: true, expiresAt: { gt: new Date() } },
    });
    if (activeCount >= MAX_STORIES_PER_STORE) {
      return { error: `Máximo ${MAX_STORIES_PER_STORE} stories activas por tienda` } as const;
    }

    const hours = data.expiresInHours ?? 24;
    const expiresAt = new Date(Date.now() + hours * 3600000);

    const story = await prisma.storeStory.create({
      data: { tenantId, storeId: data.storeId, type: data.type, title: data.title, imageUrl: data.imageUrl, productId: data.productId, linkUrl: data.linkUrl, expiresAt },
    });
    invalidateByPrefix(`stories:${tenantId}`).catch(() => {});
    logActivity("story_created", "StoreStory", data.title, story.id, "admin", undefined, tenantId).catch(() => {});
    return { data: story } as const;
  },

  async incrementView(id: string) {
    await prisma.$executeRaw`UPDATE "StoreStory" SET "viewCount" = "viewCount" + 1 WHERE id = ${id}`;
  },

  async deactivate(tenantId: string, id: string) {
    const story = await prisma.storeStory.findFirst({ where: { id, tenantId } });
    if (!story) return null;
    const updated = await prisma.storeStory.update({ where: { id }, data: { active: false } });
    invalidateByPrefix(`stories:${tenantId}`).catch(() => {});
    return updated;
  },

  async cleanupOld() {
    const cutoff = new Date(Date.now() - 7 * 86400000); // 7 days ago
    return prisma.storeStory.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  },
};
```

- [ ] **Step 2: Verify + Commit**

```bash
npx tsc --noEmit
git add lib/db/stories.db.ts
git commit -m "feat(db): add StoriesDB with grouped listing, create, cleanup"
```

---

## Task 6: Add Auth to Review Upload Endpoint

**Files:**
- Modify: `app/api/marketplace/reviews/upload/route.ts`

- [ ] **Step 1: Add requireCustomer auth**

At the top of the POST handler, add:

```typescript
import { requireCustomer } from "@/lib/auth/require-customer";

// Inside POST handler, before file processing:
const customer = await requireCustomer(req);
if (customer instanceof NextResponse) return customer;
if (!customer.customerId) {
  return NextResponse.json({ error: "Vincula tu teléfono primero" }, { status: 400 });
}
```

Keep existing rate limiting as additional protection.

- [ ] **Step 2: Verify + Commit**

```bash
npx tsc --noEmit
git add app/api/marketplace/reviews/upload/
git commit -m "fix(security): add requireCustomer auth to review photo upload"
```

---

## Task 7: API Routes — Flash Deals

**Files:**
- Create: `app/api/marketplace/flash-deals/route.ts`
- Create: `app/api/marketplace/flash-deals/featured/route.ts`
- Create: `app/api/marketplace/flash-deals/[id]/route.ts`
- Create: `app/api/cron/expire-flash-deals/route.ts`

- [ ] **Step 1: Create flash deals list + create route**

GET (public): list active deals. POST (admin): create deal.

```typescript
// app/api/marketplace/flash-deals/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { FlashDealsDB } from "@/lib/db/flash-deals.db";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { requireAdmin } from "@/lib/require-admin";
import { CreateFlashDealSchema } from "@/lib/validations/flash-deal.schema";

export async function GET(req: NextRequest) {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const storeId = new URL(req.url).searchParams.get("storeId") || undefined;
    const data = await FlashDealsDB.listActive(tenantId, storeId);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const tenantId = auth.tenantId;
    const body = await req.json();
    const parsed = CreateFlashDealSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });

    const result = await FlashDealsDB.create(tenantId, {
      ...parsed.data,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      createdBy: auth.username,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create featured route**

```typescript
// app/api/marketplace/flash-deals/featured/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { FlashDealsDB } from "@/lib/db/flash-deals.db";
import { getTenantIdFromRequest } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const data = await FlashDealsDB.listFeatured(tenantId);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create [id] route (PUT/DELETE)**

Admin can edit/deactivate deals.

- [ ] **Step 4: Create expire cron**

```typescript
// app/api/cron/expire-flash-deals/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { FlashDealsDB } from "@/lib/db/flash-deals.db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expired = await FlashDealsDB.expireAll();
    logger.info(`[expire-flash-deals] Deactivated ${expired} expired deals`);
    return NextResponse.json({ expired });
  } catch (e) {
    logger.error("[expire-flash-deals] Error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Verify + Commit**

```bash
npx tsc --noEmit
git add app/api/marketplace/flash-deals/ app/api/cron/expire-flash-deals/
git commit -m "feat(api): add flash deals CRUD + featured + expire cron"
```

---

## Task 8: API Routes — Stories

**Files:**
- Create: `app/api/marketplace/stories/route.ts`
- Create: `app/api/marketplace/stories/[id]/view/route.ts`
- Create: `app/api/cron/cleanup-stories/route.ts`

- [ ] **Step 1: Create stories list + create route**

GET (public): grouped by store. POST (admin): create story.

- [ ] **Step 2: Create view tracking route**

POST (public): increment viewCount.

- [ ] **Step 3: Create cleanup cron**

GET with CRON_SECRET: delete stories older than 7 days.

- [ ] **Step 4: Verify + Commit**

```bash
npx tsc --noEmit
git add app/api/marketplace/stories/ app/api/cron/cleanup-stories/
git commit -m "feat(api): add stories list, create, view tracking, cleanup cron"
```

---

## Task 9: API Route — Marketplace Recetas

**Files:**
- Create: `app/api/marketplace/recetas/route.ts`

- [ ] **Step 1: Create marketplace recetas endpoint**

Returns recipes with ingredients, prices, stock, and availability count.

```typescript
// app/api/marketplace/recetas/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(req: NextRequest) {
  try {
    const recetas = await prisma.receta.findMany({
      where: { activa: true },
      include: {
        ingredientes: {
          include: {
            producto: {
              select: { id: true, name: true, price: true, image: true, stock: true, unit: true, category: true, active: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = recetas.map((r) => {
      const ingredientes = r.ingredientes.map((ing) => ({
        id: ing.id,
        productoId: ing.productoId,
        cantidad: toNumOrZero(ing.cantidad),
        unidad: ing.unidad,
        nombre: ing.producto.name,
        precio: toNumOrZero(ing.producto.price),
        imagen: ing.producto.image,
        stock: ing.producto.stock ?? 0,
        disponible: ing.producto.active && (ing.producto.stock === null || ing.producto.stock > 0),
      }));

      const disponibles = ingredientes.filter((i) => i.disponible).length;
      const costoEstimado = ingredientes.filter((i) => i.disponible).reduce((sum, i) => sum + i.precio * i.cantidad, 0);

      return {
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        emoji: r.emoji,
        tiempoMinutos: r.tiempoMinutos,
        porciones: r.porciones,
        dificultad: r.dificultad,
        categoria: r.categoria,
        imageUrl: r.imageUrl,
        pasosJson: r.pasosJson,
        ingredientes,
        totalIngredientes: ingredientes.length,
        disponibles,
        costoEstimado: Math.round(costoEstimado * 100) / 100,
      };
    });

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify + Commit**

```bash
npx tsc --noEmit
git add app/api/marketplace/recetas/
git commit -m "feat(api): add marketplace recetas endpoint with availability + cost"
```

---

## Task 10: UI Components — Flash Deals

**Files:**
- Create: `components/marketplace/CountdownTimer.tsx`
- Create: `components/marketplace/FlashDealCard.tsx`
- Create: `components/marketplace/FlashDealBanner.tsx`
- Create: `components/marketplace/FlashDealBadge.tsx`
- Create: `components/marketplace/FlashDealsSection.tsx`
- Modify: `components/marketplace/UnifiedProductCard.tsx`
- Modify: `components/marketplace/MarketplaceContent.tsx`

- [ ] **Step 1: Implement CountdownTimer**

Reusable component: accepts `endsAt: Date`. Shows DD:HH:MM:SS. Colors: green > 4h, yellow > 1h, red < 1h. Updates every second via `setInterval`.

- [ ] **Step 2: Implement FlashDealCard**

Card: product image, original price struck through, deal price in red, % discount badge, CountdownTimer, progress bar (soldUnits/maxUnits), "Agregar al carrito" button.

- [ ] **Step 3: Implement FlashDealBanner**

Horizontal carousel of featured deals. Auto-scroll every 5s. Shows 1 deal at a time on mobile, 2-3 on desktop. Gradient background.

- [ ] **Step 4: Implement FlashDealBadge**

Small badge for UnifiedProductCard: "🔥 -14%" with mini countdown. Only renders if product has active flash deal.

- [ ] **Step 5: Implement FlashDealsSection**

Section "Ofertas del día" with grid of FlashDealCard. Fetches from `/api/marketplace/flash-deals`. Only renders if there are active deals.

- [ ] **Step 6: Integrate into marketplace**

Add FlashDealBanner above categories in MarketplaceContent. Add FlashDealsSection between categories and product grid. Add FlashDealBadge to UnifiedProductCard.

- [ ] **Step 7: Test in browser**

Verify timer works, banner auto-scrolls, badges appear on cards, progress bar fills.

- [ ] **Step 8: Commit**

```bash
git add components/marketplace/
git commit -m "feat(ui): add FlashDeal components — banner, cards, badges, countdown"
```

---

## Task 11: UI Components — Store Stories

**Files:**
- Create: `components/marketplace/StoreStoriesBar.tsx`
- Create: `components/marketplace/StoreStoryCircle.tsx`
- Create: `components/marketplace/StoryViewer.tsx`

- [ ] **Step 1: Implement StoreStoryCircle**

Circle with store logo/initial. Blue gradient border if has unseen stories (check localStorage `story-views:${phone}`). Gray border if all seen.

- [ ] **Step 2: Implement StoreStoriesBar**

Horizontal scrollable bar of StoreStoryCircle. Fetches from `/api/marketplace/stories`. Stores with unseen stories sorted first.

- [ ] **Step 3: Implement StoryViewer**

Fullscreen overlay: image/gradient background, title, progress bar (auto-advance 5s), tap left/right to navigate, swipe support, "Ver producto" CTA link, close button. On view: POST to `/api/marketplace/stories/[id]/view` + save to localStorage.

- [ ] **Step 4: Integrate into marketplace**

Add StoreStoriesBar at top of MarketplaceContent, above FlashDealBanner.

- [ ] **Step 5: Test in browser**

Open stories, swipe through, verify view tracking, verify unseen indicator.

- [ ] **Step 6: Commit**

```bash
git add components/marketplace/
git commit -m "feat(ui): add Store Stories — bar, circles, fullscreen viewer"
```

---

## Task 12: UI Components — Review Photos

**Files:**
- Create: `components/marketplace/ReviewPhotoUpload.tsx`
- Create: `components/marketplace/ReviewPhotoGallery.tsx`
- Create: `components/marketplace/ReviewForm.tsx`
- Modify: `components/marketplace/StoreDetail.tsx`

- [ ] **Step 1: Implement ReviewPhotoUpload**

File picker + drag & drop zone. Max 3 images. Client-side preview with thumbnails. Uploads to `/api/marketplace/reviews/upload` on select. Shows upload progress. Returns array of URLs.

- [ ] **Step 2: Implement ReviewPhotoGallery**

Grid of thumbnails (max 3). Click opens lightbox with full image. Handles `photosJson` string → parsed array of URLs.

- [ ] **Step 3: Implement ReviewForm**

Complete form: star rating (clickable), sub-ratings (quality, price, delivery), text area, ReviewPhotoUpload, submit button. Calls POST `/api/marketplace/reviews`.

- [ ] **Step 4: Add gallery to StoreDetail reviews**

In the reviews section of StoreDetail, show ReviewPhotoGallery for reviews that have `photosJson`.

- [ ] **Step 5: Test in browser**

Upload photos, submit review, verify gallery shows in store detail.

- [ ] **Step 6: Commit**

```bash
git add components/marketplace/
git commit -m "feat(ui): add ReviewForm with photo upload + ReviewPhotoGallery"
```

---

## Task 13: UI Components — Recipes Enhancement

**Files:**
- Create: `components/marketplace/RecipeCard.tsx`
- Create: `components/marketplace/RecipeIngredientList.tsx`
- Create: `components/marketplace/AddIngredientsButton.tsx`
- Modify: `components/store/RecetarioClient.tsx`

- [ ] **Step 1: Implement RecipeCard**

Card: image/gradient, emoji, name, time, servings, difficulty badge, estimated cost, availability indicator ("8/10 ingredientes disponibles").

- [ ] **Step 2: Implement RecipeIngredientList**

List of ingredients with: checkbox (checked = available), product image, name, quantity + unit, price, stock badge. Unavailable items shown grayed with "Sin stock".

- [ ] **Step 3: Implement AddIngredientsButton**

Button that uses `useCart()` context to add available ingredients. Shows confirmation: "8 productos agregados (2 sin stock)". Reuses the existing `handleAddAll` pattern from RecetarioClient.

- [ ] **Step 4: Integrate into RecetarioClient**

Replace existing recipe cards with new RecipeCard. Add RecipeIngredientList and AddIngredientsButton to recipe detail view. Fetch from new `/api/marketplace/recetas` endpoint for enriched data.

- [ ] **Step 5: Test in browser**

Navigate to recipes, verify cards show availability, add ingredients to cart, verify cart receives items.

- [ ] **Step 6: Commit**

```bash
git add components/marketplace/ components/store/RecetarioClient.tsx
git commit -m "feat(ui): enhance recipes with availability, cost, add-to-cart flow"
```

---

## Task 14: Final Integration + Cron Registration

**Files:**
- Modify: `vercel.json` (or equivalent cron config)

- [ ] **Step 1: Register cron jobs**

Add to cron configuration:

```json
{
  "crons": [
    { "path": "/api/cron/expire-flash-deals", "schedule": "0 * * * *" },
    { "path": "/api/cron/cleanup-stories", "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test
```

- [ ] **Step 3: Run lint + type check + build**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Manual E2E verification in browser**

Full flow:
1. Category images display on landing and marketplace
2. Flash deal banner shows with countdown
3. Flash deal badges on product cards
4. Store stories bar with circles at top of marketplace
5. Story viewer opens fullscreen with swipe
6. Review form with photo upload works
7. Photo gallery shows in store reviews
8. Recipes show availability and cost
9. Add ingredients to cart works

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete Ola 2 — flash deals, stories, review photos, recipes, category images"
```
