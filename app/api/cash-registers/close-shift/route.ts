import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { CashShiftSalesDB } from "@/lib/db/cash-shift-sales.db";
import { montoContado } from "@/lib/caja/monto-contado";
import {
  NOTA_CAJA_CERRAR_SIN_CONTEO,
  NOTA_TURNO_CERRAR_SIN_CONTEO,
  notaCajaCerrarConConteo,
  notaTurnoCerrarConConteo,
} from "@/lib/caja/cierre-sin-conteo";

/**
 * Cuerpo OPCIONAL. Sin cuerpo (o `{}`) = cierre SIN conteo, como siempre. Con
 * `closingAmount` = lo que se contó en el cajón: la diferencia es contado −
 * esperado, con el esperado calculado bajo el lock de la caja (la misma cuenta
 * que `PATCH /api/cash-registers/[id]`).
 */
const BodySchema = z.object({
  closingAmount: montoContado.nullish(),
  notes: z.string().max(2000).nullish(),
});

/**
 * POST /api/cash-registers/close-shift
 * Cierra la caja abierta y el turno activo de quien llama.
 *
 * - Sin `closingAmount`: cierre SIN conteo. La caja se anota con el esperado
 *   como contado (diferencia 0 por construcción) y la nota «Cierre automático…»,
 *   que el arqueo muestra como «Cerrada sin conteo» (nunca «Conforme»).
 * - Con `closingAmount`: arqueo de verdad. Queda la diferencia real y el turno
 *   cierra con lo contado.
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

  // Los clientes viejos no mandan cuerpo: vacío = `{}`. Un cuerpo que NO es
  // JSON se rechaza: tomarlo como «sin conteo» perdería en silencio un monto.
  const texto = await req.text().catch(() => "");
  let crudo: unknown = {};
  if (texto.trim()) {
    try {
      crudo = JSON.parse(texto);
    } catch {
      return NextResponse.json({ error: "Datos inválidos", issues: ["El cuerpo no es JSON."] }, { status: 400 });
    }
  }
  const parsed = BodySchema.safeParse(crudo ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const contado = parsed.data.closingAmount ?? null;
  const notas = parsed.data.notes ?? null;
  const conConteo = contado != null;

  try {
    const open = await CashRegistersDB.getOpen(auth.tenantId);

    if (!open) {
      return NextResponse.json(
        { success: true, message: "No hay caja abierta" },
        { status: 200 }
      );
    }

    // Sin conteo → `null`: el esperado (sólo efectivo, `saldoEsperadoDeCaja`) se
    // calcula y se anota como contado DENTRO del lock del cierre. Con una
    // cuenta propia hecha antes, un movimiento que entraba en el medio dejaba
    // una diferencia que nadie contó.
    const closed = await CashRegistersDB.close(
      auth.tenantId,
      open.id,
      contado,
      conConteo ? notaCajaCerrarConConteo(notas) : NOTA_CAJA_CERRAR_SIN_CONTEO,
    );
    if (!closed) {
      // Otro cierre ganó la carrera: el conteo de este pedido no quedó anotado.
      return NextResponse.json(
        { error: "La caja ya se cerró desde otro lado. Recarga para ver cómo quedó." },
        { status: 409 },
      );
    }
    const esperado = Number(closed.expectedAmount ?? 0);
    const diferencia = Number(closed.difference ?? 0);
    const cierreEfectivo = Number(closed.closingAmount ?? esperado);

    // «Quién cerró» en Cuadrar caja sale de este registro.
    logActivity(
      "Cerrar",
      "caja",
      conConteo
        ? `Cierre con S/${cierreEfectivo.toFixed(2)} (esperado S/${esperado.toFixed(2)}, diferencia S/${diferencia.toFixed(2)})${notas ? ` — ${notas}` : ""}`
        : `Cierre sin conteo desde Cerrar turno (esperado S/${esperado.toFixed(2)})`,
      open.id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.warn("[close-shift] activity log failed", { err: String(err) }));

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
          // La nota decide cómo lo lee el historial de turnos: «Cerrado
          // automaticamente…» = sin conteo (sin diferencia); con conteo, la
          // diferencia de la caja cerrada junto con el turno.
          const updated = await TurnosDB.cerrar(activo.id, auth.tenantId, {
            cierreEfectivo,
            ventasTotal,
            notas: conConteo ? notaTurnoCerrarConConteo(cierreEfectivo, notas) : NOTA_TURNO_CERRAR_SIN_CONTEO,
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
      {
        success: true,
        cashRegister: closed,
        turno: turnoCerrado,
        sinConteo: !conConteo,
        conteo: conConteo ? { contado: cierreEfectivo, esperado, diferencia } : null,
      },
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
