import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";
import { requireCustomer } from "@/lib/auth/require-customer";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// ── Schema ────────────────────────────────────────────────────────────────────

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

// ── POST /api/marketplace/push/subscribe ──────────────────────────────────────
// Saves the browser push subscription for the authenticated customer.
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "mkt-push-sub");
  if (rl) return rl;

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Suscripcion invalida", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { subscription } = parsed.data;

    await PushSubscriptionsStore.save(customer.tenantId, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      phone: customer.customerId,
    });

    logger.info("[PUSH] Customer subscribed", {
      phone: customer.customerId,
      tenantId: customer.tenantId,
      endpoint: subscription.endpoint.slice(0, 60),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[PUSH] Subscribe error", { err });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// ── DELETE /api/marketplace/push/subscribe ─────────────────────────────────────
// Removes the push subscription when the customer opts out.
export async function DELETE(req: NextRequest) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  try {
    const { endpoint } = (await req.json().catch(() => ({}))) as {
      endpoint?: string;
    };
    if (endpoint) {
      await PushSubscriptionsStore.remove(endpoint);
      logger.info("[PUSH] Customer unsubscribed", {
        phone: customer.customerId,
        tenantId: customer.tenantId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
