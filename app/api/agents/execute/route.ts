/**
 * POST /api/agents/execute
 *
 * Synchronous execution endpoint for agent tasks.
 * Submits a task and waits for its completion before responding.
 * Ideal for dashboard widgets and UI components that need immediate results.
 *
 * Timeout: 30 seconds — if the task does not complete in time,
 * returns the task in its current state with a timeout flag.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newTraceId, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import {
  orchestrator,
  agentBus,
  ensureAgentsRegistered,
} from "@/lib/agents";
import type { AgentDomain, TaskPriority } from "@/lib/agents/types";

// ── Constants ───────────────────────────────────────────────────────────────

const EXECUTION_TIMEOUT_MS = 30_000;

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_DOMAINS: [AgentDomain, ...AgentDomain[]] = [
  "inventory",
  "orders",
  "customers",
  "analytics",
  "notifications",
  "pricing",
];

const VALID_PRIORITIES: [TaskPriority, ...TaskPriority[]] = [
  "critical",
  "high",
  "normal",
  "low",
];

const executeSchema = z.object({
  domain: z.enum(VALID_DOMAINS),
  action: z.string().min(1, "action es requerido"),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  priority: z.enum(VALID_PRIORITIES).optional().default("normal"),
  // SECURITY 2026-05-06: tenantId del body REMOVIDO — se ignora si llega.
  // El tenantId de ejecución se toma SIEMPRE del JWT (admin.tenantId).
  // Antes esto permitía que un admin de tenant A inyectara tenantId=B en el
  // body y ejecutara tasks contra el tenant B.
});

// ── POST — Execute task synchronously ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;

    const body: unknown = await req.json();
    const parsed = executeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
            traceId,
          },
        },
        { status: 400 },
      );
    }

    // tenantId del JWT — fuente única de verdad. Header y body se ignoran.
    const tenantId = admin.tenantId;
    const { domain, action, payload, priority } = parsed.data;

    logger.info("[agents] POST /api/agents/execute — sync execution", {
      traceId,
      tenantId,
      domain,
      action,
      priority,
    });

    await ensureAgentsRegistered();

    // Submit the task
    const task = await orchestrator.submitTask({
      domain,
      action,
      payload,
      priority,
      tenantId,
      traceId,
    });

    // Wait for task completion or timeout
    const completedTask = await waitForCompletion(task.id);

    return NextResponse.json({ task: completedTask }, { status: 200 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wait for a task to reach a terminal state (completed | failed | cancelled)
 * or timeout after EXECUTION_TIMEOUT_MS.
 */
function waitForCompletion(taskId: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (fallback: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      unsubCompleted();
      unsubFailed();
      clearTimeout(timer);
      resolve((orchestrator.getTask(taskId) as Record<string, unknown> | undefined) ?? fallback);
    };

    const unsubCompleted = agentBus.on("task:completed", (data) => {
      if (data.taskId === taskId) settle({ id: taskId, status: "completed" });
    });

    const unsubFailed = agentBus.on("task:failed", (data) => {
      if (data.taskId === taskId) settle({ id: taskId, status: "failed", error: data.error });
    });

    const timer = setTimeout(() => {
      logger.warn("[agents] Execute timeout", { taskId, timeoutMs: EXECUTION_TIMEOUT_MS });
      settle({ id: taskId, status: "running", _timeout: true });
    }, EXECUTION_TIMEOUT_MS);

    // Check if already completed synchronously
    const current = orchestrator.getTask(taskId);
    if (current && (current.status === "completed" || current.status === "failed" || current.status === "cancelled")) {
      settle(current as unknown as Record<string, unknown>);
    }
  });
}
