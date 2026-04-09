/**
 * GET /api/agents/health
 *
 * Public health check for the multi-agent system.
 * Returns agent registry status, active task count, and circuit breaker states.
 * No authentication required — intended for monitoring and load balancers.
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  agentRegistry,
  orchestrator,
  ensureAgentsRegistered,
} from "@/lib/agents";

/** Process-level start timestamp for uptime calculation. */
const BOOT_TIME = Date.now();

export async function GET() {
  try {
    await ensureAgentsRegistered();

    const registeredAgents = agentRegistry.listAll();
    const activeTasks = orchestrator.activeCount;

    const agents = registeredAgents.map((agent) => ({
      domain: agent.domain,
      status: "active" as const,
      actions: agent.actions,
      circuitState: agentRegistry.getCircuitState
        ? agentRegistry.getCircuitState(agent.domain)
        : "closed",
    }));

    const hasDegraded = agents.some(
      (a) => a.circuitState === "open" || a.circuitState === "half-open",
    );

    const healthStatus = hasDegraded ? "degraded" : "healthy";

    logger.info("[agents] GET /api/agents/health", {
      status: healthStatus,
      agentCount: agents.length,
      activeTasks,
    });

    return NextResponse.json(
      {
        status: healthStatus,
        agents,
        activeTasks,
        uptime: Math.floor((Date.now() - BOOT_TIME) / 1000),
      },
      { status: healthStatus === "healthy" ? 200 : 503 },
    );
  } catch (err) {
    logger.error("[agents] Health check failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      {
        status: "degraded",
        agents: [],
        activeTasks: 0,
        uptime: Math.floor((Date.now() - BOOT_TIME) / 1000),
        error: "No se pudo obtener estado de agentes",
      },
      { status: 503 },
    );
  }
}
