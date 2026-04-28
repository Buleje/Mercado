import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { invalidateByPrefix } from "@/lib/cache";
import { getCategoryOrder, setCategoryOrder } from "@/lib/store-category-order";
import { logger } from "@/lib/logger";

/**
 * GET/PUT /api/superadmin/stores/[slug]/category-order
 *
 * Versión platform-level: permite al superadmin reordenar categorías
 * de cualquier tienda. Mismo storage compartido que el endpoint del admin
 * (lib/data/store-category-orders.json) — el último que guarda gana.
 */

const PutSchema = z.object({
  order: z.array(z.string().min(1).max(80)).max(200),
});

async function authGuard(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const denied = await authGuard(req);
  if (denied) return denied;
  try {
    const { slug } = await params;
    const order = await getCategoryOrder(slug);
    return NextResponse.json({ order, storeSlug: slug });
  } catch (err) {
    logger.error("[superadmin/stores/category-order GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const denied = await authGuard(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { slug } = await params;
    await setCategoryOrder(slug, parsed.data.order);
    invalidateByPrefix(`marketplace:store:${slug}`);
    return NextResponse.json({ ok: true, storeSlug: slug, order: parsed.data.order });
  } catch (err) {
    logger.error("[superadmin/stores/category-order PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
