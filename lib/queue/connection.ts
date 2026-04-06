/**
 * lib/queue/connection.ts
 *
 * BullMQ Redis connection — reuses REDIS_URL env var.
 * Falls back to a no-op mode when Redis is not available.
 */

import { logger } from "@/lib/logger";

export interface QueueConnection {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
}

let _connection: QueueConnection | null = null;

export function getQueueConnection(): QueueConnection | null {
  if (_connection) return _connection;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("[queue] REDIS_URL not set — queues disabled, using fire-and-forget fallback");
    return null;
  }

  try {
    const parsed = new URL(url);
    _connection = {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
    };
    logger.info("[queue] Redis connection configured", { host: _connection.host });
    return _connection;
  } catch (err) {
    logger.error("[queue] Invalid REDIS_URL", { error: String(err) });
    return null;
  }
}

export function isQueueEnabled(): boolean {
  return !!process.env.REDIS_URL;
}
