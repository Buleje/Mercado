import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { emitirBoleta, emitirFactura } from "@/lib/integrations/sunat";
import { isSunatOficial } from "@/lib/sunat/modo-oficial";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { assertCsrf } from "@/lib/auth/csrf";

// ── POST /api/admin/sunat/generate-invoice — Emitir boleta/factura ─────────
//
// F0 (2026-05-26): unificado al facade robusto `lib/integrations/sunat.ts`.
// Antes usaba el cliente legacy `lib/integrations/sunat-nubefact.ts` (token
// global, URL formato viejo → 401/404) y manejaba series/correlativo/persistencia
// a mano (race condition). Ahora delega TODO al facade: idempotencia por orderId,
// correlativo atómico, persistencia, retry-on-fail. Respuesta `{ ok, invoice }`
// alineada con el contrato que espera EInvoiceTab.

const InvoiceSchema = z.object({
  orderId: z.string().min(1),
  tipo: z.enum(["boleta", "factura"]),
  clienteNombre: z.string().min(2).max(200),
  clienteDocumento: z.string().min(8).max(11).optional(),
  // La UI manda "RUC"/"DNI" o "1"/"6" — lo derivamos de `tipo` + longitud, así
  // que lo aceptamos laxo para no rechazar la request.
  clienteTipoDocumento: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "STRICT", "sunat-generate");
  if (rateLimitResponse) return rateLimitResponse;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    // Round 16 M004: SUNAT invoice creation con admin/cajero actor + IP.
    return await runWithAuditContext(req, auth.username, () => generateInvoice(req, auth, traceId));
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

async function generateInvoice(
  req: NextRequest,
  auth: { tenantId: string; username: string; name?: string; role?: string },
  traceId: string,
): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = InvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // F1 gate: solo emite si el tenant tiene "Modo SUNAT Oficial" activado.
    if (!(await isSunatOficial(auth.tenantId))) {
      return NextResponse.json(
        { ok: false, error: "El Modo SUNAT Oficial está desactivado para esta tienda. Actívalo para emitir comprobantes electrónicos." },
        { status: 403 },
      );
    }

    // Orden con items (necesarios para construir el comprobante).
    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, tenantId: auth.tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!order) {
      return NextResponse.json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
    }

    // Items en el formato del facade — precio CON IGV (precio al público).
    const items = order.items.map((item) => ({
      codigo: String(item.productId),
      descripcion: item.name,
      cantidad: item.quantity,
      precioConIgv: Number(item.price),
      unidad: "NIU",
    }));

    const doc = parsed.data.clienteDocumento ?? "";
    const esFactura = parsed.data.tipo === "factura";

    // Delegar al facade robusto (correlativo atómico + idempotencia + retry).
    const result = esFactura
      ? await emitirFactura(auth.tenantId, {
          orderId: order.id,
          clienteRuc: doc,
          clienteRazonSocial: parsed.data.clienteNombre,
          items,
        })
      : await emitirBoleta(auth.tenantId, {
          orderId: order.id,
          clienteNombre: parsed.data.clienteNombre,
          clienteDni: doc.length === 8 ? doc : undefined,
          items,
        });

    logActivity(
      result.success ? "sunat_invoice_emitted" : "sunat_invoice_failed",
      "SunatInvoice",
      JSON.stringify({ orderId: order.id, tipo: parsed.data.tipo, success: result.success, status: result.status }),
      result.invoiceId ?? order.id,
      auth.name ?? "admin",
      undefined,
      auth.tenantId,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    if (!result.success) {
      // status "retrying" → encolado (202); resto → error gateway (502).
      return NextResponse.json(
        { ok: false, error: result.error ?? "Error al emitir comprobante", invoiceId: result.invoiceId, status: result.status },
        { status: result.status === "retrying" ? 202 : 502 },
      );
    }

    // Releer el registro persistido para devolver serie/número/totales a la UI.
    const saved = result.invoiceId
      ? await prisma.sunatInvoice.findFirst({
          where: { id: result.invoiceId, tenantId: auth.tenantId },
          select: { id: true, series: true, number: true, total: true, subtotal: true, igv: true },
        })
      : null;

    return NextResponse.json({
      ok: true,
      pdfUrl: result.pdf_url ?? null,
      xmlUrl: result.xml_url ?? null,
      hash: result.hash ?? null,
      sunatAccepted: result.sunat_accepted,
      invoice: saved
        ? {
            id: saved.id,
            serie: saved.series,
            número: String(saved.number),
            total: Number(saved.total),
            subtotal: Number(saved.subtotal),
            igv: Number(saved.igv),
          }
        : undefined,
      message: saved
        ? `Comprobante ${saved.series}-${saved.number} emitido exitosamente`
        : "Comprobante emitido",
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json({ ok: false, ...payload }, { status });
  }
}
