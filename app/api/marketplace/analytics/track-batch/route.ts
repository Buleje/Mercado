import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductAnalyticsDB } from "@/lib/db/product-analytics.db";
import { checkEdgeRateLimit } from "@/lib/middleware-utils";
import { logger } from "@/lib/logger";
import { resolveMarketplaceTenant } from "@/lib/auth/resolve-marketplace-tenant";

/**
 * POST /api/marketplace/analytics/track-batch
 *
 * Recibe un batch de eventos del hook `useProductAnalyticsTracking`
 * (ProductDetailClient + cards). Cada evento se persiste en
 * ProductAnalytics vía UPSERT diario.
 *
 * Hook envía con `navigator.sendBeacon` (no bloquea navegación) o
 * fetch keepalive — sin esperar response.
 *
 * Reglas:
 *   - Sin auth (público), pero rate-limited 60 req/min por IP.
 *   - Max 50 eventos por batch.
 *   - Body inválido = 400 silencioso (cliente no maneja la respuesta).
 *   - Tenant resuelto desde header `x-tenant-id` (set por proxy.ts).
 *
 * Mapeo de tipos: el hook usa snake_case (`add_to_cart`), la DB usa
 * camelCase (`addToCart`). Convertimos acá.
 */

// In-memory rate limiter — 60 req/min por IP
const rlStore = new Map<string, { count: number; resetAt: number }>();

const EventSchema = z.object({
  productId: z.number().int().positive(),
  eventType: z.enum(["view", "click", "add_to_cart", "conversion"]),
  timestamp: z.number().optional(),
  revenue: z.number().nonnegative().optional(),
});

const BodySchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

const TYPE_MAP = {
  view:         "view" as const,
  click:        "click" as const,
  add_to_cart:  "addToCart" as const,
  conversion:   "conversion" as const,
};

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkEdgeRateLimit(rlStore, ip, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tenantId = resolveMarketplaceTenant(req, { context: "marketplace/analytics/track-batch" });
  const { events } = parsed.data;

  // Persistir en paralelo. Errores individuales se logean pero no rompen el batch.
  const results = await Promise.allSettled(
    events.map((e) =>
      ProductAnalyticsDB.track(tenantId, e.productId, TYPE_MAP[e.eventType], e.revenue),
    ),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length > 0) {
    logger.warn("[analytics/track-batch] some events failed", {
      tenantId,
      failed: failures.length,
      total: events.length,
      sampleErrors: failures.slice(0, 3).map((f) => String(f.reason).slice(0, 300)),
    });
  }
  const failed = failures.length;

  return NextResponse.json({ ok: true, persisted: events.length - failed, failed });
}
