import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothDespachoDB } from "@/lib/db/forest-loth-despacho.db";
import { buildLothWorkbook } from "@/lib/forestal/loth-export";
import { leerLibroEntero } from "@/lib/forestal/loth-libro-entero";
import { encabezadoDelPermiso, nombreArchivoLibro } from "@/lib/forestal/loth-filtro-permiso";
import { permisoDelPedido } from "@/lib/forestal/loth-permiso-pedido";
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
 *
 * Por permiso (02-10-2026): `?planId=<id>&solo=1` saca sólo las líneas de ese
 * plan, `?planId=sin-plan` las que no citan plan — el mismo contrato que la
 * lista (`lib/forestal/loth-filtro-permiso`). La Carátula y cada hoja dicen de
 * qué permiso es el archivo, y el nombre lo lleva: `libro-loth-PO-12-….xlsx`.
 *
 * Despacho de trozas (08-10): la línea sólo guarda el código y la GTF; sus
 * medidas (especie, Ø, largo, m³) son las de SU trozado, pegadas con
 * `conTrozado` —la misma elección que la lista y el impreso—.
 */

export const GET = withApiHandler("forestal-loth-export-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro");
  if (!enabled) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  const permiso = await permisoDelPedido(auth.tenantId, new URL(req.url).searchParams);
  if (permiso instanceof NextResponse) return permiso;

  try {
    const [libro, caratula] = await Promise.all([
      leerLibroEntero((offset, limit) =>
        ForestLothDB.list(auth.tenantId, { includeAnnulled: true, limit, offset, permiso: permiso.filtro }),
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
    const encabezado = encabezadoDelPermiso(permiso.filtro, permiso.plan);
    // El libro ENTERO (hasta 40 × 500 líneas): las tandas las hace `trozadosDeCodigos`.
    const entries = await ForestLothDespachoDB.conTrozado(auth.tenantId, libro.entries);
    const buffer = await buildLothWorkbook({
      caratula: caratula as Record<string, unknown> | null,
      entries: entries as unknown as Record<string, unknown>[],
      totalLibro: libro.total,
      generatedAtISO,
      permiso: encabezado,
    });
    const filename = nombreArchivoLibro(encabezado, generatedAtISO, "xlsx");
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
