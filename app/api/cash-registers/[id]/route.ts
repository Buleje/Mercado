import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { CashRegisterOwnershipDB } from "@/lib/db/cash-registers-by-id.db";
import { requireAdmin } from "@/lib/require-admin";
import { sendCashSummaryEmail } from "@/lib/mailer";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/create-notification";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";

// Umbral de anomalia en arqueo: diferencias mayores generan alerta admin.
const ANOMALY_THRESHOLD_SOL = 50;

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
      const body = await req.json() as { action: string; closingAmount?: number; notes?: string; type?: string; amount?: number; method?: string; description?: string; saleId?: string };

      if (body.action === "close") {
        const closingAmount = Number(body.closingAmount) || 0;
        const reg = await CashRegistersDB.close(auth.tenantId, id, closingAmount, body.notes);
        if (!reg) return NextResponse.json({ error: "Register not found" }, { status: 404 });

        // Send summary email (fire and forget — do not block response)
        const mvs = reg.movements;
        const salesEfectivo = mvs.filter(m => m.type === "venta" && m.method === "efectivo").reduce((s, m) => s + m.amount, 0);
        const salesDigital = mvs.filter(m => m.type === "venta" && m.method !== "efectivo").reduce((s, m) => s + m.amount, 0);
        const salesCount = mvs.filter(m => m.type === "venta").length;
        const totalIn = mvs.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
        const totalOut = mvs.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
        void sendCashSummaryEmail({
          registerId: reg.id,
          openedAt: reg.openedAt,
          closedAt: reg.closedAt ?? new Date().toISOString(),
          openingAmount: reg.openingAmount,
          closingAmount: reg.closingAmount ?? closingAmount,
          expectedAmount: reg.expectedAmount ?? 0,
          difference: reg.difference ?? 0,
          salesEfectivo,
          salesDigital,
          salesCount,
          totalIn,
          totalOut,
          notes: body.notes,
        });

        return NextResponse.json(reg);
      }

      if (body.action === "movement") {
        // SECURITY 2026-05-06 (pentest H003): verificar tenant ownership.
        if (!(await CashRegisterOwnershipDB.assertOwnership(id, auth.tenantId))) {
          return NextResponse.json({ error: "Register not found" }, { status: 404 });
        }
        const movement = await CashRegistersDB.addMovement(id, {
          type: body.type ?? "ingreso",
          amount: Number(body.amount) || 0,
          method: body.method ?? "efectivo",
          description: body.description ?? "",
          saleId: body.saleId,
        });
        return NextResponse.json(movement, { status: 201 });
      }

      if (body.action === "arqueo") {
        if (!(await CashRegisterOwnershipDB.assertOwnership(id, auth.tenantId))) {
          return NextResponse.json({ error: "Register not found" }, { status: 404 });
        }
        const arqueoAmount = Number(body.closingAmount) || 0;
        const movement = await CashRegistersDB.addMovement(id, {
          type: "arqueo",
          amount: arqueoAmount,
          method: "efectivo",
          description: body.notes ? `Arqueo express: ${body.notes}` : "Arqueo express",
        });

        // Anomaly detection: si el arqueo tiene diferencia con el esperado
        // mayor al umbral, alertar al admin via notification + push.
        try {
          const reg = await CashRegistersDB.getById(auth.tenantId, id);
          const expected = reg?.expectedAmount ?? null;
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
                actionUrl: `/admin?tab=ventas-caja#arqueo`,
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
