import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { QueryExportar } from "@/lib/contabilidad/esquemas";
import { contabilidadAXlsx, nombreArchivoContable, type DatosExportar } from "@/lib/contabilidad/exportar";
import { auditar, leerQuery, sesion } from "../_comun";

/** GET /api/admin/contabilidad/exportar?mes=YYYY-MM&libro=diario|mayor|comprobacion|estados → .xlsx (ADR-529). */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  const q = leerQuery(req, QueryExportar);
  if (q instanceof NextResponse) return q;
  try {
    const { tenantId, hoy, opciones } = s;
    const [datos, cabecera]: [DatosExportar, Awaited<ReturnType<typeof ContabilidadDB.cabecera>>] = await Promise.all([
      (async (): Promise<DatosExportar> => {
        if (q.libro === "diario") return { libro: "diario", datos: await ContabilidadDB.diario(tenantId, q.mes, hoy, opciones) };
        if (q.libro === "mayor") return { libro: "mayor", datos: await ContabilidadDB.mayor(tenantId, q.mes, undefined, hoy, opciones, true) };
        if (q.libro === "comprobacion") return { libro: "comprobacion", datos: await ContabilidadDB.comprobacion(tenantId, q.mes, hoy, opciones) };
        return { libro: "estados", datos: await ContabilidadDB.estados(tenantId, q.mes, hoy, opciones) };
      })(),
      ContabilidadDB.cabecera(tenantId),
    ]);
    const buf = await contabilidadAXlsx(datos, q.mes, cabecera);
    auditar(req, s, "EXPORT", `${q.libro} ${q.mes} en xlsx`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivoContable(q.libro, q.mes)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logger.error("[contabilidad/exportar] GET error", { err: e instanceof Error ? e.message : String(e), tenantId: s.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
