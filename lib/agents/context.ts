/**
 * lib/agents/context.ts
 *
 * Scoped utilities injected into every agent execution.
 * Wraps the global logger and cache with tenant + trace context
 * so domain agents don't need to pass those values manually.
 */

import { logger } from "@/lib/logger";
import { getOrSet } from "@/lib/cache";
import { newTraceId } from "@/lib/api-error";
import type { AgentContext, AgentTask } from "./types";

// ── Context Factory ─────────────────────────────────────────────────────────

/**
 * Create an AgentContext from a task.
 * Reuses the task's traceId if present; otherwise mints a new one.
 */
export function createAgentContext(task: AgentTask): AgentContext {
  return {
    tenantId: task.tenantId,
    traceId: task.traceId || newTraceId(),
    parentTaskId: task.parentTaskId,
  };
}

// ── Scoped Logger ────────────────────────────────────────────────────────────

export interface ScopedLogger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

/**
 * Returns a logger that automatically includes tenantId and traceId
 * in every log entry.
 */
export function scopedLogger(ctx: AgentContext): ScopedLogger {
  const base = { tenantId: ctx.tenantId, traceId: ctx.traceId };

  return {
    debug(message, extra) {
      logger.debug(message, { ...base, ...extra });
    },
    info(message, extra) {
      logger.info(message, { ...base, ...extra });
    },
    warn(message, extra) {
      logger.warn(message, { ...base, ...extra });
    },
    error(message, extra) {
      logger.error(message, { ...base, ...extra });
    },
  };
}

// ── Scoped Cache ─────────────────────────────────────────────────────────────

export interface ScopedCache {
  getOrSet<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T>;
}

/**
 * Returns a cache helper that automatically prefixes keys with the tenantId
 * to ensure per-tenant isolation.
 */
export function scopedCache(ctx: AgentContext): ScopedCache {
  return {
    getOrSet<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
      const prefixedKey = `agent:${ctx.tenantId}:${key}`;
      return getOrSet<T>(prefixedKey, ttlSec, fn);
    },
  };
}
