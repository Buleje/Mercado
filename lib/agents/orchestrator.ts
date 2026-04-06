/**
 * lib/agents/orchestrator.ts
 *
 * Central task router and coordinator for the multi-agent system.
 *
 * Responsibilities:
 *  - Accept tasks, assign IDs and traceIds, enqueue by priority
 *  - Route tasks to the correct DomainAgent via the registry
 *  - Manage concurrency (max 10 parallel tasks)
 *  - Circuit breaker per domain for resilience
 *  - Automatic subtask creation when agents delegate work
 *  - LRU eviction on the in-memory task store (max 1000 entries)
 *  - Full lifecycle events via the agent bus
 */

import { withCircuitBreaker } from "@/lib/circuit-breaker";
import { newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { agentRegistry } from "./registry";
import { agentBus } from "./bus";
import { createAgentContext, scopedLogger } from "./context";
import type { ScopedLogger } from "./context";
import type {
  AgentDomain,
  AgentTask,
  TaskPriority,
} from "./types";

// Re-import PRIORITY_RANK as a value (types file exports it as const)
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_STORE_SIZE = 1000;
const MAX_CONCURRENT = 10;

// ── Submit input type ─────────────────────────────────────────────────────────

export interface SubmitTaskInput {
  domain: AgentDomain;
  action: string;
  payload: Record<string, unknown>;
  tenantId: string;
  priority?: TaskPriority;
  parentTaskId?: string;
  traceId?: string;
}

// ── History query options ─────────────────────────────────────────────────────

export interface HistoryOptions {
  tenantId?: string;
  domain?: AgentDomain;
  status?: string;
  limit?: number;
}

// ── Orchestrator implementation ───────────────────────────────────────────────

class Orchestrator {
  /** In-memory task store */
  private tasks = new Map<string, AgentTask>();

  /** Insertion-order tracking for LRU eviction */
  private insertionOrder: string[] = [];

  /** Priority queue of pending task IDs */
  private pendingQueue: string[] = [];

  /** Number of currently executing tasks */
  private runningCount = 0;

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Submit a new task for processing.
   * Returns the created task immediately; processing happens asynchronously.
   */
  submitTask(input: SubmitTaskInput): AgentTask {
    const taskId = this.generateId();
    const traceId = input.traceId
      ?? (input.parentTaskId
        ? this.tasks.get(input.parentTaskId)?.traceId ?? newTraceId()
        : newTraceId());

    const task: AgentTask = {
      id: taskId,
      domain: input.domain,
      action: input.action,
      payload: input.payload,
      priority: input.priority ?? "normal",
      status: "pending",
      tenantId: input.tenantId,
      createdAt: new Date().toISOString(),
      traceId,
      ...(input.parentTaskId && { parentTaskId: input.parentTaskId }),
    };

    this.storeTask(task);
    this.enqueue(taskId);

    agentBus.emit("task:created", {
      taskId: task.id,
      domain: task.domain,
      action: task.action,
      tenantId: task.tenantId,
    });

    logger.debug("Orchestrator: task submitted", {
      taskId,
      domain: task.domain,
      action: task.action,
      priority: task.priority,
      tenantId: task.tenantId,
    });

    // Kick the processing loop (fire-and-forget)
    this.drain().catch(() => {});

    return task;
  }

  /**
   * Retrieve a task by ID.
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Cancel a pending task. Returns true if it was actually cancelled.
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== "pending") return false;

    task.status = "cancelled";
    task.completedAt = new Date().toISOString();

    // Remove from pending queue
    this.pendingQueue = this.pendingQueue.filter((id) => id !== taskId);

    logger.info("Orchestrator: task cancelled", {
      taskId,
      domain: task.domain,
      action: task.action,
      tenantId: task.tenantId,
    });

    return true;
  }

  /**
   * Return all tasks currently in "running" status.
   */
  getActiveTasks(): AgentTask[] {
    const active: AgentTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === "running") active.push(task);
    }
    return active;
  }

  /**
   * Return historical tasks, optionally filtered.
   */
  getHistory(options: HistoryOptions = {}): AgentTask[] {
    const { tenantId, domain, status, limit = 50 } = options;
    const results: AgentTask[] = [];

    // Iterate in reverse insertion order (most recent first)
    for (let i = this.insertionOrder.length - 1; i >= 0; i--) {
      if (results.length >= limit) break;
      const task = this.tasks.get(this.insertionOrder[i]);
      if (!task) continue;
      if (tenantId && task.tenantId !== tenantId) continue;
      if (domain && task.domain !== domain) continue;
      if (status && task.status !== status) continue;
      results.push(task);
    }

    return results;
  }

  /**
   * Pending queue depth (useful for health checks / metrics).
   */
  get queueDepth(): number {
    return this.pendingQueue.length;
  }

  /**
   * Current number of running tasks.
   */
  get activeCount(): number {
    return this.runningCount;
  }

  /**
   * Execute a task synchronously — waits for the result.
   * Used by LLM function calling to get agent results inline.
   * Bypasses the async queue for immediate execution.
   */
  async executeSync(input: SubmitTaskInput): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    const agent = agentRegistry.get(input.domain);
    if (!agent) {
      return { success: false, error: `No agent for domain "${input.domain}"` };
    }

    if (!agent.actions.includes(input.action)) {
      return {
        success: false,
        error: `Agent "${input.domain}" does not support "${input.action}". Available: ${agent.actions.join(", ")}`,
      };
    }

    const taskId = this.generateId();
    const traceId = input.traceId ?? newTraceId();
    const task: AgentTask = {
      id: taskId,
      domain: input.domain,
      action: input.action,
      payload: input.payload,
      priority: input.priority ?? "normal",
      status: "running",
      tenantId: input.tenantId,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      traceId,
    };

    const ctx = createAgentContext(task);

    try {
      const result = await withCircuitBreaker(
        `agent:${task.domain}`,
        () => agent.execute(task, ctx),
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Orchestrator: executeSync failed", {
        domain: input.domain,
        action: input.action,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Clear all state (useful for tests).
   */
  reset(): void {
    this.tasks.clear();
    this.insertionOrder = [];
    this.pendingQueue = [];
    this.runningCount = 0;
  }

  // ── Internal processing ───────────────────────────────────────────────────

  /**
   * Drain the pending queue, respecting the concurrency limit.
   */
  private async drain(): Promise<void> {
    while (this.pendingQueue.length > 0 && this.runningCount < MAX_CONCURRENT) {
      const taskId = this.pendingQueue.shift();
      if (!taskId) break;

      const task = this.tasks.get(taskId);
      if (!task || task.status !== "pending") continue;

      this.runningCount++;
      // Fire-and-forget each task — errors are handled inside processTask
      this.processTask(task)
        .catch(() => {})
        .finally(() => {
          this.runningCount--;
          // Try to drain more after each completion
          this.drain().catch(() => {});
        });
    }
  }

  /**
   * Execute a single task: look up agent, run with circuit breaker, handle result.
   */
  private async processTask(task: AgentTask): Promise<void> {
    const ctx = createAgentContext(task);
    const log = scopedLogger(ctx);

    // Mark as running
    task.status = "running";
    task.startedAt = new Date().toISOString();

    agentBus.emit("task:started", {
      taskId: task.id,
      domain: task.domain,
      tenantId: task.tenantId,
    });

    log.info("Orchestrator: task started");

    // Look up agent
    const agent = agentRegistry.get(task.domain);
    if (!agent) {
      this.failTask(task, `No agent registered for domain "${task.domain}"`, log);
      return;
    }

    if (!agent.actions.includes(task.action)) {
      this.failTask(
        task,
        `Agent "${task.domain}" does not support action "${task.action}". Available: ${agent.actions.join(", ")}`,
        log,
      );
      return;
    }

    try {
      // Execute through circuit breaker keyed by domain
      const result = await withCircuitBreaker(
        `agent:${task.domain}`,
        () => agent.execute(task, ctx),
      );

      if (result.success) {
        task.status = "completed";
        task.result = result.data;
        task.completedAt = new Date().toISOString();

        agentBus.emit("task:completed", {
          taskId: task.id,
          domain: task.domain,
          success: true,
          tenantId: task.tenantId,
        });

        log.info("Orchestrator: task completed", {
          hasData: result.data !== undefined,
          metadata: result.metadata,
        });

        // Handle subtask delegation
        if (result.subtasks && result.subtasks.length > 0) {
          this.spawnSubtasks(task, result.subtasks, log);
        }
      } else {
        // Agent returned success: false — controlled failure
        this.failTask(task, result.error ?? "Agent returned unsuccessful result", log);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.failTask(task, message, log);
    }
  }

  /**
   * Mark a task as failed, emit events, log.
   */
  private failTask(
    task: AgentTask,
    error: string,
    log: ScopedLogger,
  ): void {
    task.status = "failed";
    task.error = error;
    task.completedAt = new Date().toISOString();

    agentBus.emit("task:failed", {
      taskId: task.id,
      domain: task.domain,
      error,
      tenantId: task.tenantId,
    });

    log.error("Orchestrator: task failed", { error });
  }

  /**
   * Create subtasks from an agent's delegated work.
   */
  private spawnSubtasks(
    parentTask: AgentTask,
    subtasks: Pick<AgentTask, "domain" | "action" | "payload" | "priority">[],
    log: ScopedLogger,
  ): void {
    log.info("Orchestrator: spawning subtasks", { count: subtasks.length });

    for (const sub of subtasks) {
      this.submitTask({
        domain: sub.domain,
        action: sub.action,
        payload: sub.payload,
        priority: sub.priority,
        tenantId: parentTask.tenantId,
        parentTaskId: parentTask.id,
      });
    }
  }

  // ── Queue management ──────────────────────────────────────────────────────

  /**
   * Insert a task ID into the priority queue in sorted position.
   */
  private enqueue(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const taskRank = PRIORITY_ORDER[task.priority];

    // Find insertion index to maintain sorted order (higher priority first)
    let insertIdx = this.pendingQueue.length;
    for (let i = 0; i < this.pendingQueue.length; i++) {
      const existing = this.tasks.get(this.pendingQueue[i]);
      if (existing && PRIORITY_ORDER[existing.priority] > taskRank) {
        insertIdx = i;
        break;
      }
    }

    this.pendingQueue.splice(insertIdx, 0, taskId);
  }

  // ── Store management ──────────────────────────────────────────────────────

  /**
   * Store a task, evicting the oldest entries if we exceed MAX_STORE_SIZE.
   */
  private storeTask(task: AgentTask): void {
    // LRU eviction: remove oldest completed/failed/cancelled tasks first
    while (this.tasks.size >= MAX_STORE_SIZE) {
      const evicted = this.evictOne();
      if (!evicted) break; // Safety valve — shouldn't happen
    }

    this.tasks.set(task.id, task);
    this.insertionOrder.push(task.id);
  }

  /**
   * Evict the oldest finished task. If all tasks are active, evict the oldest anyway.
   */
  private evictOne(): boolean {
    // First pass: evict oldest completed/failed/cancelled
    for (let i = 0; i < this.insertionOrder.length; i++) {
      const id = this.insertionOrder[i];
      const task = this.tasks.get(id);
      if (
        task &&
        (task.status === "completed" ||
          task.status === "failed" ||
          task.status === "cancelled")
      ) {
        this.tasks.delete(id);
        this.insertionOrder.splice(i, 1);
        return true;
      }
    }

    // Second pass: evict the absolute oldest regardless of status
    if (this.insertionOrder.length > 0) {
      const id = this.insertionOrder.shift()!;
      this.tasks.delete(id);
      this.pendingQueue = this.pendingQueue.filter((pid) => pid !== id);
      return true;
    }

    return false;
  }

  // ── ID generation ─────────────────────────────────────────────────────────

  private counter = 0;

  private generateId(): string {
    this.counter++;
    return `task_${Date.now().toString(36)}_${this.counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

// ── Global singleton ──────────────────────────────────────────────────────────

const globalForOrchestrator = global as typeof global & {
  __bsmOrchestrator?: Orchestrator;
};

export const orchestrator: Orchestrator =
  (globalForOrchestrator.__bsmOrchestrator ??= new Orchestrator());
