import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

/**
 * POST /api/cash-registers/close-shift
 * Closes the currently open cash register (best-effort).
 * Called from POSCajaModule.tsx when the user confirms shift close.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
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
