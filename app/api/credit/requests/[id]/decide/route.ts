import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { CreditRequestsDB } from "@/lib/db/credit-requests.db";
import { CreditDB } from "@/lib/db/credit.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/credit/requests/[id]/decide
 *
 * El dueño aprueba o rechaza una solicitud de línea de fiado (Frente 3).
 * Aprobar → CreditDB.grantLimit fija la línea (manualCreditLimit + creditLimit +
 * availableCredit) → desbloquea el fiado en checkout de inmediato.
 *
 * Solo admin/manager. CSRF + rate limit. Totales/límite se fijan en backend.
 */

const BodySchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    approvedLimit: z.number().positive().max(100000).optional(),
    note: z.string().trim().max(280).optional(),
  })
  .refine((d) => d.action !== "approve" || (d.approvedLimit != null && d.approvedLimit > 0), {
    message: "approvedLimit requerido para aprobar",
    path: ["approvedLimit"],
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "credit-request-decide");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const existing = await CreditRequestsDB.getById(auth.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: `La solicitud ya fue ${existing.status === "APPROVED" ? "aprobada" : "rechazada"}.` },
        { status: 422 },
      );
    }

    const isApprove = parsed.data.action === "approve";

    // Aprobar: fijar la línea ANTES de marcar la solicitud, así si el grant
    // falla la solicitud queda PENDING (reintentar), no "aprobada sin línea".
    if (isApprove) {
      await CreditDB.grantLimit(
        auth.tenantId,
        existing.customerId,
        parsed.data.approvedLimit!,
        existing.customerName,
      );
    }

    const updated = await CreditRequestsDB.decide(auth.tenantId, id, {
      status: isApprove ? "APPROVED" : "REJECTED",
      approvedLimit: isApprove ? parsed.data.approvedLimit : null,
      decidedBy: auth.username,
      decisionNote: parsed.data.note ?? null,
    });

    logActivity(
      isApprove ? "Aprobó" : "Rechazó",
      "fiado",
      isApprove
        ? `Solicitud de fiado de ${existing.customerName ?? existing.customerId} aprobada — línea S/${parsed.data.approvedLimit!.toFixed(2)}`
        : `Solicitud de fiado de ${existing.customerName ?? existing.customerId} rechazada`,
      id,
      auth.username,
    ).catch((err) => logger.error("[credit/decide] logActivity failed", { error: String(err) }));

    return NextResponse.json({ ok: true, request: updated });
  } catch (err) {
    logger.error("[credit/requests/decide] error", { error: String(err) });
    return NextResponse.json({ error: "No se pudo procesar la decisión" }, { status: 503 });
  }
}
