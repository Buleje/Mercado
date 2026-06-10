/**
 * POST /api/billing/webhook-replay
 *
 * Drains the StripeWebhookQueue — replays events that previously failed due to
 * transient DB errors. Meant to be called by a Vercel Cron Job (or similar)
 * every 5–10 minutes.
 *
 * Security: requires the `Authorization: Bearer <CRON_SECRET>` header.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { timingSafeCompare } from "@/lib/timing-safe";
import {
  getPendingWebhookEvents,
  markWebhookProcessed,
  recordReplayFailure,
} from "@/lib/stripe-webhook-queue";
import { processStripeEvent } from "@/app/api/billing/webhook/route";
import type Stripe from "stripe";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler("billing-webhook-replay", async (req: NextRequest) => {
  // ── Auth ─────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (!auth || !timingSafeCompare(auth, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch pending events ──────────────────────────────
  const pending = await getPendingWebhookEvents(10);
  if (pending.length === 0) {
    return NextResponse.json({ replayed: 0, message: "Queue empty" });
  }

  let succeeded = 0;
  let failed = 0;

  for (const record of pending) {
    let event: Stripe.Event;
    try {
      event = JSON.parse(record.payload) as Stripe.Event;
    } catch {
      logger.error("[webhook-replay] Corrupt payload in queue", { id: record.id, stripeId: record.stripeId });
      await recordReplayFailure(record.id, record.attempts, "Corrupt payload — cannot parse JSON");
      failed++;
      continue;
    }

    // SECURITY 2026-05-05 (audit webhooks #5): defense-in-depth.
    // Solo replay si el record viene de un enqueue genuino (eventType
    // empieza con "stripe."). Si alguien con acceso a DB inyecta un payload
    // con eventType arbitrario, lo descartamos. La firma original ya fue
    // validada en el handler primario (`webhook/route.ts`) antes del enqueue.
    if (!event.id || event.id !== record.stripeId) {
      logger.warn("[webhook-replay] stripeId mismatch — payload tampered?", {
        id: record.id, recordStripeId: record.stripeId, payloadId: event.id,
      });
      await recordReplayFailure(record.id, record.attempts, "stripeId mismatch — possible tampering");
      failed++;
      continue;
    }

    try {
      await processStripeEvent(event);
      await markWebhookProcessed(record.stripeId);
      logger.info("[webhook-replay] Event replayed successfully", {
        stripeId: record.stripeId, type: record.eventType,
      });
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn("[webhook-replay] Replay attempt failed", {
        stripeId: record.stripeId, attempts: record.attempts + 1, err: errorMsg,
      });
      reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
        module: "billing",
        tags: { operation: "webhook-replay-process-event" },
        extra: { stripeId: record.stripeId, eventType: record.eventType, attempts: record.attempts + 1 },
      });
      await recordReplayFailure(record.id, record.attempts, errorMsg);
      failed++;
    }
  }

  return NextResponse.json({ replayed: succeeded, failed, total: pending.length });
});
