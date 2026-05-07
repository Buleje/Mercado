import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { FiadosDB } from "@/lib/db/fiados.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const CobrarSchema = z.object({
  customerPhone: z.string().min(1),
  monto: z.number().positive(),
  notas: z.string().max(500).optional(),
});

/**
 * POST /api/fiados/cobrar
 * Convenience route: cobrar fiado by customer phone.
 * Distributes the payment across active fiados oldest-first.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-cobrar"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

  try {
    const raw = await req.json();
    const parsed = CobrarSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { customerPhone, monto, notas } = parsed.data;

    const result = await FiadosDB.cobrarPorCliente(tenantId, customerPhone, monto, notas);

    if (result.payments.length === 0) {
      return NextResponse.json(
        { error: "No hay fiados activos para este cliente" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      totalCobrado: result.totalCobrado,
      payments: result.payments,
      remaining: result.remaining,
    });
  } catch (e) {
    logger.error("[Fiados Cobrar] unexpected error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
