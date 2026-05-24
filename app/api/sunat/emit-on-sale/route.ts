/**
 * POST /api/sunat/emit-on-sale
 *
 * Endpoint interno que recibe un saleId y dispara el worker de facturación.
 * Actúa como puente externo para el patrón observer mientras sales.db.ts
 * esté en el dirty tree (ADR-045 — hack temporal).
 *
 * Cuando el tree esté limpio: migrar a emitDomainEvent("VentaCompletada")
 * directamente en lib/db/sales.db.ts.
 *
 * Seguridad: protegido con requireAdmin O con header interno x-internal-secret.
 * El pattern fire-and-forget garantiza que la venta no se bloquea (regla #7).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { sunatEventBus } from "@/lib/sunat/sale-events";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withApiHandler } from "@/lib/api-handler";

const BodySchema = z.object({
  saleId: z.string().min(1),
  comprobanteTipo: z.enum(["boleta", "factura", "ticket"]).default("boleta"),
  comprobanteRuc: z.string().regex(/^\d{11}$/).optional(),
  customerName: z.string().optional(),
});

export const POST = withApiHandler("sunat-emit-on-sale", async (req: NextRequest) => {
  const _rl = await applyRateLimit(req, "MODERATE", "sunat-emit-on-sale"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;
  const blocked = await requireActiveSubscription(tenantId);
  if (blocked) return blocked;

  const rawBody = await req.json().catch((err) => { logger.warn("[security] op failed", { err: String(err) }); return null; });
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { saleId, comprobanteTipo, comprobanteRuc, customerName } = parsed.data;

  if (comprobanteTipo === "factura" && !comprobanteRuc) {
    return NextResponse.json(
      { error: "La factura requiere comprobanteRuc (11 dígitos)." },
      { status: 400 }
    );
  }

  // Emitir evento fire-and-forget — la respuesta no espera al worker (regla #7)
  setImmediate(() => {
    sunatEventBus.emitSaleCreated({
      saleId,
      tenantId,
      comprobanteTipo,
      comprobanteRuc,
      customerName,
    });
  });

  logger.info("[SUNAT emit-on-sale] Evento emitido", {
    saleId,
    tenantId,
    comprobanteTipo,
  });

  return NextResponse.json(
    { message: "Evento de venta recibido. Factura encolada en background." },
    { status: 202 }
  );
});
