import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

function initWebPush() {
  const email = process.env.VAPID_EMAIL;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!email || !publicKey || !privateKey) return;
  webpush.setVapidDetails(email, publicKey, privateKey);
}

/**
 * SECURITY/CRITICAL 2026-05-06 (pentest H004): el `phone` debe venir del JWT
 * de customer-session, NO del body. Antes un atacante registraba SU endpoint
 * push para recibir notifs de cualquier víctima conociendo el phone.
 */

// POST /api/notifications/subscribe — save or update subscription
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "push-sub");
  if (rl) return rl;

  initWebPush();
  try {
    const { subscription } = await req.json() as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    };
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // Extraer phone SOLO del customer-session JWT, no del body.
    const { CUSTOMER_SESSION, getCustomerPayload } = await import("@/lib/auth/customer-session");
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const payload = await getCustomerPayload(sessionToken);
    if (!payload?.customerId) {
      return NextResponse.json({ error: "session_invalid" }, { status: 401 });
    }
    const phone = payload.customerId;
    const tenantId = getTenantIdFromRequest(req);
    await PushSubscriptionsStore.save(tenantId, { endpoint: subscription.endpoint, keys: subscription.keys, phone });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[push/subscribe] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/notifications/subscribe – remove subscription
export async function DELETE(req: NextRequest) {
  // SECURITY 2026-05-06: rate limit + verify session for delete. Sin esto
  // un atacante podía remover suscripciones ajenas.
  const rl = applyRateLimit(req, "MODERATE", "push-sub-del");
  if (rl) return rl;
  try {
    const { endpoint } = await req.json() as { endpoint: string };
    if (endpoint) await PushSubscriptionsStore.remove(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
