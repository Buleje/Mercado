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
  const _rl = await applyRateLimit(req, "MODERATE", "cash-registers-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

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
        if (!reg) return NextResponse.json({ error: "Register not found" }, { status: 404 });
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
        const movement = await CashRegistersDB.addMovement(
          id,
          { type: body.type, amount: body.amount, method: body.method, description: body.description, saleId: body.saleId },
          auth.tenantId,
        );
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
        try {
          /* El esperado de la caja ABIERTA, con LA cuenta del cierre. Antes se
             leía `expectedAmount`, que sólo se escribe al cerrar: con la caja
             abierta venía vacío y la alerta no saltaba nunca. */
          const reg = await CashRegistersDB.getById(auth.tenantId, id);
          const expected = reg ? saldoEsperadoDeCaja(reg.openingAmount, reg.movements).esperado : null;
          if (expected != null) {
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

        return NextResponse.json(movement, { status: 201 });
      }

      return NextResponse.json({ error: "action required: close | movement | arqueo" }, { status: 400 });
    } catch (err) {
      const { payload, status } = toErrorPayload(err);
      return NextResponse.json(payload, { status });
    }
  });
}
