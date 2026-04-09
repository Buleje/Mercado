import { NextRequest, NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// GET /api/prestamos/exportar — export as CSV
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const filters = {
      status: searchParams.get("status") ?? undefined,
      tipo: (searchParams.get("tipo") as "PERSONAL" | "BANCARIO" | "TERCERO" | "PROVEEDOR") ?? undefined,
      direccion: (searchParams.get("direccion") as "DADO" | "RECIBIDO") ?? undefined,
    };

    const prestamos = await PrestamosDB.list(auth.tenantId, filters);

    const headers = [
      "ID", "Tipo", "Dirección", "Cliente/Entidad", "Monto", "Moneda",
      "Tasa%", "Cuotas", "Sistema", "Estado", "Saldo Pendiente",
      "Mora Acumulada", "Fecha Desembolso", "Fecha Creación",
    ];

    const rows = prestamos.map((p) => {
      const saldo = p.cuotas.filter((c) => !c.pagadoEn).reduce((s, c) => s + c.monto, 0);
      const mora = p.cuotas.reduce((s, c) => s + c.moraCalculada, 0);
      return [
        p.id.slice(-8),
        p.tipo,
        p.direccion,
        p.customerId || p.entidadNombre || "-",
        p.monto.toFixed(2),
        p.moneda,
        p.tasaInteres.toFixed(2),
        p.numeroCuotas,
        p.sistemaAmortizacion,
        p.status,
        saldo.toFixed(2),
        mora.toFixed(2),
        p.fechaDesembolso ? new Date(p.fechaDesembolso).toLocaleDateString("es-PE") : "-",
        new Date(p.createdAt).toLocaleDateString("es-PE"),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const bom = "\uFEFF";

    return new NextResponse(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prestamos-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    logger.error("[prestamos/exportar] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
