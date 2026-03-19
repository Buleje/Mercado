import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { constructWebhookEvent, planFromSubscription } from "@/lib/stripe";
import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import { enqueueWebhookEvent } from "@/lib/stripe-webhook-queue";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/webhook
//
// Design: receive → verify signature → process inline → on DB failure, enqueue
// the event and return 200 so Stripe does NOT add its own retries on top of
// ours. A cron job at /api/billing/webhook-replay drains the queue with
// exponential back-off.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = Buffer.from(await req.arrayBuffer());
    event = constructWebhookEvent(rawBody, sig);
  } catch (err) {
    logger.error("[Stripe Webhook] Signature verification failed", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: `Webhook error: ${err instanceof Error ? err.message : "Webhook error"}` }, { status: 400 });
  }

  try {
    // Idempotency: skip if this Stripe event was already processed
    const alreadyProcessed = await prisma.stripeWebhookQueue.findUnique({
      where: { stripeId: event.id },
      select: { processedAt: true },
    }).catch(() => null);
    if (alreadyProcessed?.processedAt) {
      logger.info("[Stripe Webhook] Duplicate event skipped", { stripeId: event.id, type: event.type });
      return NextResponse.json({ received: true, duplicate: true });
    }

    await processStripeEvent(event);

    // Mark as processed for future deduplication
    await prisma.stripeWebhookQueue.upsert({
      where: { stripeId: event.id },
      create: {
        stripeId: event.id,
        eventType: event.type,
        payload: JSON.stringify(event),
        attempts: 1,
        lastError: "",
        nextRetryAt: new Date(),
        processedAt: new Date(),
      },
      update: { processedAt: new Date() },
    }).catch(() => {});
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[Stripe Webhook] Handler error — queuing for retry", {
      stripeId: event.id, type: event.type, err: errorMsg,
    });
    // Persist failed event and return 200: Stripe will NOT retry on its own,
    // our cron will replay it with exponential back-off.
    await enqueueWebhookEvent(event, errorMsg);
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported so the replay endpoint can reuse the same logic.
// ─────────────────────────────────────────────────────────────────────────────
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    // ── Checkout completed → activate subscription ────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const tenantSlug = session.metadata?.tenantSlug;
      if (!tenantSlug) break;

      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      const sub = await import("./stripe-sub-helper").then((m) =>
        m.fetchSubscription(subscriptionId)
      );

      const newPlan = planFromSubscription(sub);
      await prisma.tenant.update({
        where: { slug: tenantSlug },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: sub.items.data[0]?.price.id ?? null,
          stripeCurrentPeriodEnd: sub.items.data[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000)
            : null,
          plan: newPlan,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
      await prisma.activityLog.create({
        data: { action: "subscription_created", entity: "tenant", entityId: tenantSlug, detail: `Plan activated: ${newPlan}`, user: "stripe-webhook", tenantId: tenantSlug },
      }).catch(() => {});
      break;
    }

    // ── Subscription updated (upgrade / downgrade / cancel) ──
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantSlug = sub.metadata?.tenantSlug;
      if (!tenantSlug) break;

      const updatedPlan = planFromSubscription(sub);
      await prisma.tenant.update({
        where: { slug: tenantSlug },
        data: {
          stripePriceId: sub.items.data[0]?.price.id ?? null,
          stripeCurrentPeriodEnd: sub.items.data[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000)
            : null,
          plan: updatedPlan,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
      await prisma.activityLog.create({
        data: { action: "plan_changed", entity: "tenant", entityId: tenantSlug, detail: `Plan updated to: ${updatedPlan}${sub.cancel_at_period_end ? " (canceling)" : ""}`, user: "stripe-webhook", tenantId: tenantSlug },
      }).catch(() => {});
      break;
    }

    // ── Subscription deleted → downgrade to free ─────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantSlug = sub.metadata?.tenantSlug;
      if (!tenantSlug) break;

      await prisma.tenant.update({
        where: { slug: tenantSlug },
        data: {
          plan: "free",
          stripeSubscriptionId: null,
          stripePriceId: null,
          stripeCurrentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      });
      await prisma.activityLog.create({
        data: { action: "subscription_canceled", entity: "tenant", entityId: tenantSlug, detail: "Subscription deleted, downgraded to free", user: "stripe-webhook", tenantId: tenantSlug },
      }).catch(() => {});
      break;
    }

    // ── Invoice paid → refresh period end ────────────
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subDetails = invoice.parent?.subscription_details;
      const subRef = subDetails?.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (!subId) break;

      const tenant = await prisma.tenant.findFirst({
        where: { stripeSubscriptionId: subId },
      });
      if (!tenant) break;

      const sub = await import("./stripe-sub-helper").then((m) =>
        m.fetchSubscription(subId)
      );

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          stripeCurrentPeriodEnd: sub.items.data[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000)
            : null,
          plan: planFromSubscription(sub),
        },
      });
      break;
    }

    // ── Invoice payment failed → log ──────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subDetails2 = invoice.parent?.subscription_details;
      const subRef2 = subDetails2?.subscription;
      const subId = typeof subRef2 === "string" ? subRef2 : subRef2?.id;
      if (!subId) break;
      logger.warn("[Stripe] Payment failed for subscription", { subId });
      break;
    }

    default:
      // Unhandled event type — ignore silently
      break;
  }
}
