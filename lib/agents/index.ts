/**
 * lib/agents/index.ts
 *
 * Barrel exports for the multi-agent runtime.
 * Import everything from `@/lib/agents` for a clean public API.
 *
 * Usage:
 *   import { orchestrator, agentRegistry, agentBus } from "@/lib/agents";
 *   import type { AgentTask, DomainAgent, AgentDomain } from "@/lib/agents";
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  AgentDomain,
  TaskPriority,
  TaskStatus,
  AgentTask,
  AgentResult,
  AgentContext,
  DomainAgent,
} from "./types";

export { PRIORITY_RANK } from "./types";

// ── Bus ───────────────────────────────────────────────────────────────────────
export { agentBus } from "./bus";
export type { AgentEventMap, AgentEventName } from "./bus";

// ── Registry ──────────────────────────────────────────────────────────────────
export { agentRegistry } from "./registry";

// ── Context ───────────────────────────────────────────────────────────────────
export { createAgentContext, scopedLogger, scopedCache } from "./context";
export type { ScopedLogger, ScopedCache } from "./context";

// ── Orchestrator ──────────────────────────────────────────────────────────────
export { orchestrator } from "./orchestrator";
export type { SubmitTaskInput, HistoryOptions } from "./orchestrator";

// ── Tool definitions (LLM function calling) ──────────────────────────────────
export { ALL_AGENT_TOOLS, resolveToolCall, getToolsByDomain } from "./tool-definitions";
export type { ToolDefinition, ToolMapping } from "./tool-definitions";

// ── Lazy agent registration ───────────────────────────────────────────────────

let registered = false;

/**
 * Ensures all domain agents are registered with the registry.
 * Safe to call multiple times — only runs the registration logic once.
 *
 * Call this from API routes or server actions before using the orchestrator:
 *
 *   import { ensureAgentsRegistered, orchestrator } from "@/lib/agents";
 *   await ensureAgentsRegistered();
 *   orchestrator.submitTask({ ... });
 *
 * Domain agents are dynamically imported so their code is only loaded
 * when the agent system is actually used (keeps cold starts fast).
 */
export async function ensureAgentsRegistered(): Promise<void> {
  if (registered) return;
  registered = true;

  const { agentRegistry: reg } = await import("./registry");
  const { logger: log } = await import("@/lib/logger");

  // Dynamic imports — agents are only loaded when the system is actually used
  const [
    { inventoryAgent },
    { ordersAgent },
    { customersAgent },
    { analyticsAgent },
    { notificationsAgent },
    { pricingAgent },
    { forestalAgent },
    { documentosAgent },
    { cajaAgent },
    { cobranzasAgent },
    { uiAgent },
  ] = await Promise.all([
    import("./domains/inventory.agent"),
    import("./domains/orders.agent"),
    import("./domains/customers.agent"),
    import("./domains/analytics.agent"),
    import("./domains/notifications.agent"),
    import("./domains/pricing.agent"),
    import("./domains/forestal.agent"),
    import("./domains/documentos.agent"),
    import("./domains/caja.agent"),
    import("./domains/cobranzas.agent"),
    import("./domains/ui.agent"),
  ]);

  reg.register(inventoryAgent);
  reg.register(ordersAgent);
  reg.register(customersAgent);
  reg.register(analyticsAgent);
  reg.register(notificationsAgent);
  reg.register(pricingAgent);
  reg.register(forestalAgent);
  reg.register(documentosAgent);
  reg.register(cajaAgent);
  reg.register(cobranzasAgent);
  reg.register(uiAgent);

  // Initialize event hooks
  const { initAgentHooks } = await import("./hooks");
  initAgentHooks();

  log.info("Agent system initialized", {
    registeredAgents: reg.health(),
  });
}
