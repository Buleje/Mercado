/**
 * lib/agents/types.ts
 *
 * Core type definitions for the multi-agent runtime.
 * All agent implementations depend on these shared types.
 */

// ── Domain & Status enums ─────────────────────────────────────────────────────

export type AgentDomain =
  | "inventory"
  | "orders"
  | "customers"
  | "analytics"
  | "notifications"
  | "pricing";

export type TaskPriority = "critical" | "high" | "normal" | "low";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ── Priority ranking (lower number = higher priority) ─────────────────────────

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ── Task ──────────────────────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  domain: AgentDomain;
  action: string;
  payload: Record<string, unknown>;
  priority: TaskPriority;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  tenantId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  parentTaskId?: string;
  traceId: string;
}

// ── Result returned by a DomainAgent after execution ──────────────────────────

export interface AgentResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** If the agent needs to delegate work to other domains */
  subtasks?: Pick<AgentTask, "domain" | "action" | "payload" | "priority">[];
  metadata?: Record<string, unknown>;
}

// ── Context injected into every agent execution ───────────────────────────────

export interface AgentContext {
  tenantId: string;
  traceId: string;
  parentTaskId?: string;
}

// ── Contract that every domain agent must satisfy ─────────────────────────────

export interface DomainAgent {
  domain: AgentDomain;
  actions: string[];
  description: string;
  execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult>;
}
