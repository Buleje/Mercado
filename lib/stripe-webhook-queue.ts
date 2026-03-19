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
  return prisma.stripeWebhookQueue.findMany({
    where: {
      processedAt: null,
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 6 }, // give up after 6 failed attempts (~6 hours total)
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
}

/** Update a queued event after a failed replay attempt. */
export async function recordReplayFailure(id: string, attempts: number, error: string): Promise<void> {
  await prisma.stripeWebhookQueue.update({
    where: { id },
    data: {
      attempts: { increment: 1 },
      lastError: error,
      nextRetryAt: nextRetry(attempts + 1),
    },
  });
}
