/**
 * GET /api/admin/forestal/gtf/resumen-interno?id=<gtfId>
 *
 * El «Resumen interno» de una GTF del Libro TH (Brandon 08-10) con R1-R4 ya
 * calculados en el servidor (regla 6): qué salió, si cuadra con lo declarado
 * y con el libro, dónde está cada troza hoy y el saldo del permiso. La hoja
 * (HTML, QR) la arma el navegador con esto.
 *
 * Los roles son los de la lista de guías (`/api/admin/forestal/gtf`). El
 * tenant sale del JWT y va en cada WHERE: una guía de otro negocio es 404.
 * Sin el Libro TH no hay resumen (403); sin el Libro CTP, R3 sale «sin CTP».
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { GtfResumenInternoDB } from "@/lib/db/gtf-resumen-interno.db";
import { resumenInterno } from "@/lib/forestal/gtf-resumen-interno";
import type { RespuestaResumenInterno } from "@/lib/forestal/gtf-resumen-interno-datos";

const QuerySchema = z.object({
  id: z.string().trim().min(1, "Falta la guía").max(40).regex(/^[a-z0-9]+$/i, "id inválido"),
});

export const GET = withApiHandler("forestal-gtf-resumen-interno", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth-gtf-resumen");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const parsed = QuerySchema.safeParse({ id: new URL(req.url).searchParams.get("id") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", message: parsed.error.issues[0]?.message ?? "Consulta inválida" }, { status: 400 });
  }

  try {
    const ctp = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    const datos = await GtfResumenInternoDB.leer(auth.tenantId, parsed.data.id, { ctp });
    if (!datos) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      resumen: resumenInterno(datos.entrada),
      lineaDespachoId: datos.lineaDespachoId,
      planId: datos.planId,
      avisos: datos.avisos,
    } satisfies RespuestaResumenInterno);
  } catch (err) {
    logger.error("[gtf.resumen-interno.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
