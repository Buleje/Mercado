/**
 * lib/agents/types.ts
 *
 * Core type definitions for the multi-agent runtime.
 * All agent implementations depend on these shared types.
 */

// ── Domain & Status enums ─────────────────────────────────────────────────────

/**
 * Los dominios, como VALOR y no sólo como tipo.
 *
 * `/api/agents/execute` tenía su propia copia de la lista y quedó vieja: los
 * dominios nuevos existían, estaban registrados, y ese endpoint los rechazaba
 * con "dominio inválido". Un tipo no valida en runtime; esta constante sí, y
 * `AgentDomain` se deriva de ella para que no puedan divergir.
 */
export const AGENT_DOMAINS = [
  "inventory",
  "orders",
  "customers",
  "analytics",
  "notifications",
  "pricing",
  "forestal",
  "documentos",
  "caja",
  "cobranzas",
  "ui",
  // Escritura de plata dictada («anotame el combustible del camión N12»).
  // Todas sus acciones de escritura pasan por confirmación humana (HITL).
  "plata",
  // Puente con n8n: disparar flujos ya armados por el usuario.
  "n8n",
  // Actividades, citas y recordatorios dictados («recordame el lunes…»).
  // Escribe sobre el `Reminder` que ya se ve en el panel.
  "agenda",
] as const;

export type AgentDomain = (typeof AGENT_DOMAINS)[number];

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
