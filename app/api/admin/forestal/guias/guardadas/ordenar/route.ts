import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { CtpGuiaPapelesViejosDB } from "@/lib/db/ctp-guia-papeles-viejos.db";
import { guardGuias } from "../guard";

/**
 * Papeles de guías que quedaron en las carpetas por año/mes (antes de ADR-442).
 *
 *   GET  → cuántos hay y adónde irían (no mueve nada)
 *   POST → los muda a «titular › permiso › GTF» y quita las carpetas de mes
 *          que quedaron vacías. Sólo admin y dueño: reordena el Drive.
 */

export const GET = withApiHandler("forestal-papeles-viejos-get", async (req: NextRequest) => {
  const g = await guardGuias(req, false);
  if ("res" in g) return g.res;
  const papeles = await CtpGuiaPapelesViejosDB.pendientes(g.auth.tenantId);
  return NextResponse.json({
    pendientes: papeles.length,
    papeles: papeles.slice(0, 20).map((p) => ({ name: p.name, gtf: p.gtf, destino: p.destino })),
  });
});

export const POST = withApiHandler("forestal-papeles-viejos-post", async (req: NextRequest) => {
  const g = await guardGuias(req, true);
  if ("res" in g) return g.res;
  const rol = soloAdminODueno(g.auth.role, "reordenar las carpetas de Documentos");
  if (rol) return rol;
  const r = await CtpGuiaPapelesViejosDB.ordenar(g.auth.tenantId, g.auth.username ?? "unknown");
  return NextResponse.json({ ok: true, ...r });
});
