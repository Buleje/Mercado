/**
 * lib/queue/queues.ts
 *
 * Queue definitions for async processing.
 * Each queue handles a specific type of background job.
 */

import { getQueueConnection } from "./connection";
import { logger } from "@/lib/logger";

// BullMQ is loaded lazily to avoid bundling issues with Turbopack.
// Same pattern as lib/cache.ts with ioredis.
type BullQueue = {
  add(name: string, data: unknown): Promise<{ id?: string }>;
};

// Job type definitions
export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tenantId: string;
}

export interface PdfJobData {
  type: "invoice" | "report" | "receipt" | "label";
  data: Record<string, unknown>;
  tenantId: string;
  userId?: string;
}

export interface NotificationJobData {
  type: "whatsapp" | "push" | "email" | "sms";
  recipient: string;
  message: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityLogJobData {
  action: string;
  resource: string;
  resourceId?: string;
  userId: string;
  tenantId: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface StockSyncJobData {
  productId: string;
  tenantId: string;
  operation: "increment" | "decrement" | "set";
  quantity: number;
  reason: string;
}

// Queue names as constants
export const QUEUE_NAMES = {
  EMAIL: "email",
  PDF: "pdf-generation",
  NOTIFICATION: "notification",
  ACTIVITY_LOG: "activity-log",
  STOCK_SYNC: "stock-sync",
} as const;

// Default job options
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

// Queue instances (lazy-initialized)
let _queues: Map<string, BullQueue> | null = null;

function getQueues(): Map<string, BullQueue> | null {
  if (_queues) return _queues;

  const connection = getQueueConnection();
  if (!connection) return null;

  try {
    // Runtime-only require so Turbopack does not try to bundle bullmq
    const runtimeRequire = globalThis.Function("return require")() as (id: string) => unknown;
    const { Queue } = runtimeRequire("bullmq") as { Queue: new (name: string, opts: unknown) => BullQueue };

    _queues = new Map();
    for (const name of Object.values(QUEUE_NAMES)) {
      _queues.set(name, new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }));
    }
    logger.info("[queue] Queues initialized", { queues: Object.values(QUEUE_NAMES) });
    return _queues;
  } catch {
    logger.warn("[queue] bullmq not available — falling back to fire-and-forget");
    return null;
  }
}

function getQueue(name: string): BullQueue | null {
  const queues = getQueues();
  return queues?.get(name) ?? null;
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Add a job to a queue. Falls back to fire-and-forget execution when Redis is unavailable.
 */
async function enqueue<T>(
  queueName: string,
  jobName: string,
  data: T,
  fallback?: () => Promise<void>,
): Promise<string | null> {
  const queue = getQueue(queueName);

  if (!queue) {
    // No Redis — execute fallback synchronously (fire-and-forget behavior)
    if (fallback) {
      fallback().catch((err) => {
        logger.error("[queue/fallback] Job failed", { queueName, jobName, error: String(err) });
      });
    }
    return null;
  }

  const job = await queue.add(jobName, data);
  logger.debug("[queue] Job enqueued", { queue: queueName, job: jobName, id: job.id });
  return job.id ?? null;
}

/** Enqueue an email job */
export async function enqueueEmail(data: EmailJobData): Promise<string | null> {
  return enqueue(QUEUE_NAMES.EMAIL, "send-email", data);
}

/** Enqueue a PDF generation job */
export async function enqueuePdf(data: PdfJobData): Promise<string | null> {
  return enqueue(QUEUE_NAMES.PDF, `generate-${data.type}`, data);
}

/** Enqueue a notification job */
export async function enqueueNotification(data: NotificationJobData): Promise<string | null> {
  return enqueue(QUEUE_NAMES.NOTIFICATION, `notify-${data.type}`, data);
}

/** Enqueue an activity log job */
export async function enqueueActivityLog(data: ActivityLogJobData): Promise<string | null> {
  return enqueue(QUEUE_NAMES.ACTIVITY_LOG, "log-activity", data);
}

/** Enqueue a stock sync job */
export async function enqueueStockSync(data: StockSyncJobData): Promise<string | null> {
  return enqueue(QUEUE_NAMES.STOCK_SYNC, `stock-${data.operation}`, data);
}
