/**
 * GET   /api/agents/:taskId — Get task status and details.
 * PATCH /api/agents/:taskId — Cancel a running/pending task.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { newTraceId, toErrorPayload, NotFoundError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import {
  orchestrator,
  ensureAgentsRegistered,
} from "@/lib/agents";

// ── Route context typing ────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

// ── GET — Retrieve a single task ────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: RouteParams,
) {
  const traceId = newTraceId();
  try {
    const { taskId } = await context.params;

    logger.info("[agents] GET /api/agents/:taskId", { traceId, taskId });

    await ensureAgentsRegistered();

    const task = await orchestrator.getTask(taskId);

    if (!task) {
      throw new NotFoundError(`Task ${taskId}`);
    }

    return NextResponse.json({ task }, { status: 200 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── PATCH — Cancel a task ───────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: RouteParams,
) {
  const traceId = newTraceId();
  try {
    const admin = await requireAdmin(req, ["owner", "admin"]);
    if (admin instanceof NextResponse) return admin;

    const { taskId } = await context.params;

    logger.info("[agents] PATCH /api/agents/:taskId — cancel", {
      traceId,
      taskId,
    });

    await ensureAgentsRegistered();

    const cancelled = await orchestrator.cancelTask(taskId);

    if (!cancelled) {
      throw new NotFoundError(`Task ${taskId}`);
    }

    return NextResponse.json({ cancelled: true }, { status: 200 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
