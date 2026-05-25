import { NextRequest, NextResponse } from "next/server";
import { ProductAnalyticsDB } from "@/lib/db/product-analytics.db";
import { checkEdgeRateLimit } from "@/lib/middleware-utils";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { resolveMarketplaceTenant } from "@/lib/auth/resolve-marketplace-tenant";

const BodySchema = z.object({
  metric: z.enum(["view", "click", "addToCart", "conversion"]),
  revenue: z.number().positive().optional(),
});

// Rate limiter in-memory: 100 req/min por IP
const trackRlStore = new Map<string, { count: number; resetAt: number }>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const productId = parseInt(idStr, 10);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    // Rate limit por IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const allowed = checkEdgeRateLimit(trackRlStore, ip, 100, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    const body = await req.json().catch((err) => { logger.error("[marketplace/products/[id]/analytics/track] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const tenantId = resolveMarketplaceTenant(req, { context: "marketplace/products/X/analytics/track" });
    const { metric, revenue } = parsed.data;

    // Fire-and-forget
    ProductAnalyticsDB.track(tenantId, productId, metric, revenue).catch((err) => logger.error("[marketplace/products/[id]/analytics/track] operation failed", { error: String(err), tenantId }));

    return NextResponse.json({ ok: true });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
