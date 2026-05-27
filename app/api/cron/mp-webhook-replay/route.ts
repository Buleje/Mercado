import "server-only";
import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getMercadoPagoPayment } from "@/lib/mercadopago";

/**
 * /api/cron/mp-webhook-replay
 *
 * Brandon 2026-05-18 (audit profundo arquitectura Sprint 2):
 * Reintentar webhooks de Mercado Pago marketplace que se quedaron en estado
 * "pendiente" después de >5 min. Análogo a `/api/cron/stripe-webhook-replay`
 * que ya existe para billing.
 *
 * Modelo: reutilizamos `StripeWebhookQueue` (tabla genérica) con prefix
 * `mpmkt_${dataId}` en stripeId — ver app/api/marketplace/payment/mercadopago/webhook/route.ts:85
 *
 * Criterio de "pendiente":
 *   - stripeId LIKE 'mpmkt_%'
 *   - processedAt IS NULL (todavía no se confirmó procesamiento exitoso)
 *   - createdAt < now - 5min (suficiente tiempo para que el handler termine)
 *   - attempts < MAX_ATTEMPTS
 *
 * Para cada uno: re-fetch el payment desde MP API + revalidar status +
 * actualizar la order si corresponde.
 *
 * NOTA: el handler actual de MP webhook setea `processedAt: new Date()` al
 * crear el lock (eager). Para que este cron tenga trabajo real, el handler
 * debe migrarse a `processedAt: null` al crear el lock y solo setear =now()
 * cuando TODO el flow terminó exitosamente. Mientras tanto, este cron sirve
 * como red de seguridad sin trabajo activo (idempotente, no-op).
 *
 * Schedule: cada 10 min (suficiente para no saturar MP API + cubrir fallas).
 */

const MAX_ATTEMPTS = 5;
const STALE_MINUTES = 5;
const BATCH_SIZE = 20;

async function handler() {
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  // @prisma-direct ok — query de admin/superadmin scope, busca por prefix
  // mpmkt_ del stripeId. No hay clase DB dedicada para webhook queue.
   
  const pending = await prisma.stripeWebhookQueue.findMany({
    where: {
      stripeId: { startsWith: "mpmkt_" },
      processedAt: null,
      createdAt: { lt: staleThreshold },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) {
    return NextResponse.json({ replayed: 0, message: "No pending MP webhooks" });
  }

  logger.info("[cron/mp-webhook-replay] processing batch", { count: pending.length });

  let replayed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const entry of pending) {
    const dataId = entry.stripeId.replace(/^mpmkt_/, "");
    replayed++;

    try {
      // Re-fetch payment from MP API
      const payment = await getMercadoPagoPayment(dataId);
      const status = payment.status; // approved | rejected | cancelled | pending | in_process
      const externalRef = payment.external_reference ?? "";

      // Marcar como procesado solo si el pago tiene estado terminal
      // (approved/rejected/cancelled). Pending/in_process → dejar para
      // otro replay.
      const terminal = status === "approved" || status === "rejected" || status === "cancelled";

      if (!terminal) {
        // Re-incrementar attempts pero mantener processedAt=null
         
        await prisma.stripeWebhookQueue.update({
          where: { id: entry.id },
          data: {
            attempts: { increment: 1 },
            lastError: `non-terminal status: ${status}`,
          },
        });
        continue;
      }

      // TODO Sprint 3: aquí debería hacer el flow completo del handler
      // (lookup store + update order). Por ahora marcamos como procesado
      // para evitar bucle de replay infinito en pagos que ya fueron
      // resueltos por el handler original.
      await prisma.stripeWebhookQueue.update({
        where: { id: entry.id },
        data: {
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      succeeded++;
      logger.info("[cron/mp-webhook-replay] marked terminal", {
        dataId,
        status,
        externalRef: externalRef.slice(0, 30),
      });
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
       
      await prisma.stripeWebhookQueue
        .update({
          where: { id: entry.id },
          data: {
            attempts: { increment: 1 },
            lastError: errMsg.slice(0, 500),
          },
        })
        .catch((updateErr) =>
          logger.warn("[cron/mp-webhook-replay] failed to record retry attempt", {
            entryId: entry.id,
            error: String(updateErr),
          }),
        );
      logger.warn("[cron/mp-webhook-replay] entry failed", { dataId, error: errMsg });
    }
  }

  return NextResponse.json({
    replayed,
    succeeded,
    failed,
    remaining: replayed === BATCH_SIZE ? "possibly more" : "none",
  });
}

export const GET = withCronHealth("mp-webhook-replay", handler);
