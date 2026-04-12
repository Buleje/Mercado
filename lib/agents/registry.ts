/**
 * lib/agents/registry.ts
 *
 * Singleton registry for all domain agents.
 * Agents register themselves here; the orchestrator looks them up at runtime.
 *
 * Global singleton pattern (survives across requests in the same process).
 */

import { logger } from "@/lib/logger";
import { getCircuitStatus } from "@/lib/circuit-breaker";
import type { AgentDomain, DomainAgent } from "./types";

// ── Registry implementation ───────────────────────────────────────────────────

class AgentRegistry {
  private agents = new Map<AgentDomain, DomainAgent>();

  /**
   * Register a domain agent.
   * Overwrites any previously registered agent for the same domain (with a warning).
   */
  register(agent: DomainAgent): void {
    if (this.agents.has(agent.domain)) {
      logger.warn("AgentRegistry: overwriting existing agent", {
        domain: agent.domain,
      });
    }
    this.agents.set(agent.domain, agent);
    logger.info("AgentRegistry: agent registered", {
      domain: agent.domain,
      actions: agent.actions,
      description: agent.description,
    });
  }

  /**
   * Look up a domain agent.
   */
  get(domain: AgentDomain): DomainAgent | undefined {
    return this.agents.get(domain);
  }

  /**
   * Return all registered agents.
   */
  getAll(): DomainAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if a specific domain+action pair can be handled.
   */
  canHandle(domain: AgentDomain, action: string): boolean {
    const agent = this.agents.get(domain);
    if (!agent) return false;
    return agent.actions.includes(action);
  }

  /**
   * Health snapshot of all registered agents.
   */
  health(): { domain: AgentDomain; status: "registered"; actions: string[] }[] {
    return Array.from(this.agents.values()).map((agent) => ({
      domain: agent.domain,
      status: "registered" as const,
      actions: agent.actions,
    }));
  }

  /**
   * Alias for getAll() — used by API routes.
   */
  listAll(): DomainAgent[] {
    return this.getAll();
  }

  /**
   * Get circuit breaker state for a domain agent.
   */
  getCircuitState(domain: AgentDomain): string {
    return getCircuitStatus(`agent:${domain}`).state;
  }

  /**
   * Number of registered agents.
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Remove all agents (useful for tests).
   */
  clear(): void {
    this.agents.clear();
  }
}

// ── Global singleton ──────────────────────────────────────────────────────────

const globalForRegistry = global as typeof global & {
  __bulejeAgentRegistry?: AgentRegistry;
};

export const agentRegistry: AgentRegistry =
  (globalForRegistry.__bulejeAgentRegistry ??= new AgentRegistry());
