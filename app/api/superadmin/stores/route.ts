import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { sendWelcomeTenant } from "@/lib/email/resend";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

/**
 * Lógica completa del listado de stores con product counts, cacheada via
 * Next 16 "use cache". Antes: 1 findMany + 1 groupBy + N+1 mapping (~3s).
 * 60s revalidate, 30s stale OK, 5 min hard expire. Invalidable con
 * invalidate("superadmin:stores") tras crear/borrar/publicar store.
 */
async function getStoresData() {
  "use cache";
  cacheLife({ revalidate: 60, stale: 30, expire: 300 });
  cacheTag("superadmin:stores");

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

  // displayTier vive fuera del schema Prisma → patch por raw SQL (mismo patrón
  // que cover/hoursJson en initial-stores). Permite mostrar/editar el nivel
  // de beneficio de cada tienda desde superadmin.
  const tierMap = new Map<string, string>();
  const benefitsMap = new Map<string, Record<string, boolean>>();
  try {
    const tierRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; displayTier: string | null; benefits: Record<string, boolean> | null }>
    >(`SELECT id, "displayTier", benefits FROM "Store"`);
    for (const r of tierRows) {
      tierMap.set(r.id, r.displayTier ?? "standard");
      benefitsMap.set(r.id, (r.benefits ?? {}) as Record<string, boolean>);
    }
  } catch {
    /* columnas ausentes → defaults */
  }

  const stores = storesRaw.map((store) => {
    const count =
      (countMap.get(store.tenant.id) ?? 0) +
      (countMap.get(store.tenant.slug) ?? 0);
    return {
      ...store,
      _count: { products: count },
      displayTier: tierMap.get(store.id) ?? "standard",
      benefits: benefitsMap.get(store.id) ?? {},
    };
  });

  return stores;
}

// GET /api/superadmin/stores
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stores = await getStoresData();
  return NextResponse.json({ stores });
}

// PATCH /api/superadmin/stores — update individual store fields
const PatchSchema = z.object({
  storeId: z.string().min(1),
  isPublished: z.boolean().optional(),
  commission: z.number().min(0).max(100).optional(),
  category: z.string().min(1).optional(),
  zone: z.string().optional(),
  // Nivel de visibilidad en /tiendas (beneficio controlado por superadmin).
  displayTier: z.enum(["standard", "featured", "premium"]).optional(),
  // Beneficios por tienda — parcial (se mergea con los existentes en JSONB).
  benefits: z
    .object({
      verified: z.boolean(),
      searchBoost: z.boolean(),
      featuredHome: z.boolean(),
      ownBanner: z.boolean(),
      reducedCommission: z.boolean(),
      featuredProducts: z.boolean(),
      prioritySupport: z.boolean(),
      advancedAnalytics: z.boolean(),
    })
    .partial()
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-stores"); if (_rl) return _rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
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

  // displayTier vive fuera del schema Prisma (columna parcheada en DB, mismo
  // patrón que cover/hoursJson) → update por raw SQL parametrizado. Invalida
  // el cache de /tiendas para que el cambio se refleje al instante.
  if (data.displayTier !== undefined) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Store" SET "displayTier" = $1 WHERE id = $2`,
      data.displayTier,
      storeId,
    );
    revalidateTag("marketplace:stores", "max");
  }

  // Beneficios: merge JSONB (solo las claves enviadas se sobreescriben).
  if (data.benefits !== undefined) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Store" SET benefits = COALESCE(benefits, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify(data.benefits),
      storeId,
    );
    revalidateTag("marketplace:stores", "max");
  }

  // Notify store owner via WhatsApp + email when their store gets published.
  // Ambos canales son fire-and-forget: el HTTP response no espera el envio.
  if (data.isPublished === true) {
    (async () => {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: store.tenantId },
          select: { ownerPhone: true, ownerEmail: true, name: true, slug: true },
        });
        const ownerPhone = tenant?.ownerPhone;
        const ownerEmail = tenant?.ownerEmail;

        // WhatsApp — canal primario en Peru.
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

        // Email — registro persistente con CTAs clickeables. Solo si tiene
        // ownerEmail configurado (no se pide en el form de registro).
        if (ownerEmail && tenant) {
          await sendWelcomeTenant(ownerEmail, { name: tenant.name, slug: tenant.slug });
        }
      } catch (e) {
        logger.warn("[superadmin/stores] post-approval notification failed", { error: String(e) });
      }
    })().catch((err) => logger.error("[superadmin/stores] operation failed", { error: String(err) }));
  }

  return NextResponse.json({ store });
}
