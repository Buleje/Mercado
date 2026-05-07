/**
 * Stripe Webhook Queue
 *
 * When the DB is temporarily unavailable during webhook processing, we persist
 * the raw Stripe event here and return HTTP 200 to Stripe (preventing their
 * own aggressive retry schedule from hammering a recovering DB).
 *
 * A cron endpoint — POST /api/billing/webhook-replay — drains the queue with
 * exponential back-off.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import type Stripe from "stripe";

/** Backoff delays (ms) per attempt index: 1 min, 5 min, 15 min, 1 h, 6 h */
const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];

function nextRetry(attempts: number): Date {
  const delayMs = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
  return new Date(Date.now() + delayMs);
}

/** Persist a failed event for later replay. Returns true if queued successfully. */
export async function enqueueWebhookEvent(event: Stripe.Event, error: string): Promise<boolean> {
  try {
    await prisma.stripeWebhookQueue.upsert({
      where: { stripeId: event.id },
      create: {
        stripeId: event.id,
        eventType: event.type,
        payload: JSON.stringify(event),
        attempts: 1,
        lastError: error,
        nextRetryAt: nextRetry(1),
      },
      update: {
        attempts: { increment: 1 },
        lastError: error,
        nextRetryAt: nextRetry(1),
        processedAt: null,
      },
    });
    logger.warn("[webhook-queue] Event queued for retry", { stripeId: event.id, type: event.type });
    return true;
  } catch (e) {
    logger.error("[webhook-queue] Failed to queue event — event may be lost", {
      stripeId: event.id,
      err: e instanceof Error ? e.message : String(e),
    });
    reportCriticalError(e instanceof Error ? e : new Error(String(e)), {
      module: "billing",
      tags: { operation: "webhook-queue-enqueue-event" },
      extra: { stripeId: event.id, eventType: event.type },
    });
    return false;
  }
}

/** Mark a queued event as successfully processed. */
export async function markWebhookProcessed(stripeId: string): Promise<void> {
  await prisma.stripeWebhookQueue.update({
    where: { stripeId },
    data: { processedAt: new Date() },
  });
}

/** Fetch up to `limit` events that are due for retry and not yet processed. */
export async function getPendingWebhookEvents(limit = 10) {
  // SECURITY 2026-05-05 (audit Stripe #10): TTL >7d filter. Antes los
  // eventos en cola se replayban indefinidamente — un evento de hace meses
  // podía reaparecer y generar inconsistencias (ej. activar plan de un
  // tenant ya cancelado). 7 días alinea con la ventana de retry de Stripe.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.stripeWebhookQueue.findMany({
    where: {
      processedAt: null,
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 6 }, // give up after 6 failed attempts (~6 hours total)
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
}

/** Update a queued event after a failed replay attempt. */
export async function recordReplayFailure(id: string, attempts: number, error: string, eventType?: string): Promise<void> {
  await prisma.stripeWebhookQueue.update({
    where: { id },
    data: {
      attempts: { increment: 1 },
      lastError: error,
      nextRetryAt: nextRetry(attempts + 1),
    },
  });

  // SECURITY 2026-05-05 (audit webhooks #9): tras 6 intentos fallidos el
  // evento queda en dead-letter sin alertar a nadie. Ahora escalamos a Sentry
  // con tag webhook-dead-letter para que oncall pueda intervenir manualmente.
  if (attempts + 1 >= 6) {
    reportCriticalError(
      new Error(`Stripe webhook dead-letter: ${eventType ?? "unknown"} (id=${id}) tras ${attempts + 1} intentos. Ultimo error: ${error}`),
      {
        module: "billing",
        tags: { operation: "webhook-dead-letter" },
        extra: { webhookQueueId: id, attempts: attempts + 1, lastError: error, eventType: eventType ?? "unknown" },
      },
    );
  }
}
