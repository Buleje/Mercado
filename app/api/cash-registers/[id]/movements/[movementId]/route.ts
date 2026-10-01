import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { toErrorPayload } from "@/lib/api-error";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { CashRegistersMovementsDB, MedioNoCambiadoError } from "@/lib/db/cash-registers-movements.db";
import { METODOS_DE_CAJA } from "@/lib/caja/saldo-esperado";
import { nombreDelMedio } from "@/lib/caja/cambiar-medio";

/**
 * PATCH /api/cash-registers/[id]/movements/[movementId] — corregir el MEDIO de
 * un ingreso o egreso ya anotado en una caja ABIERTA.
 *
 * Para qué: un adelanto que se anotó como «efectivo» y se pagó por
 * transferencia hace que el esperado del cajón dé un número imposible (medido
 * 2026-09-28: −S/ 6 424 en el negocio real). Esto lo corrige sin tocar el monto.
 *
 * Quién: sólo admin y dueño. Cambiar el medio mueve el esperado del arqueo — si
 * el cajero pudiera, podría «justificar» un faltante pasándolo a Yape. El
 * encargado entra a `requireAdmin` por el management tier; `soloAdminODueno`
 * lo corta.
 *
 * Cuerpo: `{ method: "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia" }`.
 * Respuesta 200: `{ movimiento, metodoAnterior, esperadoAntes, esperadoDespues }`.
 * 404 caja o movimiento de otro negocio / inexistente · 409 caja cerrada, tipo
 * que no es ingreso/egreso, mismo medio, pago de una liquidación (su medio
 * está también en el acta) o carrera (`motivo`).
 *
 * Queda en el registro de la caja (`ActivityLog`, entidad `movimiento_caja`):
 * quién, el medio de antes y el de después, y cómo se movió el esperado.
 */
const CambiarMedioSchema = z.object({ method: z.enum(METODOS_DE_CAJA) });

/** Un cuid mide 25; el tope sólo corta basura antes de ir a la base. */
const idValido = (s: string) => s.length > 0 && s.length <= 60;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; movementId: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cash-registers-cambiar-medio");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const noEsDueno = soloAdminODueno(auth.role, "cambiar el medio de un movimiento de caja");
  if (noEsDueno) return noEsDueno;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const { id, movementId } = await params;
      if (!idValido(id) || !idValido(movementId)) {
        return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
      }
      const parsed = CambiarMedioSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Elige un medio válido: efectivo, Yape, Plin, tarjeta o transferencia." },
          { status: 400 },
        );
      }
      const metodo = parsed.data.method;

      const cambio = await CashRegistersMovementsDB.cambiarMedio(auth.tenantId, {
        cashRegisterId: id,
        movementId,
        metodo,
      });
      if (!cambio) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });

      const m = cambio.movimiento;
      const tipo = m.type === "egreso" ? "Egreso" : "Ingreso";
      logActivity(
        "Editar",
        "movimiento_caja",
        `Medio corregido · ${tipo} de S/${m.amount.toFixed(2)}${m.description ? ` «${m.description}»` : ""}: ` +
          `${nombreDelMedio(cambio.metodoAnterior)} → ${nombreDelMedio(metodo)} ` +
          `(esperado S/${cambio.esperadoAntes.toFixed(2)} → S/${cambio.esperadoDespues.toFixed(2)})`,
        m.id,
        auth.username,
        undefined,
        auth.tenantId,
      ).catch((err) => logger.warn("[cash-registers/cambiar-medio] activity log failed", { err: String(err) }));

      return NextResponse.json(cambio);
    } catch (err) {
      if (err instanceof MedioNoCambiadoError) {
        return NextResponse.json({ error: err.message, motivo: err.motivo }, { status: 409 });
      }
      logger.error("[cash-registers/cambiar-medio] failed", { err: err instanceof Error ? err.message : String(err) });
      const { payload, status } = toErrorPayload(err);
      return NextResponse.json(payload, { status });
    }
  });
}
