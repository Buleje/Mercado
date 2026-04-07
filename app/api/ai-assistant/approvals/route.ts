/**
 * app/api/ai-assistant/approvals/route.ts
 *
 * HITL approvals API (Excel Agentes IA práctica #10, TD-025).
 *
 * GET  /api/ai-assistant/approvals
 *   Lista las aprobaciones pendientes para el tenant autenticado.
 *
 * POST /api/ai-assistant/approvals
 *   Body: { id: string, action: "approve" | "reject" }
 *   Si action="approve", ejecuta el tool vía orchestrator con el payload
 *   stashado. Si action="reject", descarta sin ejecutar.
 *
 * Auth: requiere admin (cualquier rol admin). Para permisos más finos,
 * agregar un campo `requiredRole` a las tool definitions.
 *
 * Frontend consumer (pendiente, sesión futura): AICommandCenter.tsx hará
 * polling a GET cada N segundos para mostrar modal de aprobación, y POST
 * al resolver.
 */

export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { orchestrator } from "@/lib/agents";
import {
  listPendingApprovals,
  getPendingApproval,
  removePendingApproval,
} from "@/lib/agents/pending-approvals";

// ── GET: list pending approvals ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", "approvals-get");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const pending = listPendingApprovals(auth.tenantId);
  return NextResponse.json({
    pending: pending.map((p) => ({
      id: p.id,
      toolName: p.toolName,
      domain: p.domain,
      action: p.action,
      payload: p.payload,
      conversationId: p.conversationId,
      requestedBy: p.requestedBy,
      createdAt: p.createdAt,
      ageSeconds: Math.round((Date.now() - p.createdAt) / 1000),
    })),
    count: pending.length,
  });
}

// ── POST: resolve approval ───────────────────────────────────────────────────

const ResolveSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
});

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "STRICT", "approvals-resolve");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const approval = getPendingApproval(parsed.data.id);
  if (!approval) {
    return NextResponse.json(
      { error: "Approval not found or expired (TTL 10 min)" },
      { status: 404 },
    );
  }

  // Multi-tenant isolation — solo el tenant del approval puede resolverlo
  if (approval.tenantId !== auth.tenantId) {
    logger.warn("[approvals] cross-tenant resolve attempt blocked", {
      requesterTenant: auth.tenantId,
      approvalTenant: approval.tenantId,
      approvalId: approval.id,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.action === "reject") {
    removePendingApproval(parsed.data.id);
    logger.info("[approvals] rejected", {
      id: approval.id,
      toolName: approval.toolName,
      rejectedBy: auth.username,
    });
    return NextResponse.json({
      id: approval.id,
      action: "reject",
      resolvedBy: auth.username,
      resolvedAt: Date.now(),
    });
  }

  // action === "approve" — ejecutar el tool con el payload stashado
  try {
    const result = await orchestrator.executeSync({
      domain: approval.domain as Parameters<typeof orchestrator.executeSync>[0]["domain"],
      action: approval.action,
      payload: approval.payload,
      tenantId: approval.tenantId,
    });

    removePendingApproval(parsed.data.id);
    logger.info("[approvals] approved and executed", {
      id: approval.id,
      toolName: approval.toolName,
      approvedBy: auth.username,
      success: result.success,
    });

    return NextResponse.json({
      id: approval.id,
      action: "approve",
      resolvedBy: auth.username,
      resolvedAt: Date.now(),
      result: result.success ? result.data : null,
      error: result.success ? null : result.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    logger.error("[approvals] execution failed after approval", {
      id: approval.id,
      error: msg,
    });
    return NextResponse.json(
      { error: `Execution failed: ${msg}` },
      { status: 500 },
    );
  }
}
