import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { FiadosDB, FiadoConflictError } from "@/lib/db/fiados.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { METODOS_COBRO, etiquetaCobroFiado, notasConMetodo } from "@/lib/fiados/cobro-metodo";

const CobrarSchema = z.object({
  customerPhone: z.string().min(1),
  monto: z.number().positive(),
  notas: z.string().max(500).optional(),
  metodo: z.enum(METODOS_COBRO).optional(),
  /** true = lo cobrado entra también a la caja abierta (misma transacción). */
  aCaja: z.boolean().optional(),
  /** Respaldo de la etiqueta del ingreso si la base no tiene el nombre. */
  nombre: z.string().max(80).optional(),
});

/**
 * Quién paga, para la etiqueta del ingreso en la caja: el nombre que guarda la
 * base para ese teléfono. El que manda el navegador queda sólo de respaldo
 * (saneado) y, sin ninguno, el teléfono — antes se tomaba tal cual del cuerpo.
 */
async function nombreDelCliente(tenantId: string, telefono: string, delNavegador?: string): Promise<string> {
  let deLaBase: string | undefined;
  try {
    deLaBase = (await CustomersDB.getByPhone(telefono, tenantId))?.name?.trim();
  } catch (err) {
    logger.warn("[fiados/cobrar] nombre del cliente no leido", { err: String(err) });
  }
  if (deLaBase) return deLaBase.slice(0, 80);
  // Sin caracteres de control (saltos, tabulaciones…) y en una sola línea.
  const respaldo = Array.from(delNavegador ?? "", (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("").replace(/\s+/g, " ").trim().slice(0, 80);
  return respaldo || telefono;
}

/**
 * POST /api/fiados/cobrar
 * Convenience route: cobrar fiado by customer phone.
 * Distributes the payment across active fiados oldest-first.
 */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-cobrar"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const raw = await req.json();
    const parsed = CobrarSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { customerPhone, monto, notas, metodo, aCaja, nombre } = parsed.data;
    const caja = aCaja
      ? { metodo: metodo ?? "efectivo", etiqueta: etiquetaCobroFiado(await nombreDelCliente(tenantId, customerPhone, nombre)) }
      : undefined;

    const result = await FiadosDB.cobrarPorCliente(tenantId, customerPhone, monto, notasConMetodo(metodo, notas), caja);

    if (result.payments.length === 0) {
      return NextResponse.json(
        { error: "No hay fiados activos para este cliente" },
        { status: 404 }
      );
    }

    // Score crediticio fire-and-forget — refleja en tiempo real la mejora
    // por pago. Antes solo se actualizaba via cron semanal (gap del audit).
    import("@/lib/credit/scoring-engine")
      .then(({ updateCreditProfile }) => updateCreditProfile(tenantId, customerPhone))
      .catch((err) => logger.warn("[fiados/cobrar] updateCreditProfile failed", { customerPhone, err: String(err) }));

    return NextResponse.json({
      success: true,
      totalCobrado: result.totalCobrado,
      payments: result.payments,
      remaining: result.remaining,
      ...(result.caja && { caja: result.caja }),
    });
  } catch (e) {
    // Audit 2026-05-17 P1-3: race-condition de Prisma → 409 Conflict.
    if (e instanceof FiadoConflictError) {
      return NextResponse.json(
        { error: e.message, code: "FIADO_CONFLICT", retryable: true },
        { status: 409 }
      );
    }
    logger.error("[Fiados Cobrar] unexpected error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
