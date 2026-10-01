import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { buildLothWorkbook } from "@/lib/forestal/loth-export";
import { leerLibroEntero } from "@/lib/forestal/loth-libro-entero";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/export — descarga del Libro LO-TH en Excel (.xlsx),
 * formato oficial SERFOR (ADR-125). Guard: spec:forestal:loth-libro.
 *
 * El libro va ENTERO: se lee de a páginas de 500 hasta el total. Antes pedía
 * una sola página y un libro de 650 líneas salía con 500, sin aviso. Si alguna
 * vez se llega al tope de seguridad, el archivo lo dice («Se muestran N de M»)
 * y la cabecera `X-Libro-Lineas` lleva «mostradas/total».
 */
export const GET = withApiHandler("forestal-loth-export-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro");
  if (!enabled) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  try {
    const [libro, caratula] = await Promise.all([
      leerLibroEntero((offset, limit) =>
        ForestLothDB.list(auth.tenantId, { includeAnnulled: true, limit, offset }),
      ),
      ForestLothDB.getActiveCaratula(auth.tenantId),
    ]);
    if (libro.truncado) {
      logger.warn("[loth.export] libro más largo que el tope de lectura", {
        tenantId: auth.tenantId,
        mostradas: libro.entries.length,
        total: libro.total,
      });
    }
    const generatedAtISO = new Date().toISOString();
    const buffer = await buildLothWorkbook({
      caratula: caratula as Record<string, unknown> | null,
      entries: libro.entries as unknown as Record<string, unknown>[],
      totalLibro: libro.total,
      generatedAtISO,
    });
    const stamp = generatedAtISO.slice(0, 10);
    const filename = `libro-loth-${stamp}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Libro-Lineas": `${libro.entries.length}/${libro.total}`,
      },
    });
  } catch (err) {
    logger.error("[loth.export] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
