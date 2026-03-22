/**
 * lib/agents/persistence.ts
 *
 * Persists agent task results to the ActivityLog table.
 * Uses fire-and-forget pattern — never blocks task execution.
 *
 * This gives us audit trail + queryable history without schema changes.
 * Maps to existing ActivityLog model:
 *   action  = "SYSTEM"
 *   entity  = "Agent"
 *   entityId = task.id
 *   detail  = JSON summary of the task
 *   user    = "agent:<domain>"
 *   tenantId = task.tenantId
 *
 * The orchestrator's in-memory store evicts old entries (LRU, max 1000).
 * This layer ensures completed/failed tasks survive eviction and server
 * restarts, enabling historical queries from the database.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { agentBus } from "./bus";
import { orchestrator } from "./orchestrator";
import type { AgentTask } from "./types";

// ── Initialization ───────────────────────────────────────────────────────────

let _persistenceInitialized = false;

/**
 * Wire up bus listeners that persist completed/failed tasks to ActivityLog.
 * Safe to call multiple times — only the first call registers listeners.
 */
export function initAgentPersistence(): void {
  if (_persistenceInitialized) return;
  _persistenceInitialized = true;

  agentBus.on("task:completed", (data) => {
    persistTask(data.taskId, data.domain, data.tenantId, "completed").catch(
      () => {},
    );
  });

  agentBus.on("task:failed", (data) => {
    persistTask(data.taskId, data.domain, data.tenantId, "failed").catch(
      () => {},
    );
  });

  logger.info("[agent-persistence] Persistence layer initialized");
}

/**
 * Tear down persistence listeners. Primarily useful in tests.
 */
export function teardownAgentPersistence(): void {
  _persistenceInitialized = false;
  // Listeners are cleared when agentBus.clear() is called from hooks.ts
}

// ── Internal: persist a single task ──────────────────────────────────────────

async function persistTask(
  taskId: string,
  domain: string,
  tenantId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  try {
    // Grab the full task from the orchestrator's in-memory store
    const task = orchestrator.getTask(taskId);

    // Build a JSON summary — if the task was already evicted we still
    // persist a minimal record so we never lose the event.
    const detail = task
      ? JSON.stringify(taskToSummary(task))
      : JSON.stringify({
          taskId,
          domain,
          outcome,
          note: "Task already evicted from in-memory store",
        });

    await prisma.activityLog.create({
      data: {
        action: "SYSTEM",
        entity: "Agent",
        entityId: taskId,
        detail,
        user: `agent:${domain}`,
        ipAddress: "server",
        userAgent: "agent-orchestrator",
        tenantId,
      },
    });

    logger.debug("[agent-persistence] Task persisted", { taskId, outcome });
  } catch (err) {
    // Fire-and-forget — log but never throw
    logger.error("[agent-persistence] Failed to persist task", {
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Task summary builder ─────────────────────────────────────────────────────

interface TaskSummary {
  taskId: string;
  domain: string;
  action: string;
  priority: string;
  status: string;
  outcome: string;
  traceId: string;
  parentTaskId?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  /** Truncated payload to avoid bloating the detail column */
  payloadKeys: string[];
  /** Truncated result preview */
  resultPreview?: string;
}

function taskToSummary(task: AgentTask): TaskSummary {
  const summary: TaskSummary = {
    taskId: task.id,
    domain: task.domain,
    action: task.action,
    priority: task.priority,
    status: task.status,
    outcome: task.status === "completed" ? "success" : "failure",
    traceId: task.traceId,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    payloadKeys: Object.keys(task.payload ?? {}),
  };

  if (task.parentTaskId) {
    summary.parentTaskId = task.parentTaskId;
  }

  if (task.error) {
    summary.error = task.error.substring(0, 500);
  }

  // Calculate duration if both timestamps exist
  if (task.startedAt && task.completedAt) {
    const start = new Date(task.startedAt).getTime();
    const end = new Date(task.completedAt).getTime();
    if (!isNaN(start) && !isNaN(end)) {
      summary.durationMs = end - start;
    }
  }

  // Include a truncated preview of the result (avoid huge payloads)
  if (task.result !== undefined) {
    try {
      const raw = JSON.stringify(task.result);
      summary.resultPreview = raw.length > 200 ? raw.substring(0, 200) + "..." : raw;
    } catch {
      summary.resultPreview = "[unserializable]";
    }
  }

  return summary;
}

// ── Query persisted tasks ────────────────────────────────────────────────────

export interface PersistedTaskQuery {
  tenantId?: string;
  domain?: string;
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Query historical tasks from the ActivityLog table.
 * Returns reconstructed AgentTask objects from the stored JSON detail.
 *
 * This is useful for:
 *  - Admin dashboards showing agent task history
 *  - Debugging failed tasks after server restart
 *  - Audit compliance queries
 */
export async function getPersistedTasks(
  options: PersistedTaskQuery = {},
): Promise<AgentTask[]> {
  const { tenantId, domain, limit = 50, offset = 0 } = options;

  try {
    // Build where clause — always filter by entity = "Agent" and user starts with "agent:"
    const where: Record<string, unknown> = {
      entity: "Agent",
      user: domain
        ? `agent:${domain}`
        : { startsWith: "agent:" },
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const tasks: AgentTask[] = [];

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.detail);
        // Reconstruct a minimal AgentTask from the summary
        tasks.push({
          id: parsed.taskId ?? row.entityId ?? row.id,
          domain: parsed.domain ?? row.user?.replace("agent:", "") ?? "unknown",
          action: parsed.action ?? "unknown",
          payload: {}, // Original payload is not stored (only keys)
          priority: parsed.priority ?? "normal",
          status: parsed.status ?? (row.action === "SYSTEM" ? "completed" : "unknown"),
          result: parsed.resultPreview ? tryParse(parsed.resultPreview) : undefined,
          error: parsed.error,
          tenantId: row.tenantId,
          createdAt: parsed.createdAt ?? row.createdAt.toISOString(),
          startedAt: parsed.startedAt,
          completedAt: parsed.completedAt ?? row.createdAt.toISOString(),
          traceId: parsed.traceId ?? "",
          ...(parsed.parentTaskId && { parentTaskId: parsed.parentTaskId }),
        });
      } catch {
        // Skip rows with unparseable detail — don't crash the whole query
        logger.warn("[agent-persistence] Skipping unparseable ActivityLog row", {
          rowId: row.id,
        });
      }
    }

    return tasks;
  } catch (err) {
    logger.error("[agent-persistence] Failed to query persisted tasks", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Count persisted tasks (useful for pagination in admin UI).
 */
export async function countPersistedTasks(
  options: Pick<PersistedTaskQuery, "tenantId" | "domain"> = {},
): Promise<number> {
  const { tenantId, domain } = options;

  try {
    const where: Record<string, unknown> = {
      entity: "Agent",
      user: domain
        ? `agent:${domain}`
        : { startsWith: "agent:" },
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    return await prisma.activityLog.count({ where });
  } catch (err) {
    logger.error("[agent-persistence] Failed to count persisted tasks", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
