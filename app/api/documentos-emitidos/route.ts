import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DocumentosEmitidosDB } from "@/lib/db/documentos-emitidos.db";
import { logger } from "@/lib/logger";
import { limaDayRange, startOfLimaMonth, limaDateKey } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const tipo = sp.get("tipo") ?? undefined;
    const search = sp.get("search") ?? undefined;
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;

    // Audit project-wide 2026-05-19: migrado a DocumentosEmitidosDB.listAll.
    const results = await DocumentosEmitidosDB.listAll(auth.tenantId, {
      tipo,
      search,
      // Días de LIMA: `new Date("2026-10-09")` es 19:00 de Lima del 08 y
      // `T23:59:59` del servidor (UTC) cortaba a las 18:59 de Lima.
      from: from ? limaDayRange(from).start : undefined,
      to: to ? new Date(limaDayRange(to).end.getTime() - 1) : undefined,
    });

    // KPIs del mes
    const mesActual = new Date(startOfLimaMonth());

    const boletasMes = results.filter(
      (r) => r.tipo === "boleta" && new Date(r.fecha) >= mesActual
    ).length;
    const facturasMes = results.filter(
      (r) => r.tipo === "factura" && new Date(r.fecha) >= mesActual
    ).length;
    const totalFacturado = results
      .filter(
        (r) =>
          ["boleta", "factura"].includes(r.tipo) &&
          new Date(r.fecha) >= mesActual
      )
      .reduce((s, r) => s + r.total, 0);
    const hoy = limaDateKey();
    const docsHoy = results.filter((r) => limaDateKey(r.fecha) === hoy).length;

    return NextResponse.json({
      documentos: results,
      kpis: { boletasMes, facturasMes, totalFacturado, docsHoy },
    });
  } catch (e) {
    logger.error("[documentos-emitidos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({
      documentos: [],
      kpis: { boletasMes: 0, facturasMes: 0, totalFacturado: 0, docsHoy: 0 },
    });
  }
}
