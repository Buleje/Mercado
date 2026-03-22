/**
 * lib/agents/hooks.ts
 *
 * Integration hooks that bridge the multi-agent system with existing
 * infrastructure (logging, SSE, cron triggers).
 *
 * Call `initAgentHooks()` once during app bootstrap to wire up
 * event listeners on the agent bus.
 *
 * This is a lightweight bridge — NOT a full rewrite of SSE or cron.
 * Future extensions (e.g., pushing events to SSE clients, triggering
 * scheduled agent tasks from cron) plug in here.
 */

import { agentBus } from "./bus";
import { logger } from "@/lib/logger";
import { initAgentPersistence, teardownAgentPersistence } from "./persistence";

/** Track whether hooks have already been initialized (idempotent). */
let _initialized = false;

/**
 * Wire up agent bus event listeners for logging, alerting,
 * and future SSE / cron integration points.
 *
 * Safe to call multiple times — only the first call registers listeners.
 */
export function initAgentHooks(): void {
  if (_initialized) return;
  _initialized = true;

  // ── Task lifecycle logging ──────────────────────────────────────────────

  agentBus.on("task:created", (data) => {
    logger.info("[agent-hooks] Task created", {
      taskId: data.taskId,
      domain: data.domain,
      action: data.action,
      tenantId: data.tenantId,
    });
  });

  agentBus.on("task:started", (data) => {
    logger.info("[agent-hooks] Task started", {
      taskId: data.taskId,
      domain: data.domain,
      tenantId: data.tenantId,
    });
  });

  agentBus.on("task:completed", (data) => {
    logger.info("[agent-hooks] Task completed", {
      taskId: data.taskId,
      domain: data.domain,
      success: data.success,
      tenantId: data.tenantId,
    });
  });

  agentBus.on("task:failed", (data) => {
    logger.error("[agent-hooks] Task failed", {
      taskId: data.taskId,
      domain: data.domain,
      error: data.error,
      tenantId: data.tenantId,
    });
  });

  // ── Agent alerts ────────────────────────────────────────────────────────

  agentBus.on("agent:alert", (data) => {
    const logFn =
      data.level === "critical"
        ? logger.error
        : data.level === "warn"
          ? logger.warn
          : logger.info;

    logFn.call(logger, "[agent-hooks] Agent alert", {
      domain: data.domain,
      level: data.level,
      message: data.message,
      data: data.data,
    });
  });

  // ── SSE broadcast — push agent events to admin dashboard ──────────────

  import("@/lib/sse-emitter")
    .then(({ emitAdminSSE }) => {
      agentBus.on("task:completed", (data) => {
        emitAdminSSE("agent:task-completed", {
          taskId: data.taskId,
          domain: data.domain,
          success: data.success,
          tenantId: data.tenantId,
        });
      });

      agentBus.on("task:failed", (data) => {
        emitAdminSSE("agent:task-failed", {
          taskId: data.taskId,
          domain: data.domain,
          error: data.error,
          tenantId: data.tenantId,
        });
      });

      agentBus.on("agent:alert", (data) => {
        emitAdminSSE("agent:alert", {
          domain: data.domain,
          level: data.level,
          message: data.message,
          data: data.data,
        });
      });

      logger.info("[agent-hooks] SSE broadcast connected");
    })
    .catch(() => {
      // SSE not available — skip
    });

  // ── DB persistence — write completed/failed tasks to ActivityLog ────────

  initAgentPersistence();

  logger.info("[agent-hooks] Agent hooks initialized");
}

/**
 * Tear down all hooks. Primarily useful in tests to reset state.
 */
export function teardownAgentHooks(): void {
  if (!_initialized) return;
  teardownAgentPersistence();
  agentBus.clear();
  _initialized = false;
  logger.info("[agent-hooks] Agent hooks torn down");
}
