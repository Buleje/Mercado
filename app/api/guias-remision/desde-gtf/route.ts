import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GuiasRemisionDB } from "@/lib/db";
import { SunatDB } from "@/lib/db/sunat.db";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { guiaDesdeGtf, gtfDatosDeFilaLoth, itemDeLinea, type ItemDespacho } from "@/lib/guias/desde-gtf";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  origen: z.enum(["ctp_salida", "loth_gtf"]),
  id: z.string().min(1).max(60),
});

/**
 * GET /api/guias-remision/desde-gtf
 *  · `?origen=ctp_salida|loth_gtf&id=<id>` → el borrador de guía armado con esa GTF.
 *  · sin parámetros → las GTF recientes para elegir (`{ opciones }`).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    if (!sp.has("origen") && !sp.has("id")) {
      return NextResponse.json({ opciones: await GuiasRemisionDB.listarGtfRecientes(auth.tenantId) });
    }
    const q = QuerySchema.safeParse({ origen: sp.get("origen"), id: sp.get("id") });
    if (!q.success) return NextResponse.json({ error: q.error.flatten().fieldErrors }, { status: 400 });

    const fila = await GuiasRemisionDB.getOrigenGtf(auth.tenantId, q.data.origen, q.data.id);
    if (!fila) return NextResponse.json({ error: "No encontramos esa guía en este negocio" }, { status: 404 });

    const [cfg, guiaExistente] = await Promise.all([
      SunatDB.getConfig(auth.tenantId),
      GuiasRemisionDB.getVigentePorOrigen(auth.tenantId, q.data.origen, q.data.id),
    ]);
    const gtf = fila.columnas ? gtfDatosDeFilaLoth({ ...fila.columnas, gtfDatos: fila.gtfDatos }) : leerGtfDatos(fila.gtfDatos);
    const items = fila.lineas.map(itemDeLinea).filter((i): i is ItemDespacho => i !== null);
    return NextResponse.json(
      guiaDesdeGtf(gtf, {
        origenTipo: q.data.origen,
        origenId: q.data.id,
        ubigeoFiscal: cfg?.ubigeo ?? null,
        direccionFiscal: cfg?.direccionFiscal ?? null,
        items,
        guiaExistente,
      }),
    );
  } catch (e) {
    logger.error("[guias-remision] desde-gtf error", { error: String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
