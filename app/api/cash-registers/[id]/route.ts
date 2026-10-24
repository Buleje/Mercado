import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { CashRegisterOwnershipDB } from "@/lib/db/cash-registers-by-id.db";
import { requireAdmin } from "@/lib/require-admin";
import { sendCashSummaryEmail } from "@/lib/mailer";
import { resumenCierreDeCaja } from "@/lib/caja/resumen-cierre";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/create-notification";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { z } from "zod";
import { METODOS_DE_CAJA, saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { TOPE_CAJA, montoContado } from "@/lib/caja/monto-contado";
import { nombreDelMedio } from "@/lib/caja/cambiar-medio";

/** El motivo «Cobro pendiente (fiado)» que ofrecía «Registrar ingreso» (prefijo de la descripción). */
const ES_COBRO_DE_FIADO_SUELTO = /^cobro pendiente\b/i;

// Umbral de anomalia en arqueo: diferencias mayores generan alerta admin.
const ANOMALY_THRESHOLD_SOL = 50;

/**
 * F4 (revisión de seguridad): el cuerpo se validaba con un `as {…}`. Un cajero
 * podía mandar como «medio» cualquier texto — `<img src=x onerror=…>` terminaba
 * en el HTML del reporte impreso que abre el admin — y montos negativos. Ahora:
 * acción de un enum, medio de la lista fija de la caja, monto > 0 con tope.
 */
const PatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("close"),
    closingAmount: montoContado,
    notes: z.string().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("movement"),
    type: z.enum(["ingreso", "egreso"]).default("ingreso"),
    amount: z.number().finite().positive("El monto debe ser mayor que 0.").max(TOPE_CAJA, "Monto fuera de rango."),
    method: z.enum(METODOS_DE_CAJA).default("efectivo"),
    description: z.string().max(500).default(""),
    saleId: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal("arqueo"),
    closingAmount: montoContado,
    notes: z.string().max(2000).nullish(),
  }),
]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const reg = await CashRegistersDB.getById(auth.tenantId, id);
    if (!reg) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(reg);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  // 17-10: movimientos, arqueo y cierre. Antes MODERATE por IP antes del login:
  // los cajeros de la bodega se gastaban el cupo entre ellos. Ahora por usuario.
  const _rl = await applyRateLimit(req, "MODERATE", `cash-registers-X:${auth.tenantId}:${auth.username}`);
  if (_rl) return _rl;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const { id } = await params;
      const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
          { status: 400 },
        );
      }
      const body = parsed.data;

      if (body.action === "close") {
        const closingAmount = body.closingAmount;
        const notes = body.notes ?? undefined;
        const reg = await CashRegistersDB.close(auth.tenantId, id, closingAmount, notes);
        // Sin caja cerrada no hay «Cerrar» que anotar: el que perdió la carrera
        // dejaba un «Cerrar» (esperado S/0.00) y Cuadrar caja lo mostraba como quien cerró.
        if (!reg) {
          /* M30: reintentar un cierre que SÍ se hizo (la respuesta se perdió en
             la red) decía «no encontrada». Ahora dice que ya estaba cerrada y
             devuelve ese primer cierre, sin escribir nada: el cierre es único. */
          const yaCerrada = await CashRegistersDB.getById(auth.tenantId, id);
          if (yaCerrada?.closedAt) {
            return NextResponse.json({ error: "Esta caja ya estaba cerrada.", yaCerrada: true, caja: yaCerrada }, { status: 409 });
          }
          return NextResponse.json({ error: "Register not found" }, { status: 404 });
        }
        // Cerrar es el otro momento en que se fija el dinero: queda quién contó,
        // cuánto declaró y qué diferencia dio contra lo esperado.
        const esperado = Number(reg?.expectedAmount ?? reg?.openingAmount ?? 0);
        const dif = Math.round((closingAmount - esperado) * 100) / 100;
        logActivity(
          "Cerrar",
          "caja",
          `Cierre con S/${closingAmount.toFixed(2)} (esperado S/${esperado.toFixed(2)}, diferencia S/${dif.toFixed(2)})${notes ? ` — ${notes}` : ""}`,
          id,
          auth.username,
          undefined,
          auth.tenantId,
        ).catch((err) => logger.warn("[cash-registers] activity log failed", { err: String(err) }));

        // Send summary email (fire and forget — do not block response).
        // Los renglones salen de la MISMA cuenta que el cierre
        // (`resumenCierreDeCaja` → `saldoEsperadoDeCaja`): sólo efectivo, y lo
        // de Yape/transferencia en su línea aparte.
        sendCashSummaryEmail(resumenCierreDeCaja(reg, closingAmount, notes)).catch((err) =>
          logger.warn("[cash-registers] cash summary email failed", { err: String(err) }),
        );

        return NextResponse.json(reg);
      }

      if (body.action === "movement") {
        // SECURITY 2026-05-06 (pentest H003): verificar tenant ownership.
        if (!(await CashRegisterOwnershipDB.assertOwnership(id, auth.tenantId))) {
          return NextResponse.json({ error: "Register not found" }, { status: 404 });
        }
        /* Un cobro de fiado no es un ingreso suelto: entraba a la caja pero la
           deuda seguía viva y se podía cobrar otra vez. Se cobra en Me deben,
           que baja el saldo y anota la entrada a la caja en la misma operación.
           (El modal ya no ofrece el motivo; esto ataja una pestaña vieja.) */
        if (body.type === "ingreso" && ES_COBRO_DE_FIADO_SUELTO.test(body.description.trim())) {
          return NextResponse.json(
            { error: "Los cobros de fiado se registran en Ventas y caja › Me deben: ahí baja la deuda y entra a la caja." },
            { status: 422 },
          );
        }
        const movement = await CashRegistersDB.addMovement(
          id,
          { type: body.type, amount: body.amount, method: body.method, description: body.description, saleId: body.saleId },
          auth.tenantId,
        );
        /* M28: los ingresos y egresos anotados desde la caja (este camino, el de
           «Registrar ingreso/egreso») no dejaban rastro en «Quién tocó la caja»:
           sólo los dejaba la ruta vieja `movements`. Mismo molde que esa. */
        logActivity(
          "Crear",
          "movimiento_caja",
          `${body.type === "ingreso" ? "Ingreso" : "Egreso"} manual de S/${body.amount.toFixed(2)}${body.method !== "efectivo" ? ` por ${nombreDelMedio(body.method)}` : ""} — ${body.description}`,
          movement?.id,
          auth.username,
          undefined,
          auth.tenantId,
        ).catch((err) => logger.warn("[cash-registers] activity log failed", { err: String(err) }));
        return NextResponse.json(movement, { status: 201 });
      }

      if (body.action === "arqueo") {
        if (!(await CashRegisterOwnershipDB.assertOwnership(id, auth.tenantId))) {
          return NextResponse.json({ error: "Register not found" }, { status: 404 });
        }
        const arqueoAmount = body.closingAmount;
        const movement = await CashRegistersDB.addMovement(
          id,
          { type: "arqueo", amount: arqueoAmount, method: "efectivo", description: body.notes ? `Arqueo express: ${body.notes}` : "Arqueo express" },
          auth.tenantId,
        );

        // Anomaly detection: si el arqueo tiene diferencia con el esperado
        // mayor al umbral, alertar al admin via notification + push.
        let esperadoDelArqueo: number | null = null;
        try {
          /* El esperado de la caja ABIERTA, con LA cuenta del cierre. Antes se
             leía `expectedAmount`, que sólo se escribe al cerrar: con la caja
             abierta venía vacío y la alerta no saltaba nunca. */
          const reg = await CashRegistersDB.getById(auth.tenantId, id);
          const expected = reg ? saldoEsperadoDeCaja(reg.openingAmount, reg.movements).esperado : null;
          if (expected != null) {
            esperadoDelArqueo = expected;
            const diff = arqueoAmount - expected;
            if (Math.abs(diff) >= ANOMALY_THRESHOLD_SOL) {
              const isShort = diff < 0;
              createNotification({
                tenantId: auth.tenantId,
                type: "cash_register_anomaly",
                severity: "HIGH",
                title: isShort ? "Faltante en arqueo" : "Sobrante en arqueo",
                body: `Caja ${id.slice(-6)} · ${auth.username}: ${isShort ? "faltan" : "sobran"} S/${Math.abs(diff).toFixed(2)} (esperado S/${expected.toFixed(2)} · contado S/${arqueoAmount.toFixed(2)})`,
                // `#arqueo` no lo lee nadie: abría «Vender». La subvista va en `?vista=`.
                actionUrl: `/admin?tab=ventas-caja&vista=arqueo`,
                actionLabel: "Revisar arqueo",
                entityId: id,
              }).catch((err) => logger.warn("[cash-registers/arqueo] anomaly notify failed", { err: String(err) }));
            }
          }
        } catch (anomalyErr) {
          logger.warn("[cash-registers/arqueo] anomaly detection failed", {
            err: anomalyErr instanceof Error ? anomalyErr.message : String(anomalyErr),
          });
        }

        /* M28: el arqueo tampoco dejaba rastro de quién contó. Va como
           `movimiento_caja` (no `caja`): no gasta el cupo de abrir/cerrar por caja. */
        const difArqueo = esperadoDelArqueo == null ? null : Math.round((arqueoAmount - esperadoDelArqueo) * 100) / 100;
        logActivity(
          "Arquear",
          "movimiento_caja",
          `Arqueo con S/${arqueoAmount.toFixed(2)}${esperadoDelArqueo == null || difArqueo == null ? "" : ` (esperado S/${esperadoDelArqueo.toFixed(2)}, diferencia S/${difArqueo.toFixed(2)})`}${body.notes ? ` — ${body.notes}` : ""}`,
          movement?.id,
          auth.username,
          undefined,
          auth.tenantId,
        ).catch((err) => logger.warn("[cash-registers] activity log failed", { err: String(err) }));

        return NextResponse.json(movement, { status: 201 });
      }

      return NextResponse.json({ error: "action required: close | movement | arqueo" }, { status: 400 });
    } catch (err) {
      const { payload, status } = toErrorPayload(err);
      return NextResponse.json(payload, { status });
    }
  });
}
