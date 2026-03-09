export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

// POST /api/notifications/subscribe â€” save or update subscription
export async function POST(req: NextRequest) {
  try {
    const { subscription, phone } = await req.json() as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      phone?: string;
    };
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    PushSubscriptionsStore.save({ endpoint: subscription.endpoint, keys: subscription.keys, phone });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[push/subscribe] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/notifications/subscribe â€” remove subscription
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json() as { endpoint: string };
    if (endpoint) PushSubscriptionsStore.remove(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
