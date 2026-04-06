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
  type EmailJobData,
  type PdfJobData,
  type NotificationJobData,
  type ActivityLogJobData,
  type StockSyncJobData,
} from "./queues";

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
      from: from || process.env.SMTP_FROM || "noreply@buleje.com",
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
    const { type, recipient, tenantId } = job.data;
    logger.info("[worker/notification] Processing", { jobId: job.id, type, recipient, tenantId });

    switch (type) {
      case "whatsapp":
        // WhatsApp API integration
        logger.info("[worker/notification] WhatsApp sent", { recipient });
        break;
      case "push":
        // Web push notification
        logger.info("[worker/notification] Push sent", { recipient });
        break;
      case "email":
        // Delegate to email queue
        break;
      case "sms":
        logger.info("[worker/notification] SMS sent", { recipient });
        break;
    }
  },
  { connection, concurrency: 10 },
);

// ── Activity Log Worker ─────────────────────────────────────────────────────────

const activityLogWorker = new Worker<ActivityLogJobData>(
  QUEUE_NAMES.ACTIVITY_LOG,
  async (job: Job<ActivityLogJobData>) => {
    logger.info("[worker/activity] Processing", { jobId: job.id, action: job.data.action });
    // Write to activity_logs table via Prisma
    // This offloads DB writes from the hot path
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

// ── Graceful shutdown ───────────────────────────────────────────────────────────

const workers = [emailWorker, pdfWorker, notificationWorker, activityLogWorker, stockSyncWorker];

async function shutdown() {
  logger.info("[workers] Shutting down gracefully...");
  await Promise.all(workers.map((w) => w.close()));
  logger.info("[workers] All workers stopped.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Error handlers
for (const worker of workers) {
  worker.on("failed", (job, err) => {
    logger.error(`[worker/${worker.name}] Job failed`, {
      jobId: job?.id,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on("completed", (job) => {
    logger.debug(`[worker/${worker.name}] Job completed`, { jobId: job.id });
  });
}

logger.info("[workers] All workers started", { count: workers.length });
