/**
 * lib/agents/bus.ts
 *
 * Server-side typed event bus for inter-agent communication.
 * Uses a simple Map<string, Set<Function>> pattern — no browser APIs,
 * no external dependencies.
 *
 * Global singleton pattern (survives across requests in the same process).
 */

import { logger } from "@/lib/logger";

// ── Event type map ────────────────────────────────────────────────────────────

export type AgentEventMap = {
  "task:created": {
    taskId: string;
    domain: string;
    action: string;
    tenantId: string;
  };
  "task:started": { taskId: string; domain: string; tenantId: string };
  "task:completed": {
    taskId: string;
    domain: string;
    success: boolean;
    tenantId: string;
  };
  "task:failed": {
    taskId: string;
    domain: string;
    error: string;
    tenantId: string;
  };
  "agent:alert": {
    domain: string;
    level: "info" | "warn" | "critical";
    message: string;
    data?: unknown;
  };
};

export type AgentEventName = keyof AgentEventMap;

type Listener<T> = (payload: T) => void;

// ── Bus implementation ────────────────────────────────────────────────────────

class AgentBus {
  private listeners = new Map<string, Set<Listener<never>>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<E extends AgentEventName>(
    event: E,
    handler: Listener<AgentEventMap[E]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as Listener<never>);

    // Return unsubscribe function
    return () => {
      set.delete(handler as Listener<never>);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  /**
   * Subscribe once — handler is automatically removed after the first invocation.
   */
  once<E extends AgentEventName>(
    event: E,
    handler: Listener<AgentEventMap[E]>,
  ): () => void {
    const wrapper: Listener<AgentEventMap[E]> = (payload) => {
      unsub();
      handler(payload);
    };
    const unsub = this.on(event, wrapper);
    return unsub;
  }

  /**
   * Remove a specific handler from an event.
   */
  off<E extends AgentEventName>(
    event: E,
    handler: Listener<AgentEventMap[E]>,
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as Listener<never>);
    if (set.size === 0) this.listeners.delete(event);
  }

  /**
   * Emit an event to all subscribed listeners.
   * Listeners are called synchronously but errors are caught to prevent
   * one bad listener from breaking the chain.
   */
  emit<E extends AgentEventName>(event: E, payload: AgentEventMap[E]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    for (const handler of set) {
      try {
        (handler as Listener<AgentEventMap[E]>)(payload);
      } catch (err) {
        logger.error("AgentBus listener threw", {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Number of listeners for a given event (useful for tests / health checks).
   */
  listenerCount(event: AgentEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Remove all listeners (useful for tests).
   */
  clear(): void {
    this.listeners.clear();
  }
}

// ── Global singleton ──────────────────────────────────────────────────────────

const globalForBus = global as typeof global & { __bsmAgentBus?: AgentBus };

export const agentBus: AgentBus = (globalForBus.__bsmAgentBus ??=
  new AgentBus());
