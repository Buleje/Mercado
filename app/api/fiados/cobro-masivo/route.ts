import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { FiadosDB, FiadoConflictError } from "@/lib/db/fiados.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { METODOS_COBRO, notasConMetodo } from "@/lib/fiados/cobro-metodo";
import { FiadoNoCobrableError, type PedidoCobroMasivo } from "@/lib/fiados/reparto-cobro-masivo";

const PaymentItemSchema = z.object({
  fiadoId: z.string().min(1),
  monto: z.number().positive(),
});

// Audit 2026-08-26: un fiadoId repetido en el mismo lote hacía que ambas
// entradas decrementaran contra el mismo saldo prefetcheado (TOCTOU) —
// rechazarlo acá es la señal más clara para el cajero.
const sinRepetidos = (ids: string[]) => new Set(ids).size === ids.length;
const MSJ_REPETIDO = "Un mismo fiado no puede repetirse en el mismo cobro masivo";

const CobroMasivoSchema = z
  .object({
    /** Lo que manda la ventana: los fiados elegidos y el monto; el reparto lo hace el servidor. */
    fiadoIds: z.array(z.string().min(1)).min(1).max(50).refine(sinRepetidos, { message: MSJ_REPETIDO }).optional(),
    monto: z.number().min(0.01).max(1_000_000).optional(),
    /** Contrato viejo: el detalle por fiado (cada monto se topa al saldo). */
    payments: z
      .array(PaymentItemSchema)
      .min(1)
      .max(50)
      .refine((p) => sinRepetidos(p.map((x) => x.fiadoId)), { message: MSJ_REPETIDO })
      .optional(),
    notas: z.string().max(500).optional(),
    metodo: z.enum(METODOS_COBRO).optional(),
    /** true = lo cobrado entra también a la caja abierta (misma transacción). */
    aCaja: z.boolean().optional(),
  })
  .refine((d) => (d.payments ? !d.fiadoIds && d.monto === undefined : !!d.fiadoIds && d.monto !== undefined), {
    message: "Manda los fiados y el monto (fiadoIds + monto) o el detalle (payments), no los dos",
  });

/**
 * POST /api/fiados/cobro-masivo
 * Cobra varios fiados en una sola transacción: el monto se reparte del más
 * viejo al más nuevo en céntimos (FiadosDB.cobroMasivo). Con `aCaja`, lo
 * cobrado entra a la caja abierta con su medio, un ingreso por cliente.
 *
 * 409 = otro cobro movió el saldo (reintentable) · 422 = un fiado ya no se puede cobrar.
 */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-cobro-masivo"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = CobroMasivoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const { payments, fiadoIds, monto, notas, metodo, aCaja } = parsed.data;
    const pedido: PedidoCobroMasivo = payments ?? { fiadoIds: fiadoIds ?? [], monto: monto ?? 0 };
    const caja = aCaja ? { metodo: metodo ?? "efectivo" } : undefined;
    const r = await FiadosDB.cobroMasivo(tenantId, pedido, notasConMetodo(metodo, notas?.trim() || "Cobro masivo"), caja);

    // Score crediticio fire-and-forget — actualiza por cada cliente cobrado.
    // customerId en Fiado es el phone (por relation a Customer.phone).
    const uniqueCustomerIds = Array.from(new Set(r.resultados.map((x) => x.customerId).filter(Boolean)));
    for (const customerId of uniqueCustomerIds) {
      import("@/lib/credit/scoring-engine")
        .then(({ updateCreditProfile }) => updateCreditProfile(tenantId, customerId))
        .catch((err) => logger.warn("[fiados/cobro-masivo] updateCreditProfile failed", { customerId, err: String(err) }));
    }

    const enCaja = r.caja ? (r.caja.sinCaja ? " (sin caja abierta)" : " a la caja") : "";
    logActivity(
      "Cobro masivo", "fiado",
      `Cobro masivo de ${r.resultados.length} fiados por S/${r.cobrado.toFixed(2)}${metodo ? ` en ${metodo}` : ""}${enCaja}`,
      undefined, auth.username, undefined, tenantId,
    ).catch((err) => logger.warn("[fiados/cobro-masivo] activity log failed", { err: String(err) }));

    return NextResponse.json({
      success: true,
      totalCobrado: r.cobrado,
      sobrante: r.sobrante,
      results: r.resultados,
      ...(r.caja && { caja: r.caja }),
    });
  } catch (e) {
    if (e instanceof FiadoConflictError) {
      return NextResponse.json(
        { error: e.message, code: "FIADO_CONFLICT", retryable: true },
        { status: 409 },
      );
    }
    if (e instanceof FiadoNoCobrableError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    }
    logger.error("[fiados/cobro-masivo] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al procesar el cobro masivo" }, { status: 500 });
  }
}
