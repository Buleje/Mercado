/**
 * POST /api/superadmin/vendor-applications/[id]/review
 *
 * Body: { action, note? }
 *  action ∈ start_review | request_info | approve | reject | reopen
 *
 * Transiciona el state machine + registra la review en
 * VendorApplicationReview + invalida cache.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getPlatformSession,
  PLATFORM_SESSION,
} from "@/lib/superadmin-session";
import {
  VendorApplicationsDB,
  InvalidStateTransitionError,
  ApplicationNotFoundError,
} from "@/lib/db/vendor-applications.db";
import { toSuperadminView } from "@/lib/vendor/registration-mapper";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const ReviewBody = z
  .object({
    action: z.enum([
      "start_review",
      "request_info",
      "approve",
      "reject",
      "reopen",
    ]),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "reject" && !data.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Para rechazar hay que dar un motivo",
      });
    }
    if (data.action === "request_info" && !data.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Describí qué info necesitas",
      });
    }
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-vendor-applications-X-review"); if (_rl) return _rl;
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getPlatformSession(platformToken);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch (err) {
    logger.warn("[api/superadmin/vendor-applications/review] invalid json", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const parsed = ReviewBody.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: first?.message ?? "Datos inválidos",
        field: first?.path.join("."),
      },
      { status: 400 },
    );
  }

  const { action, note } = parsed.data;
  const reviewer = session.username;

  try {
    let updated;
    switch (action) {
      case "start_review":
        updated = await VendorApplicationsDB.startReview(id, reviewer);
        break;
      case "request_info":
        updated = await VendorApplicationsDB.requestInfo(
          id,
          reviewer,
          note ?? "",
        );
        break;
      case "approve":
        updated = await VendorApplicationsDB.approve(id, reviewer, note ?? null);
        break;
      case "reject":
        updated = await VendorApplicationsDB.reject(id, reviewer, note ?? "");
        break;
      case "reopen":
        updated = await VendorApplicationsDB.reopen(id, reviewer, note);
        break;
    }

    // COMPLIANCE 2026-05-06 (Ley 29733 Art. 18): trazar acciones de review.
    // VendorApplication contiene PII del solicitante (RUC, DNI, email, phone).
    // Las decisiones aprobar/rechazar/reabrir deben quedar auditadas.
    try {
      const { logSuperadminAction } = await import("@/lib/audit/superadmin-audit");
      logSuperadminAction(
        `vendor_${action}`,
        `Vendor application ${id} → ${action} por ${reviewer}`,
        {
          applicationId: id,
          action,
          note: note?.slice(0, 200) ?? null,
          businessName: updated?.businessName ?? null,
          ruc: updated?.ruc ?? null,
          ip: req.headers.get("x-forwarded-for") ?? null,
          timestamp: new Date().toISOString(),
        },
        reviewer,
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    } catch { /* audit logger not available */ }

    return NextResponse.json({
      ok: true,
      application: toSuperadminView(updated),
      lastReview: updated.reviews.at(-1),
    });
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      return NextResponse.json(
        {
          error: `No se puede ${action} desde el estado "${err.from}"`,
          code: err.code,
          from: err.from,
          to: err.to,
        },
        { status: 409 },
      );
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json(
        { error: "Aplicación no encontrada", code: err.code },
        { status: 404 },
      );
    }
    logger.error("[api/superadmin/vendor-applications/review] unexpected", {
      applicationId: id,
      action,
      reviewer,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error inesperado procesando la revisión" },
      { status: 500 },
    );
  }
}
