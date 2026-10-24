import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { CommissionRulesDB } from "@/lib/db/commission-rules.db";
import { ExpensesDB } from "@/lib/db/finance.db";
import { CommissionPagosDB } from "@/lib/db/commission-pagos.db";
import { enqueueActivityLog } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { CATEGORIA_GASTO_COMISIONES, calcularComisiones, marcaDePago, rangoLima } from "@/lib/comisiones/calcular";

const BodySchema = z
  .object({
    cashierId: z.string().min(1).max(100),
    from: z.string().date(),
    to: z.string().date(),
    paymentMethod: z.enum(["efectivo", "yape", "plin", "transferencia"]).default("efectivo"),
    /** El pendiente que la persona vio al pulsar «Pagar»: si ya no es ese, no se paga a ciegas. */
    montoVisto: z.number().nonnegative().max(10_000_000),
  })
  .refine((b) => b.from <= b.to, { message: "La fecha inicial va antes que la final." });

/**
 * POST /api/commissions/pagar — registra el pago de la comisión de un
 * vendedor como gasto «Comisiones».
 *
 * El monto NO viaja desde el navegador: se recalcula acá con la misma cuenta
 * de `/api/commissions/calculo` y se paga sólo lo pendiente del período:
 *  - pulsar dos veces no paga dos veces (la segunda ve pendiente 0 → 409);
 *  - un período que se pisa con otro ya pagado sin caber dentro → 409 con
 *    los días que quedan libres (antes se podía pagar dos veces el mismo tramo);
 *  - si el pendiente ya no es el que se vio (`montoVisto`) → 409 con el nuevo;
 *  - dos pestañas a la vez van en fila: lectura y gasto bajo el candado del
 *    vendedor (`CommissionPagosDB.conCandado`).
 */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "commissions-pagar"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const raw: unknown = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { cashierId, from, to, paymentMethod, montoVisto } = parsed.data;
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  try {
    // Lo vendido y las reglas no cambian al pagar: se leen antes del candado.
    const [ventas, reglas] = await Promise.all([
      CommissionsDB.cashierSummary(auth.tenantId, rangoLima(from, to)),
      CommissionRulesDB.list(auth.tenantId),
    ]);
    const reglasNum = reglas.map((r) => ({ id: r.id, cashierId: r.cashierId, label: r.label, minSales: Number(r.minSales), maxSales: r.maxSales == null ? null : Number(r.maxSales), rate: Number(r.rate) }));

    const r = await CommissionPagosDB.conCandado(auth.tenantId, cashierId, async (pagos) => {
      const fila = calcularComisiones(from, to, ventas, reglasNum, pagos).filas.find((f) => f.cashierId === cashierId);
      if (!fila) return { status: 404, body: { error: "Ese vendedor no tiene ventas en el período." } };
      if (fila.cruce) {
        const { desde, hasta } = fila.cruce;
        const libre = fila.libre ? ` Paga del ${ddmm(fila.libre.desde)} al ${ddmm(fila.libre.hasta)}.` : "";
        return {
          status: 409,
          body: {
            error: fila.cubierto
              ? `Ese período ya está en el pago del ${ddmm(desde)} al ${ddmm(hasta)}.`
              : `Ese período se pisa con el pago del ${ddmm(desde)} al ${ddmm(hasta)}.${libre}`,
            cruce: fila.cruce,
            libre: fila.libre,
          },
        };
      }
      if (fila.pendiente <= 0) return { status: 409, body: { error: "La comisión de ese período ya está pagada.", pagado: fila.pagado } };
      if (Math.abs(fila.pendiente - montoVisto) >= 0.01) {
        return { status: 409, body: { error: `El pendiente cambió: ahora es S/ ${fila.pendiente.toFixed(2)}. Revisa y vuelve a pagar.`, pendiente: fila.pendiente } };
      }

      const ahora = new Date().toISOString();
      const gasto = await ExpensesDB.add(auth.tenantId, {
        category: CATEGORIA_GASTO_COMISIONES,
        description: `Comisión de ${fila.cashierName} · ${from} a ${to} · ${fila.tasa} % de S/ ${fila.vendido.toFixed(2)}`,
        amount: fila.pendiente,
        date: ahora,
        recurring: false,
        frequency: null,
        paymentDay: null,
        paymentMethod,
        supplierName: fila.cashierName,
        supplierId: null,
        documentType: "recibo",
        documentNumber: null,
        supplierRuc: null,
        igvAmount: null,
        afectoIgv: false,
        attachmentUrl: null,
        costCenter: "Ventas",
        createdBy: auth.username ?? null,
        notes: marcaDePago(cashierId, from, to),
        templateId: null,
        paidAt: ahora,
        contratoId: null,
      });

      enqueueActivityLog({
        action: "commission_paid",
        resource: "commission",
        resourceId: gasto.id,
        userId: auth.username,
        tenantId: auth.tenantId,
        details: { description: `Pago de comisión a ${fila.cashierName}: S/ ${fila.pendiente.toFixed(2)} (${from} a ${to})` },
        timestamp: ahora,
      }).catch((err) => logger.warn("[commissions/pagar] activity log failed", { err: String(err) }));

      return { status: 201, body: { ok: true, expenseId: gasto.id, monto: fila.pendiente } };
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    logger.error("[commissions/pagar] POST error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 503 });
  }
}
