import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { sendCashSummaryEmail } from "@/lib/mailer";
import { toErrorPayload } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * SECURITY 2026-05-06 (pentest H003): asegura ownership de la caja antes de
 * cualquier mutación. Sin esto, un cajero del tenant A podía inyectar
 * movimientos/arqueos en cajas del tenant B (CashMovement.create no filtraba
 * por tenant). Devuelve true si la caja existe y pertenece al tenant.
 */
async function assertRegisterOwnership(
  registerId: string,
  tenantId: string,
): Promise<boolean> {
  const reg = await prisma.cashRegister.findFirst({
    where: { id: registerId, tenantId },
    select: { id: true },
  });
  return !!reg;
}

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
      if (!(await assertRegisterOwnership(id, auth.tenantId))) {
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
      if (!(await assertRegisterOwnership(id, auth.tenantId))) {
        return NextResponse.json({ error: "Register not found" }, { status: 404 });
      }
      const arqueoAmount = Number(body.closingAmount) || 0;
      const movement = await CashRegistersDB.addMovement(id, {
        type: "arqueo",
        amount: arqueoAmount,
        method: "efectivo",
        description: body.notes ? `Arqueo express: ${body.notes}` : "Arqueo express",
      });
      return NextResponse.json(movement, { status: 201 });
    }

    return NextResponse.json({ error: "action required: close | movement | arqueo" }, { status: 400 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
