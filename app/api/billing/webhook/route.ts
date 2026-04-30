import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { constructWebhookEvent, planFromSubscription } from "@/lib/stripe";
import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import { enqueueWebhookEvent } from "@/lib/stripe-webhook-queue";

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
    // Idempotency atómica con lock por UNIQUE constraint
    // Antes: findUnique + upsert (no atómico) → 2 webhooks simultáneos
    // ambos veían null y procesaban → doble activación de plan / doble cobro.
    // Ahora: create con UNIQUE → P2002 = otro webhook ya tomó el lock.
    try {
      await prisma.stripeWebhookQueue.create({
        data: {
          stripeId: event.id,
          eventType: "stripe.processing",
          payload: JSON.stringify({ id: event.id, type: event.type }),
          attempts: 1,
          lastError: "",
          nextRetryAt: new Date(),
          processedAt: null,
        },
      });
    } catch (lockErr) {
      const code = (lockErr as { code?: string }).code;
      if (code === "P2002") {
        logger.info("[Stripe Webhook] Duplicate event skipped (locked)", {
          stripeId: event.id,
          type: event.type,
        });
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw lockErr;
    }

    await processStripeEvent(event);

    // Lock ya creado — solo actualizamos estado final.
    await prisma.stripeWebhookQueue
      .update({
        where: { stripeId: event.id },
        data: {
          eventType: event.type,
          payload: JSON.stringify(event),
          processedAt: new Date(),
        },
      })
      .catch((err) =>
        logger.error("[Stripe Webhook] mark-processed update failed", {
          stripeId: event.id,
          error: String(err),
        }),
      );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[Stripe Webhook] Handler error — queuing for retry", {
      stripeId: event.id, type: event.type, err: errorMsg,
    });
    // Liberar el lock: si processStripeEvent lanzó después de tomar el lock,
    // el cron de retry necesitará re-procesar este event sin que choque con
    // el UNIQUE constraint. Borramos solo si quedó sin processedAt.
    await prisma.stripeWebhookQueue
      .deleteMany({ where: { stripeId: event.id, processedAt: null } })
      .catch((err) => logger.warn("[Stripe Webhook] queue cleanup failed", { stripeId: event.id, err: String(err) }));
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

      // SECURITY (2026-04-29): si el tenant ya tiene un stripeCustomerId
      // distinto, BLOQUEAR — vector de privilege escalation cross-tenant
      // (atacante crea Checkout con metadata.tenantSlug=victim para regalarse
      // plan business en una tienda ajena).
      const existingTenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, stripeCustomerId: true },
      });
      if (!existingTenant) {
        logger.error("[Stripe] tenantSlug desconocido — ignorando", { tenantSlug, customerId });
        break;
      }
      if (existingTenant.stripeCustomerId && existingTenant.stripeCustomerId !== customerId) {
        logger.error("[Stripe] Cross-tenant claim attempt — customerId mismatch", {
          tenantSlug,
          existingCustomer: existingTenant.stripeCustomerId,
          incomingCustomer: customerId,
        });
        break;
      }
      // Adicional: si el customerId YA está asociado a OTRO tenant, bloquear.
      const otherClaim = await prisma.tenant.findFirst({
        where: { stripeCustomerId: customerId, NOT: { id: existingTenant.id } },
        select: { slug: true },
      });
      if (otherClaim) {
        logger.error("[Stripe] customerId ya asignado a otro tenant", {
          tenantSlug, customerId, conflictWith: otherClaim.slug,
        });
        break;
      }

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
          // ADR-084: reactivación tras pago — si el tenant había sido apagado
          // por trial expirado, garantizamos que vuelve a estar activo.
          active: true,
        },
      });
      await prisma.activityLog.create({
        data: { action: "subscription_created", entity: "tenant", entityId: tenantSlug, detail: `Plan activated: ${newPlan}`, user: "stripe-webhook", tenantId: tenantSlug },
      }).catch((err) => { logger.warn("[Stripe Webhook] activityLog create failed", { tenantSlug, error: String(err) }); });
      break;
    }

    // ── Subscription updated (upgrade / downgrade / cancel) ──
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantSlug = sub.metadata?.tenantSlug;
      if (!tenantSlug) break;

      // SECURITY: validar que el customerId del sub coincida con el del tenant
      // antes de mutar — bloquea cross-tenant claim via metadata.
      const subCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const tenantForUpd = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { stripeCustomerId: true },
      });
      if (!tenantForUpd || (tenantForUpd.stripeCustomerId && tenantForUpd.stripeCustomerId !== subCustomerId)) {
        logger.error("[Stripe] subscription.updated cross-tenant claim — ignorado", {
          tenantSlug, expected: tenantForUpd?.stripeCustomerId, got: subCustomerId,
        });
        break;
      }

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
      }).catch((err) => { logger.warn("[Stripe Webhook] activityLog create failed", { tenantSlug, error: String(err) }); });
      break;
    }

    // ── Subscription deleted → downgrade to free ─────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantSlug = sub.metadata?.tenantSlug;
      if (!tenantSlug) break;

      // SECURITY: solo downgrade si el customerId del sub coincide con el
      // del tenant — sin esto un atacante podría cancelar suscripción ajena
      // creando una sub Stripe propia con metadata.tenantSlug=victim.
      const subCustId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const tenantDel = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { stripeCustomerId: true, stripeSubscriptionId: true },
      });
      if (!tenantDel || tenantDel.stripeCustomerId !== subCustId || tenantDel.stripeSubscriptionId !== sub.id) {
        logger.error("[Stripe] subscription.deleted cross-tenant claim — ignorado", {
          tenantSlug, expectedCustomer: tenantDel?.stripeCustomerId, gotCustomer: subCustId,
          expectedSub: tenantDel?.stripeSubscriptionId, gotSub: sub.id,
        });
        break;
      }

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
      }).catch((err) => { logger.warn("[Stripe Webhook] activityLog create failed", { tenantSlug, error: String(err) }); });
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

    // ── Invoice payment failed → log + notify tenant ───
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subDetails2 = invoice.parent?.subscription_details;
      const subRef2 = subDetails2?.subscription;
      const subId = typeof subRef2 === "string" ? subRef2 : subRef2?.id;
      if (!subId) break;

      const failedTenant = await prisma.tenant.findFirst({
        where: { stripeSubscriptionId: subId },
        select: { id: true, slug: true, plan: true },
      });

      logger.warn("[Stripe] Payment failed for subscription", { subId, tenant: failedTenant?.slug });

      if (failedTenant) {
        await prisma.activityLog.create({
          data: {
            action: "payment_failed",
            entity: "tenant",
            entityId: failedTenant.slug,
            detail: `Pago fallido para suscripción ${subId}. Stripe reintentará automáticamente.`,
            user: "stripe-webhook",
            tenantId: failedTenant.slug,
          },
        }).catch((err) => { logger.warn("[Stripe Webhook] activityLog payment_failed failed", { tenantSlug: failedTenant.slug, error: String(err) }); });
      }
      break;
    }

    default:
      // Unhandled event type — ignore silently
      break;
  }
}
