import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotasCreditoDB } from "@/lib/db";
import { SalesDB } from "@/lib/db/sales.db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { SettingsDB } from "@/lib/db/settings.db";
import { igvRateFromSettings } from "@/lib/tax";
import { sinDato } from "@/lib/errores/sin-dato";
import { desgloseNotaCredito } from "@/lib/pos/reembolso";
import { topeNotaCredito } from "@/lib/notas-credito/tope";
import { OrdersDB } from "@/lib/db/orders.db";

const CreateNotaCreditoSchema = z.object({
  orderId: z.string().optional(),
  saleId: z.string().optional(),
  motivoCodigo: z.string().min(1).max(10),
  motivoDesc: z.string().min(1).max(500),
  /** Base SIN IGV (lo que escribe el contador en Notas de crédito). */
  monto: z.number().positive().optional(),
  /**
   * Lo devuelto CON IGV (el POS cobra con IGV incluido). Si viene, manda: la
   * base y el IGV salen de él y el total de la nota es exactamente lo devuelto.
   */
  totalConIgv: z.number().positive().optional(),
  notas: z.string().max(2000).optional(),
}).refine((d) => d.monto != null || d.totalConIgv != null, {
  message: "Falta el monto",
  path: ["monto"],
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await NotasCreditoDB.getAll(auth.tenantId, {
      status: sp.get("status") ?? undefined,
      orderId: sp.get("orderId") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[notas-credito] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "notas-credito"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = CreateNotaCreditoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    // IGV del negocio (Settings.taxRate en %, 18 por defecto; 0 = exonerado).
    const ajustes = await SettingsDB.get(auth.tenantId).catch(sinDato("notas-credito ajustes del negocio para el IGV"));
    const tasa = igvRateFromSettings(ajustes?.taxRate);
    // Base + IGV = total, al céntimo (antes `igv = monto × 0,18` sin redondear).
    const { monto, igv, total } = data.totalConIgv != null
      ? desgloseNotaCredito({ totalConIgv: data.totalConIgv }, tasa)
      : desgloseNotaCredito({ base: data.monto ?? 0 }, tasa);
    if (monto <= 0) {
      return NextResponse.json({ error: "El monto debe ser de al menos S/ 0,01." }, { status: 400 });
    }

    // SECURITY/CRITICAL 2026-05-06 (pentest H2): la nota no pasa lo que queda de
    // su documento. Tope EXACTO (09-10): total con IGV de la nota contra lo que el
    // documento cobró menos el `total` de sus notas activas, en céntimos y sin
    // tolerancia. Antes se sumaba la base con 1 céntimo de tolerancia, y las notas
    // por `orderId` (pedidos de la tienda) no tenían tope.
    let desglose = { monto, igv, total };
    const documentos: Array<{ tipo: "venta" | "pedido"; totalDocumento: number; totalYaEmitido: number }> = [];
    if (data.saleId) {
      const sale = await SalesDB.getById(auth.tenantId, data.saleId);
      if (!sale) {
        return NextResponse.json(
          { error: "Venta no encontrada en este tenant" },
          { status: 404 }
        );
      }
      const totalYaEmitido = await NotasCreditoDB.sumActiveTotalForSale(auth.tenantId, data.saleId);
      documentos.push({ tipo: "venta", totalDocumento: Number(sale.total), totalYaEmitido });
    }
    if (data.orderId) {
      const pedido = await OrdersDB.getById(auth.tenantId, data.orderId);
      if (!pedido) {
        return NextResponse.json(
          { error: "Pedido no encontrado en este tenant" },
          { status: 404 }
        );
      }
      const totalYaEmitido = await NotasCreditoDB.sumActiveTotalForOrder(auth.tenantId, data.orderId);
      documentos.push({ tipo: "pedido", totalDocumento: Number(pedido.total), totalYaEmitido });
    }
    for (const doc of documentos) {
      const tope = topeNotaCredito({
        totalDocumento: doc.totalDocumento,
        totalYaEmitido: doc.totalYaEmitido,
        pedido: desglose,
        tasa,
        porBase: data.totalConIgv == null,
      });
      if (!tope.ok) {
        return NextResponse.json(
          {
            error: `El monto excede lo que queda ${doc.tipo === "venta" ? "de la venta" : "del pedido"}: hasta S/ ${tope.disponible.toFixed(2)} sin IGV (S/ ${tope.disponibleConIgv.toFixed(2)} con IGV).`,
            saleTotal: doc.tipo === "venta" ? doc.totalDocumento : undefined,
            orderTotal: doc.tipo === "pedido" ? doc.totalDocumento : undefined,
            yaEmitidoConIgv: doc.totalYaEmitido,
            disponible: tope.disponible,
            disponibleConIgv: tope.disponibleConIgv,
          },
          { status: 400 }
        );
      }
      desglose = tope.desglose;
    }

    const numero = await NotasCreditoDB.siguienteNumero(auth.tenantId);

    const nota = await NotasCreditoDB.create(auth.tenantId, {
      numero,
      orderId: data.orderId,
      saleId: data.saleId,
      motivoCodigo: data.motivoCodigo,
      motivoDesc: data.motivoDesc,
      monto: desglose.monto,
      igv: desglose.igv,
      total: desglose.total,
      notas: data.notas,
      createdBy: auth.username,
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: nota.id,
      detail: `Nota de crédito ${numero} creada por S/${desglose.total.toFixed(2)} — ${data.motivoDesc}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    // Fase 4 perf (2026-05-16): doc-badges sidebar refresca al instante.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterDocument(auth.tenantId);
    } catch { /* fire-and-forget */ }

    return NextResponse.json(nota, { status: 201 });
  } catch (e) {
    logger.error("[notas-credito] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
