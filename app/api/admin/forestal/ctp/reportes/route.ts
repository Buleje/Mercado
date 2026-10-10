import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpReportesDB } from "@/lib/db/forest-ctp-reportes.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { SEMANAS_MAX, type PeriodoReporte } from "@/lib/forestal/reportes-produccion";
import { limaDateKey } from "@/lib/utils";

/**
 * /api/admin/forestal/ctp/reportes — el apartado «Reportes» del Libro CTP.
 *
 *   GET ?periodo=semanas&semanas=8            → las últimas N semanas (con la en curso)
 *   GET ?periodo=mes&mes=2026-09              → un mes calendario
 *   GET ?periodo=rango&desde=…&hasta=…        → un rango de fechas (≤ 2 años)
 *       &agrupacion=dia|semana|mes            → el eje de los gráficos
 *       &especie=…&dueno=…&permiso=…          → repetibles: varios valores = cualquiera
 *
 * Devuelve la producción ya sumada —totales, previo, semanas, cubos, dueños,
 * permisos, especies—: los totales se calculan acá, no en el navegador.
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'.
 */

/* Año 19xx/20xx (revisión 23-09): `Date.UTC` lee los años 0-99 como 1900+,
   y «mes=0050-01» armaba un período de 1.900 años (23 MB, 3,2 s). */
const DIA = /^(19|20)\d{2}-\d{2}-\d{2}$/;
const valores = z.array(z.string().trim().min(1).max(160)).max(60);

const querySchema = z
  .object({
    periodo: z.enum(["semanas", "mes", "rango"]).default("semanas"),
    semanas: z.coerce.number().int().min(1).max(SEMANAS_MAX).optional(),
    mes: z
      .string()
      .regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, "el mes va como AAAA-MM")
      .optional(),
    desde: z.string().regex(DIA, "la fecha va como AAAA-MM-DD").optional(),
    hasta: z.string().regex(DIA, "la fecha va como AAAA-MM-DD").optional(),
    agrupacion: z.enum(["dia", "semana", "mes"]).default("semana"),
    especie: valores,
    dueno: valores,
    permiso: valores,
  })
  .superRefine((q, ctx) => {
    if (q.periodo === "rango" && (!q.desde || !q.hasta)) {
      ctx.addIssue({ code: "custom", path: ["desde"], message: "un rango necesita «desde» y «hasta»" });
    }
  });

export const GET = withApiHandler("forestal-ctp-reportes-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!habilitado) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const sp = url.searchParams;
  /* Los filtros son repetibles (`?especie=a&especie=b`): `fromEntries` se
     quedaría con el último y un filtro de dos especies mostraría una. */
  const parsed = querySchema.safeParse({
    ...Object.fromEntries(sp),
    especie: sp.getAll("especie"),
    dueno: sp.getAll("dueno"),
    permiso: sp.getAll("permiso"),
  });
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  const q = parsed.data;

  const hoy = limaDateKey();
  const periodo: PeriodoReporte =
    q.periodo === "mes"
      ? { tipo: "mes", mes: q.mes ?? hoy.slice(0, 7) }
      : q.periodo === "rango"
        ? { tipo: "rango", desde: q.desde ?? hoy, hasta: q.hasta ?? hoy }
        : { tipo: "semanas", semanas: q.semanas ?? 8 };

  try {
    const reporte = await ForestCtpReportesDB.reporteDeProduccion(
      auth.tenantId,
      {
        periodo,
        agrupacion: q.agrupacion,
        filtros: { especies: q.especie, duenos: q.dueno, permisos: q.permiso },
      },
      hoy,
    );
    return NextResponse.json({ reporte });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-reportes.GET", auth.tenantId);
  }
});
