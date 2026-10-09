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
import { baseDisponibleNotaCredito, desgloseNotaCredito } from "@/lib/pos/reembolso";

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
    // la venta. Base contra base: `Sale.total` trae IGV y las notas guardan la
    // base (antes se comparaba base contra total con IGV: 18 % de más).
    // 1 céntimo de tolerancia por el redondeo de partir el IGV nota por nota.
    if (data.saleId) {
      const sale = await SalesDB.getById(auth.tenantId, data.saleId);
      if (!sale) {
        return NextResponse.json(
          { error: "Venta no encontrada en este tenant" },
          { status: 404 }
        );
      }
      const yaEmitido = await NotasCreditoDB.sumActiveForSale(auth.tenantId, data.saleId);
      const saleTotal = Number(sale.total);
      const disponible = baseDisponibleNotaCredito(saleTotal, yaEmitido, tasa);
      const dispC = Math.round(disponible * 100);
      // El céntimo de tolerancia, sólo si todavía queda algo: con 0 disponible «1 > 0 + 1» era
      // falso y se emitían NC de S/ 0,01 sin fin contra una venta ya acreditada entera.
      if (Math.round(monto * 100) > dispC + (dispC > 0 ? 1 : 0)) {
        // Lo que queda con IGV sale del total de la venta (base→total redondeado perdía 1 céntimo: 0,10 → 0,09).
        const disponibleConIgv = Math.max(0, Math.round(saleTotal * 100) - Math.round(yaEmitido * (1 + tasa) * 100)) / 100;
        return NextResponse.json(
          {
            error: `El monto excede lo que queda de la venta: hasta S/ ${disponible.toFixed(2)} sin IGV (S/ ${disponibleConIgv.toFixed(2)} con IGV).`,
            saleTotal,
            yaEmitido,
            disponible,
            disponibleConIgv,
          },
          { status: 400 }
        );
      }
    }

    const numero = await NotasCreditoDB.siguienteNumero(auth.tenantId);

    const nota = await NotasCreditoDB.create(auth.tenantId, {
      numero,
      orderId: data.orderId,
      saleId: data.saleId,
      motivoCodigo: data.motivoCodigo,
      motivoDesc: data.motivoDesc,
      monto,
      igv,
      total,
      notas: data.notas,
      createdBy: auth.username,
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: nota.id,
      detail: `Nota de crédito ${numero} creada por S/${total.toFixed(2)} — ${data.motivoDesc}`,
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
