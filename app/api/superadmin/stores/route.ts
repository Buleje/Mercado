import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET /api/superadmin/stores
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const storesRaw = await prisma.store.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      logo: true,
      banner: true,
      description: true,
      isPublished: true,
      rating: true,
      reviewCount: true,
      category: true,
      zone: true,
      commission: true,
      createdAt: true,
      tenant: {
        select: { id: true, slug: true, name: true, plan: true, active: true },
      },
    },
  });

  // Count real products (Product table) per tenant — NOT StoreProduct intermediate
  // rows. This matches what the per-tenant admin inventory tab shows.
  // Uses an OR(id, slug) lookup so it works whether Product.tenantId stores the
  // canonical CUID or the slug (mismatch is being normalized in a separate fix).
  const stores = await Promise.all(
    storesRaw.map(async (store) => {
      const productCount = await prisma.product.count({
        where: {
          deletedAt: null,
          OR: [
            { tenantId: store.tenant.id },
            { tenantId: store.tenant.slug },
          ],
        },
      });
      return { ...store, _count: { products: productCount } };
    })
  );

  return NextResponse.json({ stores });
}

// PATCH /api/superadmin/stores — update individual store fields
const PatchSchema = z.object({
  storeId: z.string().min(1),
  isPublished: z.boolean().optional(),
  commission: z.number().min(0).max(100).optional(),
  category: z.string().min(1).optional(),
  zone: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });

  const { storeId, ...data } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.isPublished !== undefined) updateData.isPublished = data.isPublished;
  if (data.commission !== undefined) updateData.commission = data.commission;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.zone !== undefined) updateData.zone = data.zone;

  const store = await prisma.store.update({
    where: { id: storeId },
    data: updateData,
  });

  return NextResponse.json({ store });
}
