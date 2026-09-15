import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { CashShiftSalesDB } from "@/lib/db/cash-shift-sales.db";

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

    // T8 (audit ventas-caja 2026-05-07): tambien cerrar el turno activo del
    // cajero para evitar estado partido (caja cerrada + turno abierto).
    // Antes el frontend tenia que llamar /api/turnos/[id]/cerrar separado;
    // si fallaba uno, quedaba inconsistencia. Ahora hacemos best-effort
    // close del turno activo aqui mismo. Si falla, logear pero no romper.
    let turnoCerrado: { id: string; ventasTotal: number } | null = null;
    try {
      // T4: lookup centralizado en AdminUsersDB (regla #1).
      const adminUserId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
      if (adminUserId) {
        const activo = await TurnosDB.getActivo(auth.tenantId, adminUserId);
        if (activo) {
          // Audit project-wide 2026-05-19: migrado a CashShiftSalesDB.
          // FIX 2026-07-08 (reporte ventas-caja bug 3/6): Sale.cashierId guarda
          // el username, no el adminUserId. Pasamos AMBAS formas para que el
          // agregado no devuelva S/0.00.
          const cajeroUsername = await AdminUsersDB.getUsernameById(auth.tenantId, adminUserId);
          const ventasTotal = await CashShiftSalesDB.aggregateByCashierShift(
            auth.tenantId,
            [adminUserId, cajeroUsername].filter((v): v is string => !!v),
            new Date(activo.abrioEn),
          );
          const updated = await TurnosDB.cerrar(activo.id, auth.tenantId, {
            cierreEfectivo: closingAmount,
            ventasTotal,
            notas: "Cerrado automaticamente con close-shift",
          });
          if (updated) {
            turnoCerrado = { id: updated.id, ventasTotal };
          }
        }
      }
    } catch (turnoErr) {
      logger.warn("[close-shift] turno close failed (non-blocking)", {
        err: turnoErr instanceof Error ? turnoErr.message : String(turnoErr),
      });
    }

    return NextResponse.json(
      { success: true, cashRegister: closed, turno: turnoCerrado },
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
