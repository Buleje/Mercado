import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import webpush from "web-push";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CUSTOMER_SESSION, getCustomerPayload } from "@/lib/auth/customer-session";

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

// F2: allowlist de prefijos push conocidos — rechaza endpoints arbitrarios
const ALLOWED_PUSH_PREFIXES = [
  "https://fcm.googleapis.com/",
  "https://updates.push.services.mozilla.com/",
  "https://web.push.apple.com/",
  "https://wns2-", // Microsoft WNS
];

const PushSubSchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine(
      (url) => ALLOWED_PUSH_PREFIXES.some((p) => url.startsWith(p)),
      "Endpoint push no permitido"
    ),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// POST /api/notifications/subscribe — save or update subscription
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "push-sub");
  if (rl) return rl;

  initWebPush();
  try {
    // F1: auth requerida en POST también (ya existía, ahora con import estático)
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const payload = await getCustomerPayload(sessionToken);
    if (!payload?.customerId) {
      return NextResponse.json({ error: "session_invalid" }, { status: 401 });
    }

    // F2: validar body con schema Zod (allowlist endpoint)
    const rawBody = await req.json();
    const parsed = PushSubSchema.safeParse(rawBody?.subscription ?? rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { endpoint, keys } = parsed.data;
    const phone = payload.customerId;
    const tenantId = getTenantIdFromRequest(req);
    await PushSubscriptionsStore.save(tenantId, { endpoint, keys, phone });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[push/subscribe] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/notifications/subscribe – remove subscription
export async function DELETE(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "push-sub-del");
  if (rl) return rl;

  // F1: auth requerida — sin esto cualquiera borra subs ajenas con el endpoint URL
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
  if (!session?.customerId) {
    return NextResponse.json({ error: "Auth requerida" }, { status: 401 });
  }

  try {
    const body = await req.json() as { endpoint?: string };
    const endpoint = body?.endpoint;
    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json({ error: "endpoint requerido" }, { status: 400 });
    }

    // F1: verificar que el endpoint pertenece a este customer+tenant
    const tenantId = getTenantIdFromRequest(req);
    const subs = await PushSubscriptionsStore.getByPhone(session.customerId, tenantId);
    const owned = subs.some((s) => s.endpoint === endpoint);
    if (!owned) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await PushSubscriptionsStore.remove(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
