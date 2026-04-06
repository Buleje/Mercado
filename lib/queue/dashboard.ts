/**
 * lib/queue/dashboard.ts
 *
 * Queue dashboard data for admin panel.
 * Returns job counts and status for each queue.
 */

import { Queue } from "bullmq";
import { getQueueConnection } from "./connection";
import { QUEUE_NAMES } from "./queues";

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getQueueStats(): Promise<QueueStats[]> {
  const connection = getQueueConnection();
  if (!connection) return [];

  const stats: QueueStats[] = [];

  for (const name of Object.values(QUEUE_NAMES)) {
    const queue = new Queue(name, { connection });
    const counts = await queue.getJobCounts();
    stats.push({
      name,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    });
    await queue.close();
  }

  return stats;
}
