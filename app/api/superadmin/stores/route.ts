import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

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

  // Count real products per tenant in a single query (was N+1 — TD-027).
  // Uses OR(id, slug) because some products have tenantId as slug instead of CUID.
  const tenantIdentifiers = storesRaw.flatMap((s) => [s.tenant.id, s.tenant.slug]);

  const productCounts = await prisma.product.groupBy({
    by: ["tenantId"],
    where: {
      deletedAt: null,
      tenantId: { in: tenantIdentifiers },
    },
    _count: { id: true },
  });

  const countMap = new Map<string, number>();
  for (const row of productCounts) {
    countMap.set(row.tenantId, row._count.id);
  }

  const stores = storesRaw.map((store) => {
    const count =
      (countMap.get(store.tenant.id) ?? 0) +
      (countMap.get(store.tenant.slug) ?? 0);
    return { ...store, _count: { products: count } };
  });

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
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status:401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch((err) => { logger.error("[superadmin/stores] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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

  // Notify store owner via WhatsApp when their store gets published
  if (data.isPublished === true) {
    (async () => {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: store.tenantId },
          select: { ownerPhone: true, name: true },
        });
        const ownerPhone = tenant?.ownerPhone;
        if (ownerPhone) {
          const msg = [
            `🎉 *¡Tu tienda fue aprobada!*`,
            ``,
            `Hola 👋, tu tienda *${store.name}* ya está visible en el Marketplace.`,
            ``,
            `✅ Los clientes pueden encontrarte y hacer pedidos`,
            `📦 Asegúrate de tener tus productos actualizados`,
            `💰 Los pedidos llegarán directo a tu panel`,
            ``,
            `¡Éxitos con tus ventas! 🚀`,
            ``,
            `─────`,
            `Buleje 🏪`,
          ].join("\n");
          await sendWhatsAppQueued(ownerPhone, msg, { tenantId: store.tenantId, context: "store-published-notify" });
        }
      } catch (e) {
        logger.warn("[superadmin/stores] WhatsApp notification failed", { error: String(e) });
      }
    })().catch((err) => logger.error("[superadmin/stores] operation failed", { error: String(err) }));
  }

  return NextResponse.json({ store });
}
