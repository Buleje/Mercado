import "server-only";

/**
 * lib/queue/chat-notifications-worker.ts
 *
 * Worker BullMQ para notificaciones de chat buyer ↔ seller.
 * Escucha eventos de mensaje nuevo y dispara WhatsApp al participante
 * ausente (el que no tiene el chat abierto en ese momento).
 *
 * Contrato (mismo que delivery):
 * - At-least-once delivery → handler idempotente
 * - Respeta feature flag `marketplace-chat-whatsapp`
 * - Rate limit 10 msg/s
 * - Sentry reportCriticalError en fallos críticos
 */

import type { Worker as WorkerType, Job } from "bullmq";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { enqueueNotification } from "./queues";
import {
  sellerRespondedMessage,
  buyerNewMessageMessage,
  threadClosedMessage,
  buildChatThreadUrl,
  firstNameOnly,
  previewText,
} from "@/lib/integrations/whatsapp-chat-templates";
import { prisma } from "@/lib/prisma";

export const CHAT_NOTIFICATIONS_QUEUE = "chat-notifications";

export type ChatNotificationEvent =
  | "seller_responded"
  | "buyer_new_message"
  | "thread_closed";

export interface ChatNotificationJob {
  event: ChatNotificationEvent;
  tenantId: string;
  threadId: string;
  messagePreview?: string;
  closeReason?: string;
  idempotencyKey: string;
}

/**
 * Registra el worker en el proceso de BullMQ.
 */
export function registerChatNotificationsWorker(
  connection: unknown,
): WorkerType<ChatNotificationJob> | null {
  let WorkerClass: new (
    name: string,
    processor: (job: Job<ChatNotificationJob>) => Promise<void>,
    opts: unknown,
  ) => WorkerType<ChatNotificationJob>;

  try {
    const runtimeRequire = globalThis.Function("return require")() as (id: string) => unknown;
    const bullmq = runtimeRequire("bullmq") as { Worker: typeof WorkerClass };
    WorkerClass = bullmq.Worker;
  } catch (e) {
    logger.warn("[worker/chat-notifications] bullmq not available — worker not registered", { err: e instanceof Error ? e.message : String(e) });
    return null;
  }

  const worker = new WorkerClass(
    CHAT_NOTIFICATIONS_QUEUE,
    async (job: Job<ChatNotificationJob>) => {
      const { event, tenantId, threadId, idempotencyKey } = job.data;
      const logMeta = { jobId: job.id, event, tenantId, threadId, idempotencyKey };

      logger.info("[worker/chat-notifications] Processing", logMeta);

      if (!isFeatureEnabled("marketplace-chat-whatsapp", tenantId)) {
        logger.info("[worker/chat-notifications] Skipped — feature flag off", logMeta);
        return;
      }

      try {
        await processChatNotification(job.data);
        logger.info("[worker/chat-notifications] Completed", logMeta);
      } catch (err) {
        logger.error("[worker/chat-notifications] Failed", {
          ...logMeta,
          error: String(err),
        });
        try {
          const { reportCriticalError } = await import("@/lib/sentry-alerts");
          reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
            module: "chat-notifications-worker",
            tenantId,
            extra: { jobId: job.id, event, threadId },
          });
        } catch (sentryErr) {
          logger.warn("Sentry reportCriticalError unavailable", { err: sentryErr instanceof Error ? sentryErr.message : String(sentryErr), op: "chat-notifications-worker/sentry" });
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    },
  );

  logger.info("[worker/chat-notifications] Registered", {
    queue: CHAT_NOTIFICATIONS_QUEUE,
    concurrency: 5,
  });

  return worker;
}

/**
 * Lógica del procesamiento individual. Extraída para ser testeable.
 */
export async function processChatNotification(
  data: ChatNotificationJob,
): Promise<void> {
  const { event, tenantId, threadId, messagePreview, closeReason } = data;

  // 1. Cargar thread + store con raw SQL
  const threadRows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      storeId: string;
      customerPhone: string;
      customerName: string;
      subject: string | null;
    }>
  >(
    `SELECT "id","storeId","customerPhone","customerName","subject"
       FROM "ConversationThread"
      WHERE "id" = $1 AND "tenantId" = $2
      LIMIT 1`,
    threadId,
    tenantId,
  );
  const thread = threadRows[0];
  if (!thread) {
    logger.warn("[worker/chat-notifications] Thread not found — skipping", {
      threadId,
      tenantId,
    });
    return;
  }

  const store = await prisma.store.findUnique({
    where: { id: thread.storeId },
    select: { name: true, slug: true },
  });
  if (!store) {
    logger.warn("[worker/chat-notifications] Store not found — skipping", {
      storeId: thread.storeId,
    });
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://bodegasaas.com";
  const threadUrl = buildChatThreadUrl(baseUrl, store.slug, thread.id);

  // 2. Ramas por tipo de evento
  if (event === "seller_responded") {
    // Notificar al buyer
    const message = sellerRespondedMessage({
      firstName:      firstNameOnly(thread.customerName),
      storeName:      store.name,
      threadUrl,
      messagePreview: previewText(messagePreview ?? "Nuevo mensaje", 140),
    });
    await enqueueNotification({
      type: "whatsapp",
      recipient: thread.customerPhone,
      message,
      tenantId,
      metadata: {
        source: "chat-notifications-worker",
        event,
        threadId,
      },
    });
    logger.info("[worker/chat-notifications] Enqueued seller_responded → buyer", {
      threadId,
      recipient: thread.customerPhone.slice(-4),
    });
    return;
  }

  if (event === "buyer_new_message") {
    // Notificar al dueño de la tienda via businessPhone del tenant settings
    const settings = await prisma.settings.findFirst({
      where: { tenantId },
      select: { businessPhone: true },
    });
    const ownerPhone = settings?.businessPhone ?? "";
    if (!ownerPhone) {
      logger.warn("[worker/chat-notifications] No ownerPhone for tenant — skipping", {
        tenantId,
      });
      return;
    }
    const message = buyerNewMessageMessage({
      firstName:      "Dueño",
      buyerFirstName: firstNameOnly(thread.customerName),
      storeName:      store.name,
      threadUrl,
      messagePreview: previewText(messagePreview ?? "Nuevo mensaje", 140),
    });
    await enqueueNotification({
      type: "whatsapp",
      recipient: ownerPhone,
      message,
      tenantId,
      metadata: {
        source: "chat-notifications-worker",
        event,
        threadId,
      },
    });
    logger.info("[worker/chat-notifications] Enqueued buyer_new_message → owner", {
      threadId,
    });
    return;
  }

  if (event === "thread_closed") {
    // Notificar al buyer que el hilo se cerró
    const message = threadClosedMessage({
      firstName: firstNameOnly(thread.customerName),
      storeName: store.name,
      threadUrl,
      reason:    closeReason,
    });
    await enqueueNotification({
      type: "whatsapp",
      recipient: thread.customerPhone,
      message,
      tenantId,
      metadata: {
        source: "chat-notifications-worker",
        event,
        threadId,
      },
    });
    logger.info("[worker/chat-notifications] Enqueued thread_closed → buyer", { threadId });
    return;
  }

  logger.warn("[worker/chat-notifications] Unknown event — skipping", { event });
}
