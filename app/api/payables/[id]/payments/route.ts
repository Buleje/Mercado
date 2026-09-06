import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PayablesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { exceedsRemaining, remainingBalance } from "@/lib/payables/payment-validation";


const AddPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  notes: z.string().max(500).optional(),
  /**
   * Nº de operación / voucher del pago.
   *
   * Existía en todos lados menos acá: el formulario lo pide («Nº operación…»,
   * `PayablesTab.tsx:287`) y lo manda, la columna `Payment.reference` está en
   * el schema y `DbPayment` lo declara. Sólo faltaba en este Zod, así que se
   * descartaba en silencio y el pago quedaba sin el número con el que se cruza
   * contra el extracto del banco.
   */
  reference: z.string().max(120).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const payable = await PayablesDB.getById(auth.tenantId, id);
    if (!payable) {
      return NextResponse.json({ error: "Payable no encontrado" }, { status: 404 });
    }
    return NextResponse.json(payable.payments);
  } catch (e) {
    logger.error("[payables/id/payments] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "payables-X-payments");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = AddPaymentSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { amount, method, notes, reference } = parsed.data;

    // Verify payable belongs to tenant before adding payment
    const existing = await PayablesDB.getById(auth.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Payable no encontrado" }, { status: 404 });
    }

    // Anti sobre-pago: el monto no puede exceder el saldo pendiente (backend,
    // no solo el `max` del input que se puede saltear).
    if (exceedsRemaining(amount, existing.amount, existing.paidAmount)) {
      const restante = remainingBalance(existing.amount, existing.paidAmount);
      return NextResponse.json(
        { error: `El pago (S/${amount.toFixed(2)}) excede el saldo pendiente (S/${restante.toFixed(2)})` },
        { status: 400 },
      );
    }

    const paymentId = `pmnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const updated = await PayablesDB.addPayment(auth.tenantId, id, {
      id: paymentId,
      amount,
      method: method as import("@/lib/db/misc.db").PaymentMethod,
      date: new Date().toISOString(),
      // El Nº de operación manda; `notes` queda de reserva para los clientes
      // viejos que mandaban la referencia por ese campo.
      ...((reference || notes) && { reference: reference || notes }),
    });

    if (!updated) {
      return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 });
    }
    return NextResponse.json(updated, { status: 201 });
  } catch (e) {
    logger.error("[payables/id/payments] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
