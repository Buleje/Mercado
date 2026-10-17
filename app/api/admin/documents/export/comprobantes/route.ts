import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";

/**
 * GET /api/admin/documents/export/comprobantes — exporta a Excel los datos
 * estructurados que la IA extrajo de los comprobantes (facturas/boletas/recibos)
 * del drive, para pasárselos al contador. Una fila por comprobante detectado.
 */
type Structured = {
  docType?: string | null;
  ruc?: string | null;
  razonSocial?: string | null;
  numero?: string | null;
  fecha?: string | null;
  moneda?: string | null;
  total?: number | string | null;
  igv?: number | string | null;
};

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:export-comprobantes");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const docs = await DocumentsDB.list(auth.tenantId, {}, auth.role);
    const rows = docs
      .map((d) => {
        const s = d.ocrMetadata?.structured as Structured | undefined;
        if (!s || !/factura|boleta|recibo|guia|nota/i.test(s.docType ?? "")) return null;
        return { doc: d, s };
      })
      .filter((x): x is { doc: (typeof docs)[number]; s: Structured } => !!x);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Buleje — Documentación";
    const ws = wb.addWorksheet("Comprobantes");
    ws.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Tipo", key: "tipo", width: 12 },
      { header: "Número", key: "numero", width: 18 },
      { header: "RUC", key: "ruc", width: 15 },
      { header: "Razón social", key: "razon", width: 34 },
      { header: "Moneda", key: "moneda", width: 9 },
      { header: "IGV", key: "igv", width: 12 },
      { header: "Total", key: "total", width: 14 },
      { header: "Documento", key: "nombre", width: 30 },
    ];
    ws.getRow(1).font = { bold: true };

    let sumTotal = 0;
    let sumIgv = 0;
    for (const { doc, s } of rows) {
      const total = toNum(s.total);
      const igv = toNum(s.igv);
      if (total !== null) sumTotal += total;
      if (igv !== null) sumIgv += igv;
      ws.addRow({
        fecha: s.fecha ?? "",
        tipo: s.docType ?? "",
        numero: s.numero ?? "",
        ruc: s.ruc ?? "",
        razon: s.razonSocial ?? "",
        moneda: s.moneda ?? "PEN",
        igv: igv ?? "",
        total: total ?? "",
        nombre: doc.name,
      });
    }
    // Fila de totales
    if (rows.length > 0) {
      const totalRow = ws.addRow({ razon: "TOTAL", igv: sumIgv, total: sumTotal });
      totalRow.font = { bold: true };
    }
    ws.getColumn("igv").numFmt = "#,##0.00";
    ws.getColumn("total").numFmt = "#,##0.00";

    const buf = await wb.xlsx.writeBuffer();
    const date = req.nextUrl.searchParams.get("date") || "";
    return new NextResponse(buf as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="comprobantes${date ? "-" + date : ""}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logger.error("[documents.export.comprobantes] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
