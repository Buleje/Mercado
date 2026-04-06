/**
 * lib/queue/index.ts
 *
 * Public API for the queue system.
 * Import from here: import { enqueueEmail, enqueueNotification } from "@/lib/queue";
 */

export { isQueueEnabled } from "./connection";
export {
  enqueueEmail,
  enqueuePdf,
  enqueueNotification,
  enqueueActivityLog,
  enqueueStockSync,
  QUEUE_NAMES,
  type EmailJobData,
  type PdfJobData,
  type NotificationJobData,
  type ActivityLogJobData,
  type StockSyncJobData,
} from "./queues";
