import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { membreteParaPdf } from "@/lib/documentos/membrete-servidor";
import { datosDelMembrete, emitidoEnLima } from "@/lib/documentos/membrete-pdf";
import { sinDato } from "@/lib/errores/sin-dato";

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
    // Membrete del negocio (ADR-514): nombre, datos y logo arriba; la tabla empieza en la fila 5.
    const mp = await membreteParaPdf(auth.tenantId).catch(sinDato("comprobantes membrete del negocio"));
    const mbr = datosDelMembrete(mp?.membrete, { tipo: "Comprobantes" });
    wb.creator = mbr.titulo === "Documento" ? "Documentación" : mbr.titulo;
    const ws = wb.addWorksheet("Comprobantes");
    ws.columns = [
      { key: "fecha", width: 14 },
      { key: "tipo", width: 12 },
      { key: "numero", width: 18 },
      { key: "ruc", width: 15 },
      { key: "razon", width: 34 },
      { key: "moneda", width: 9 },
      { key: "igv", width: 12 },
      { key: "total", width: 14 },
      { key: "nombre", width: 30 },
    ];
    const conLogo = !!(mp?.logo && mp.logo.bytes.length > 0);
    const col = conLogo ? 2 : 1;
    ws.getCell(1, col).value = mbr.titulo;
    ws.getCell(1, col).font = { bold: true, size: 14 };
    ws.getCell(2, col).value = [...mbr.datos.slice(0, 2), `Emitido el ${emitidoEnLima(new Date())}`].join("  ·  ");
    ws.getCell(2, col).font = { size: 9, color: { argb: "FF4B5563" } };
    ws.getCell(3, col).value = "Comprobantes del archivo, para el contador";
    ws.getCell(3, col).font = { bold: true, size: 10, color: { argb: "FF007F7A" } };
    if (conLogo && mp?.logo) {
      try {
        const id = wb.addImage({ buffer: Buffer.from(mp.logo.bytes) as unknown as ExcelJS.Buffer, extension: "png" });
        const ancho = Math.min(Math.round((54 * mp.logo.ancho) / mp.logo.alto), 85);
        ws.addImage(id, { tl: { col: 0.05, row: 0.1 }, ext: { width: ancho, height: Math.round((ancho * mp.logo.alto) / mp.logo.ancho) } });
      } catch (err) {
        logger.warn("[documents.export.comprobantes] logo ilegible", { err: String(err) });
      }
    }
    for (const f of [1, 2, 3]) ws.getRow(f).height = conLogo ? 20 : 16;
    const encabezados = ["Fecha", "Tipo", "Número", "RUC", "Razón social", "Moneda", "IGV", "Total", "Documento"];
    const filaEnc = ws.getRow(5);
    encabezados.forEach((h, i) => (filaEnc.getCell(i + 1).value = h));
    filaEnc.font = { bold: true };
    filaEnc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    ws.views = [{ state: "frozen", ySplit: 5 }];

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
