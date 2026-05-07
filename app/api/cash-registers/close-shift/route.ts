import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/cash-registers/close-shift
 * Closes the currently open cash register (best-effort).
 * Called from POSCajaModule.tsx when the user confirms shift close.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "cash-registers-close-shift"); if (_rl) return _rl;
  // SECURITY 2026-05-06 (pentest H5): solo admin/owner pueden cerrar turno.
  // Antes el cajero auto-cerraba con `closingAmount` calculado desde
  // movements (sin arqueo físico) → encubría robos del cajero al saltarse
  // el conteo manual. Ahora cajero abre/movimientos pero el cierre con
  // arqueo físico requiere admin.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const open = await CashRegistersDB.getOpen(auth.tenantId);

    if (!open) {
      return NextResponse.json(
        { success: true, message: "No hay caja abierta" },
        { status: 200 }
      );
    }

    // Close using whatever cash is currently counted
    // (the official closing amount is handled in the Arqueo tab — here we do a soft close)
    const closingAmount = open.openingAmount +
      open.movements
        .filter((m) => m.type === "venta" && m.method === "efectivo")
        .reduce((s, m) => s + m.amount, 0) +
      open.movements
        .filter((m) => m.type === "ingreso")
        .reduce((s, m) => s + m.amount, 0) -
      open.movements
        .filter((m) => m.type === "egreso")
        .reduce((s, m) => s + m.amount, 0);

    const closed = await CashRegistersDB.close(
      auth.tenantId,
      open.id,
      closingAmount,
      "Cierre automático desde Cerrar Turno"
    );

    return NextResponse.json(
      { success: true, cashRegister: closed },
      { status: 200 }
    );
  } catch (e) {
    logger.error("[close-shift] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Error al cerrar turno" },
      { status: 500 }
    );
  }
}
