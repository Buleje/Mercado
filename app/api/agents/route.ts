/**
 * POST /api/agents  — Submit a new task to the orchestrator.
 * GET  /api/agents  — List recent tasks with optional filters.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newTraceId, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import {
  orchestrator,
  ensureAgentsRegistered,
} from "@/lib/agents";
import type { AgentDomain, TaskPriority } from "@/lib/agents/types";

// ── Validation schemas ──────────────────────────────────────────────────────

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

const submitTaskSchema = z.object({
  domain: z.enum(VALID_DOMAINS),
  action: z.string().min(1, "action es requerido"),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  priority: z.enum(VALID_PRIORITIES).optional().default("normal"),
});

const listQuerySchema = z.object({
  domain: z.enum(VALID_DOMAINS).optional(),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ── POST — Submit a task ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;

    const body: unknown = await req.json();
    const parsed = submitTaskSchema.safeParse(body);

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

    // SECURITY 2026-05-06: tenantId del JWT (no header) para evitar impersonation
    // cross-tenant. El header x-tenant-id puede venir cruzado en ciertos flows
    // (sticky session de un tenant previo). El JWT es la fuente de verdad.
    const tenantId = admin.tenantId;
    const { domain, action, payload, priority } = parsed.data;

    logger.info("[agents] POST /api/agents — submitTask", {
      traceId,
      tenantId,
      domain,
      action,
      priority,
    });

    await ensureAgentsRegistered();

    const task = await orchestrator.submitTask({
      domain,
      action,
      payload,
      priority,
      tenantId,
      traceId,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── GET — List recent tasks ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;
    const url = new URL(req.url);
    const rawQuery = {
      domain: url.searchParams.get("domain") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    };

    const parsed = listQuerySchema.safeParse(rawQuery);

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

    // SECURITY 2026-05-06: tenantId del JWT (no header) para evitar impersonation
    // cross-tenant. El header x-tenant-id puede venir cruzado en ciertos flows
    // (sticky session de un tenant previo). El JWT es la fuente de verdad.
    const tenantId = admin.tenantId;
    const { domain, status: taskStatus, limit } = parsed.data;

    logger.info("[agents] GET /api/agents — getHistory", {
      traceId,
      tenantId,
      domain,
      status: taskStatus,
      limit,
    });

    await ensureAgentsRegistered();

    const tasks = await orchestrator.getHistory({
      tenantId,
      domain,
      status: taskStatus,
      limit,
    });

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
