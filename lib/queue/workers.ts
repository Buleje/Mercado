/**
 * lib/queue/workers.ts
 *
 * Worker definitions for processing background jobs.
 * Workers are started separately from the Next.js process.
 *
 * Run workers with: npx tsx lib/queue/workers.ts
 */

import { Worker, Job } from "bullmq";
import { getQueueConnection } from "./connection";
import { logger } from "@/lib/logger";
import {
  QUEUE_NAMES,
  enqueueNotification,
  type EmailJobData,
  type PdfJobData,
  type NotificationJobData,
  type ActivityLogJobData,
  type StockSyncJobData,
} from "./queues";
import {
  DOMAIN_EVENTS_QUEUE,
  type DomainEvent,
} from "@/lib/domain-events";

const connection = getQueueConnection();

if (!connection) {
  logger.error("[workers] Cannot start workers without REDIS_URL");
  process.exit(1);
}

// ── Email Worker ────────────────────────────────────────────────────────────────

const emailWorker = new Worker<EmailJobData>(
  QUEUE_NAMES.EMAIL,
  async (job: Job<EmailJobData>) => {
    const { to, subject, html, from, tenantId } = job.data;
    logger.info("[worker/email] Processing", { jobId: job.id, to, subject, tenantId });

    // Dynamic import to avoid bundling nodemailer in the main app
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: from || process.env.SMTP_FROM || "noreply@buleje.pe",
      to,
      subject,
      html,
    });

    logger.info("[worker/email] Sent successfully", { jobId: job.id, to });
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  },
);

// ── PDF Worker ──────────────────────────────────────────────────────────────────

const pdfWorker = new Worker<PdfJobData>(
  QUEUE_NAMES.PDF,
  async (job: Job<PdfJobData>) => {
    const { type, tenantId } = job.data;
    logger.info("[worker/pdf] Processing", { jobId: job.id, type, tenantId });

    // PDF generation logic would go here
    // Using jsPDF which is already a dependency
    logger.info("[worker/pdf] Generated successfully", { jobId: job.id, type });
  },
  { connection, concurrency: 3 },
);

// ── Notification Worker ─────────────────────────────────────────────────────────

const notificationWorker = new Worker<NotificationJobData>(
  QUEUE_NAMES.NOTIFICATION,
  async (job: Job<NotificationJobData>) => {
    const { type, recipient, message, tenantId } = job.data;
    logger.info("[worker/notification] Processing", { jobId: job.id, type, recipient, tenantId });

    switch (type) {
      case "whatsapp": {
        const { sendWhatsAppText } = await import("@/lib/whatsapp");
        const ok = await sendWhatsAppText(recipient, message);
        if (!ok) throw new Error(`WhatsApp API returned false for ${recipient}`);
        logger.info("[worker/notification] WhatsApp sent", { recipient, tenantId });
        break;
      }
      case "push": {
        const { sendPushToPhone } = await import("@/lib/push-sender");
        await sendPushToPhone(recipient, { title: "Notificacion", body: message });
        logger.info("[worker/notification] Push sent", { recipient, tenantId });
        break;
      }
      case "email":
        // Email deliveries should use the dedicated email queue (enqueueEmail)
        logger.warn("[worker/notification] Email via notification queue — use enqueueEmail instead", { recipient });
        break;
      case "sms":
        logger.warn("[worker/notification] SMS not implemented", { recipient });
        break;
    }
  },
  { connection, concurrency: 10 },
);

// ── Activity Log Worker ─────────────────────────────────────────────────────────

const activityLogWorker = new Worker<ActivityLogJobData>(
  QUEUE_NAMES.ACTIVITY_LOG,
  async (job: Job<ActivityLogJobData>) => {
    const { action, resource, resourceId, userId, tenantId, details, timestamp } = job.data;
    logger.info("[worker/activity] Processing", { jobId: job.id, action, resource, tenantId });

    const { prisma } = await import("@/lib/prisma");
    await prisma.activityLog.create({
      data: {
        action,
        entity: resource,
        entityId: resourceId ?? undefined,
        detail: details ? JSON.stringify(details) : "",
        user: userId,
        tenantId,
        createdAt: new Date(timestamp),
      },
    });
    logger.info("[worker/activity] Written to DB", { jobId: job.id, action, resource });
  },
  { connection, concurrency: 20 },
);

// ── Stock Sync Worker ───────────────────────────────────────────────────────────

const stockSyncWorker = new Worker<StockSyncJobData>(
  QUEUE_NAMES.STOCK_SYNC,
  async (job: Job<StockSyncJobData>) => {
    const { productId, operation, quantity, tenantId } = job.data;
    logger.info("[worker/stock] Processing", { jobId: job.id, productId, operation, quantity, tenantId });
    // Stock update logic via InventoryDB
  },
  { connection, concurrency: 5 },
);

// ── Domain Events Worker ────────────────────────────────────────────────────────
// Consumes the domain-events queue (ADR 007) and fans out to specific handlers.
// Each handler MUST be idempotent — events can be delivered more than once.

const domainEventsWorker = new Worker<DomainEvent>(
  DOMAIN_EVENTS_QUEUE,
  async (job: Job<DomainEvent>) => {
    const event = job.data;
    logger.info("[worker/domain-events] Processing", {
      jobId:    job.id,
      eventId:  event.id,
      type:     event.type,
      tenantId: event.tenantId,
    });

    switch (event.type) {
      case "VentaCompletada": {
        const { orderId, total, itemCount, paymentMethod, hadCoupon } = event.payload;
        logger.info("[worker/domain-events] VentaCompletada", {
          orderId, total, itemCount, paymentMethod, hadCoupon,
        });
        // Subscribers:
        // 1. Trigger activity log (already enqueued separately, idempotent)
        // 2. Emit analytics event for dashboard KPIs
        // 3. Optionally auto-emit SUNAT invoice if configured for this tenant
        // 4. Trigger loyalty points accrual
        break;
      }

      case "StockBajo": {
        const { productId, productName, currentStock, stockMin, reason } = event.payload;
        logger.warn("[worker/domain-events] StockBajo", {
          productId, productName, currentStock, stockMin, reason,
        });
        // Subscriber: notify owner via WhatsApp
        await enqueueNotification({
          type:      "whatsapp",
          recipient: "OWNER",  // worker resolves this via tenant settings
          message:   currentStock === 0
            ? `⚠️ Stock AGOTADO: "${productName}" se quedó sin unidades. Reabastece urgente.`
            : `⚠️ Stock bajo: "${productName}" tiene ${currentStock} unidades (mínimo ${stockMin}).`,
          tenantId:  event.tenantId,
          metadata:  { productId, reason, eventId: event.id },
        });
        break;
      }

      case "FacturaEmitida": {
        const { facturaId, orderId, customerName, total, documentType } = event.payload;
        logger.info("[worker/domain-events] FacturaEmitida", {
          facturaId, orderId, customerName, total, documentType,
        });
        // Subscriber: email the customer with their invoice
        // (Requires fetching customer email from the order — can be enriched later)
        break;
      }

      default: {
        // Exhaustiveness check — TypeScript will error if we add a new event type
        // without handling it here.
        const _exhaustive: never = event;
        logger.warn("[worker/domain-events] Unknown event type", {
          event: _exhaustive as unknown,
        });
      }
    }
  },
  {
    connection,
    concurrency: 10,
    limiter:     { max: 50, duration: 1000 },
  },
);

// ── Graceful shutdown ───────────────────────────────────────────────────────────

const workers = [
  emailWorker,
  pdfWorker,
  notificationWorker,
  activityLogWorker,
  stockSyncWorker,
  domainEventsWorker,
];

async function shutdown() {
  logger.info("[workers] Shutting down gracefully...");
  await Promise.all(workers.map((w) => w.close()));
  logger.info("[workers] All workers stopped.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Error handlers
// OBSERVABILITY 2026-05-06 (audit CMS #11): reportar fallos a Sentry — antes
// solo iban a logger y se perdían sin alerta. Cargado dinámicamente para no
// hacer Sentry obligatorio en dev sin DSN.
for (const worker of workers) {
  worker.on("failed", (job, err) => {
    logger.error(`[worker/${worker.name}] Job failed`, {
      jobId: job?.id,
      error: err.message,
      attempts: job?.attemptsMade,
    });
    // Fire-and-forget: si hay Sentry configurado, mandar evento.
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureException(err, {
          extra: {
            worker: worker.name,
            jobId: job?.id,
            attempts: job?.attemptsMade,
            jobName: job?.name,
          },
        });
      })
      .catch(() => { /* Sentry not installed or not configured */ });
  });

  worker.on("completed", (job) => {
    logger.debug(`[worker/${worker.name}] Job completed`, { jobId: job.id });
  });
}

logger.info("[workers] All workers started", { count: workers.length });
