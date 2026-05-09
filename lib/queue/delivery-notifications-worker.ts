import "server-only";

/**
 * lib/queue/delivery-notifications-worker.ts
 *
 * Worker BullMQ para notificaciones de delivery al cliente final.
 * Escucha eventos de dominio `DeliveryTrackingAdded` y dispara WhatsApp
 * usando los templates de `lib/integrations/whatsapp-delivery-templates.ts`.
 *
 * Contrato:
 * - At-least-once delivery → todo handler debe ser idempotente
 * - Respeta feature flag `delivery-live-whatsapp` (si está off, ignora jobs)
 * - Logger estructurado + Sentry reportCriticalError en fallos críticos
 * - Rate limit por tenant para evitar spam al cliente
 *
 * Se registra en lib/queue/workers.ts cuando el worker process arranca:
 *   import { registerDeliveryNotificationsWorker } from "./delivery-notifications-worker";
 *   registerDeliveryNotificationsWorker(connection);
 */

import type { Worker as WorkerType, Job } from "bullmq";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { enqueueNotification } from "./queues";
import {
  deliveryNearbyMessage,
  deliveryDeliveredMessage,
  deliveryFailedMessage,
  deliveryPickedUpMessage,
  buildTrackingUrl,
  firstNameOnly,
} from "@/lib/integrations/whatsapp-delivery-templates";
import { prisma } from "@/lib/prisma";

export const DELIVERY_NOTIFICATIONS_QUEUE = "delivery-notifications";

/**
 * Job data que entra a la cola. Se enqueue desde `DeliveryTrackingDB.add()`
 * cuando el status es 'nearby', 'delivered', 'failed' o 'picked_up'.
 */
export interface DeliveryNotificationJob {
  /** Type guard para el switch */
  event: "nearby" | "delivered" | "failed" | "picked_up";
  tenantId: string;
  orderId: string;
  /** Status del tracking event que originó el job (para debug/idempotency) */
  triggeredBy: string;
  /** ETA en minutos (solo para 'nearby') */
  etaMinutes?: number;
  /** Razón del fallo (solo para 'failed') */
  failureReason?: string;
  /** Job ID idempotente — repetir no causa duplicate send */
  idempotencyKey: string;
}

/**
 * Registra el worker en el proceso de BullMQ.
 * Se llama desde lib/queue/workers.ts junto a los otros workers.
 */
export function registerDeliveryNotificationsWorker(
  connection: unknown,
): WorkerType<DeliveryNotificationJob> | null {
  // Runtime require para evitar bundling de bullmq por Turbopack
  let WorkerClass: new (
    name: string,
    processor: (job: Job<DeliveryNotificationJob>) => Promise<void>,
    opts: unknown,
  ) => WorkerType<DeliveryNotificationJob>;

  try {
    const runtimeRequire = globalThis.Function("return require")() as (id: string) => unknown;
    const bullmq = runtimeRequire("bullmq") as {
      Worker: typeof WorkerClass;
    };
    WorkerClass = bullmq.Worker;
  } catch (e) {
    logger.warn("[worker/delivery-notifications] bullmq not available — worker not registered", { err: e instanceof Error ? e.message : String(e) });
    return null;
  }

  const worker = new WorkerClass(
    DELIVERY_NOTIFICATIONS_QUEUE,
    async (job: Job<DeliveryNotificationJob>) => {
      const { event, tenantId, orderId, idempotencyKey } = job.data;
      const logMeta = {
        jobId: job.id,
        event,
        tenantId,
        orderId,
        idempotencyKey,
      };

      logger.info("[worker/delivery-notifications] Processing", logMeta);

      // Gate 1 — feature flag global
      if (!isFeatureEnabled("delivery-live-whatsapp", tenantId)) {
        logger.info("[worker/delivery-notifications] Skipped — feature flag off", logMeta);
        return;
      }

      try {
        await processDeliveryNotification(job.data);
        logger.info("[worker/delivery-notifications] Completed", logMeta);
      } catch (err) {
        logger.error("[worker/delivery-notifications] Failed", {
          ...logMeta,
          error: String(err),
        });
        // Reportar a Sentry para errores críticos
        try {
          const { reportCriticalError } = await import("@/lib/sentry-alerts");
          reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
            module: "delivery-notifications-worker",
            tenantId,
            extra: {
              jobId: job.id,
              event,
              orderId,
            },
          });
        } catch (sentryErr) {
          logger.warn("Sentry reportCriticalError unavailable", { err: sentryErr instanceof Error ? sentryErr.message : String(sentryErr), op: "delivery-notifications-worker/sentry" });
        }
        throw err; // BullMQ hará retry con backoff exponencial
      }
    },
    {
      connection,
      concurrency: 5,
      // Rate limit: máximo 10 mensajes por segundo para no saturar WhatsApp API
      limiter: { max: 10, duration: 1000 },
    },
  );

  logger.info("[worker/delivery-notifications] Registered", {
    queue: DELIVERY_NOTIFICATIONS_QUEUE,
    concurrency: 5,
  });

  return worker;
}

/**
 * Procesa un job individual. Cargado con su propia función para
 * facilitar testing unitario (se puede mockear sin tocar BullMQ).
 */
export async function processDeliveryNotification(
  data: DeliveryNotificationJob,
): Promise<void> {
  const { event, tenantId, orderId, etaMinutes, failureReason } = data;

  // 1. Cargar datos del order + customer (raw porque el módulo usa ese patrón)
  const orderRows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      customerName: string;
      customerPhone: string | null;
      tenantId: string;
      driverId: string | null;
    }>
  >(
    `SELECT "id","customerName","customerPhone","tenantId","driverId"
       FROM "Order"
      WHERE "id" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
      LIMIT 1`,
    orderId,
    tenantId,
  );
  const order = orderRows[0];
  if (!order) {
    logger.warn("[worker/delivery-notifications] Order not found — skipping", {
      orderId,
      tenantId,
    });
    return;
  }
  if (!order.customerPhone) {
    logger.info("[worker/delivery-notifications] Customer has no phone — skipping", {
      orderId,
    });
    return;
  }

  // 2. Cargar tienda asociada al tenant
  const store = await prisma.store.findFirst({
    where: { tenantId },
    select: { name: true },
  });
  const storeName = store?.name ?? "tu bodega";

  // 3. Cargar driver si existe
  let driverFirstName = "El repartidor";
  if (order.driverId) {
    const driverRows = await prisma.$queryRawUnsafe<Array<{ driverName: string }>>(
      `SELECT "driverName" FROM "DeliveryRoute"
        WHERE "driverId" = $1 AND "tenantId" = $2
        ORDER BY "createdAt" DESC LIMIT 1`,
      order.driverId,
      tenantId,
    );
    if (driverRows[0]?.driverName) {
      driverFirstName = firstNameOnly(driverRows[0].driverName);
    }
  }

  // 4. Cargar teléfono de la tienda (settings del tenant) si es failed
  let storePhone = "";
  if (event === "failed") {
    const settings = await prisma.settings.findFirst({
      where: { tenantId },
      select: { businessPhone: true },
    });
    storePhone = settings?.businessPhone ?? "";
  }

  // 5. Construir el mensaje según el tipo de evento
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://bodegasaas.com";
  const trackingUrl = buildTrackingUrl(baseUrl, orderId);
  const firstName = firstNameOnly(order.customerName);

  let message: string;
  switch (event) {
    case "nearby":
      message = deliveryNearbyMessage({
        firstName,
        trackingUrl,
        storeName,
        driverFirstName,
        etaMinutes: etaMinutes ?? 5,
      });
      break;
    case "delivered":
      message = deliveryDeliveredMessage({
        firstName,
        trackingUrl,
        storeName,
        orderId,
      });
      break;
    case "failed":
      message = deliveryFailedMessage({
        firstName,
        trackingUrl,
        storeName,
        reason: failureReason ?? "No pudimos completar la entrega",
        storePhone,
      });
      break;
    case "picked_up":
      message = deliveryPickedUpMessage({
        firstName,
        trackingUrl,
        storeName,
      });
      break;
    default:
      logger.warn("[worker/delivery-notifications] Unknown event type — skipping", { event });
      return;
  }

  // 6. Enviar a la cola de notifications (que a su vez llama al WhatsApp API)
  await enqueueNotification({
    type: "whatsapp",
    recipient: order.customerPhone,
    message,
    tenantId,
    metadata: {
      source: "delivery-notifications-worker",
      event,
      orderId,
    },
  });

  logger.info("[worker/delivery-notifications] Enqueued WhatsApp", {
    event,
    orderId,
    recipient: order.customerPhone.slice(-4),
  });
}
