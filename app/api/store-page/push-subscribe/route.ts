import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/store-page/push-subscribe — opt-in de notificaciones push del
 * STOREFRONT (Brandon 2026-06-28, audit #8). A diferencia del endpoint de
 * marketplace (que exige cliente logueado), éste es PÚBLICO: guarda la
 * suscripción del visitante de /t/<slug> resolviendo el tenant por slug. No
 * requiere migración — PushSubscription ya es tenant-scoped (sin customerId).
 * CSRF por cookie (proxy.ts la setea en cada respuesta) + rate-limit.
 */
const Body = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "store-push-sub");
  if (rl) return rl;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  const { slug, subscription } = parsed.data;

  const tenant = await findTenantByIdOrSlug(slug);
  if (!tenant || tenant.active === false) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  try {
    await PushSubscriptionsStore.save(tenant.id, { endpoint: subscription.endpoint, keys: subscription.keys });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[store-push-subscribe] save error", { err: e instanceof Error ? e.message : String(e), tenantId: tenant.id });
    return NextResponse.json({ error: "No se pudo guardar la suscripción" }, { status: 503 });
  }
}
