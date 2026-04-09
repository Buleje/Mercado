import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { applyRateLimit } from "@/lib/rate-limit";

function initWebPush() {
  const email = process.env.VAPID_EMAIL;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!email || !publicKey || !privateKey) return;
  webpush.setVapidDetails(email, publicKey, privateKey);
}

// POST /api/notifications/subscribe — save or update subscription
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "push-sub");
  if (rl) return rl;

  initWebPush();
  try {
    const { subscription, phone } = await req.json() as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      phone?: string;
    };
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    const tenantId = getTenantIdFromRequest(req);
    await PushSubscriptionsStore.save(tenantId, { endpoint: subscription.endpoint, keys: subscription.keys, phone });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[push/subscribe] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/notifications/subscribe – remove subscription
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json() as { endpoint: string };
    if (endpoint) await PushSubscriptionsStore.remove(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
