import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiadosDB, FiadoConflictError, FiadoOverpaymentError } from "@/lib/db/fiados.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { METODOS_COBRO, etiquetaCobroFiado, notasConMetodo } from "@/lib/fiados/cobro-metodo";

const PagoSchema = z.object({
  monto: z.number().positive(),
  notas: z.string().max(500).optional(),
  /** Medio del pago: va al inicio de la nota y al ingreso de la caja. */
  metodo: z.enum(METODOS_COBRO).optional(),
  /** true = el cobro entra también a la caja abierta (misma transacción). */
  aCaja: z.boolean().optional(),
});

// POST /api/fiados/[id]/pagar — register payment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-X-pagar"); if (_rl) return _rl;
  // Con `aCaja` el cobro mete plata en la caja: mismos roles que /cobrar y /cobro-masivo.
  const auth = await requireAdmin(req, ["admin", "cajero"]);
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

    // VENCIDO también se cobra (antes daba 422; el cobro masivo y el del POS
    // ya lo aceptaban). Sólo PAGADO y CANCELADO quedan cerrados.
    if (existing.status !== "ACTIVO" && existing.status !== "VENCIDO") {
      return NextResponse.json(
        { error: `No se puede pagar un fiado con status "${existing.status}"` },
        { status: 422 },
      );
    }

    const { monto, metodo, aCaja } = parsed.data;
    const caja = aCaja
      ? { metodo: metodo ?? "efectivo", etiqueta: etiquetaCobroFiado(existing.customerName || existing.customerId) }
      : undefined;
    const updated = await FiadosDB.registerPago(auth.tenantId, id, monto, notasConMetodo(metodo, parsed.data.notas), caja);
    if (!updated) return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 });

    logActivity(
      "Pago", "fiado",
      `Pago de S/${parsed.data.monto.toFixed(2)} en fiado ${id.slice(-6)} — saldo: S/${updated.saldo.toFixed(2)}`,
      id, auth.username, undefined, auth.tenantId,
    ).catch((err) => logger.error("[fiados/pagar] logActivity failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    // Audit 2026-05-17 P1-3: race-condition de Prisma → 409 Conflict (no 503),
    // que es la diferencia entre "DB caída, no reintentar" y "alguien escribió
    // antes, reintentá".
    if (e instanceof FiadoConflictError) {
      return NextResponse.json(
        { error: e.message, code: "FIADO_CONFLICT", retryable: true },
        { status: 409 },
      );
    }
    // Audit 2026-08-26: overpayment es un error de VALIDACIÓN (el cajero se
    // equivocó de monto), no de infraestructura — antes caía al catch
    // genérico de abajo y el cajero veía "Database error" 503 en vez de
    // "el pago excede el saldo en X.XX".
    if (e instanceof FiadoOverpaymentError) {
      return NextResponse.json({ error: e.message, code: "FIADO_OVERPAYMENT" }, { status: 400 });
    }
    logger.error("[fiados/id/pagar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
