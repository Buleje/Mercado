import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiadosDB } from "@/lib/db/fiados.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const PagoSchema = z.object({
  monto: z.number().positive(),
  notas: z.string().max(500).optional(),
});

// POST /api/fiados/[id]/pagar — register payment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-X-pagar"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = PagoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await FiadosDB.getById(auth.tenantId, id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 });
    }

    if (existing.status !== "ACTIVO") {
      return NextResponse.json(
        { error: `No se puede pagar un fiado con status "${existing.status}"` },
        { status: 422 },
      );
    }

    const updated = await FiadosDB.registerPago(auth.tenantId, id, parsed.data.monto, parsed.data.notas);
    if (!updated) return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 });

    logActivity(
      "Pago", "fiado",
      `Pago de S/${parsed.data.monto.toFixed(2)} en fiado ${id.slice(-6)} — saldo: S/${updated.saldo.toFixed(2)}`,
      id, auth.username,
    ).catch((err) => logger.error("[fiados/pagar] logActivity failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[fiados/id/pagar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
