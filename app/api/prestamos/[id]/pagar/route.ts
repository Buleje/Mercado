import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const PagoCuotaSchema = z.object({
  cuotaId: z.string().min(1),
  montoPagado: z.number().positive(),
});

// POST /api/prestamos/[id]/pagar — register cuota payment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = PagoCuotaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // Verify prestamo exists and belongs to tenant
    const existing = await PrestamosDB.getById(auth.tenantId, id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    if (existing.status !== "ACTIVO") {
      return NextResponse.json(
        { error: `No se puede pagar un préstamo con status "${existing.status}"` },
        { status: 422 },
      );
    }

    // Verify the cuota belongs to this prestamo
    const cuota = existing.cuotas.find((c) => c.id === parsed.data.cuotaId);
    if (!cuota) {
      return NextResponse.json({ error: "Cuota no encontrada en este préstamo" }, { status: 404 });
    }
    if (cuota.pagadoEn) {
      return NextResponse.json({ error: "Esta cuota ya fue pagada" }, { status: 422 });
    }

    const updated = await PrestamosDB.registrarPago(auth.tenantId, parsed.data.cuotaId, parsed.data.montoPagado);
    if (!updated) {
      return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 });
    }

    logActivity(
      "Pago", "prestamo",
      `Pago de cuota S/${parsed.data.montoPagado.toFixed(2)} en préstamo ${id.slice(-6)} — status: ${updated.status}`,
      id, auth.username,
    ).catch((err) => logger.error("[prestamos/pagar] logActivity failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[prestamos/id/pagar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
