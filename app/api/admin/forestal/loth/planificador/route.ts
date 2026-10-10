import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { arbolesParaPlanificar, contextoDelPlan, obtenerGeografia } from "@/lib/forestal/loth-geografia-servidor";
import { lineasDeCartografia } from "@/lib/forestal/loth-geografia";
import { planificarExtraccion, type ParametrosPlan } from "@/lib/forestal/loth-planificador";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";

/**
 * /api/admin/forestal/loth/planificador — propone cómo sacar la madera de un
 * plan según la geografía: patio de acopio (y dos alternativas), campamento,
 * trochas de arrastre, camino de salida, orden de tala y zonas no aptas, cada
 * cosa con su porqué y sus cifras.
 *
 * GET ?planId=X (sin planId = el plan activo)
 *     &patioLat=&patioLng=   → el patio que el usuario movió: se respeta
 *     &soloEnPie=1           → sólo los árboles por talar
 *     &pendienteMax= &pendientePatio= &fajaRio= &fajaQuebrada=  → parámetros
 *
 * → { planId, propuesta, arboles{considerados,sinCoordenadas,excluidos[]},
 *     geografia{bbox,base,fuentes,avisos,rios,caminos,desdeCache}|null }
 *
 * Sólo LEE y calcula: lo propuesto se guarda con el PUT de siempre de la
 * cartografía (`mezclarPropuestaEnCartografia` arma el cuerpo sin pisar lo
 * dibujado). La geografía sale SÓLO de la caché de `/loth/geografia` (este GET
 * nunca sale a internet); sin geografía el plan se arma igual con lo dibujado
 * y lo dice. `puedeGuardar` = la misma regla de roles del PUT de la cartografía.
 *
 * Guard: requireAdmin → rate limit (bucket propio) → spec:forestal:loth-libro.
 */

const numero = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v == null || v === "" ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= min && v <= max), { message: `Debe ser un número entre ${min} y ${max}` });

const querySchema = z
  .object({
    planId: z.string().trim().max(64).optional(),
    patioLat: numero(-90, 90),
    patioLng: numero(-180, 180),
    soloEnPie: z.enum(["0", "1", "true", "false"]).optional(),
    pendienteMax: numero(5, 100),
    pendientePatio: numero(1, 50),
    fajaRio: numero(0, 500),
    fajaQuebrada: numero(0, 500),
  })
  .refine((q) => (q.patioLat === undefined) === (q.patioLng === undefined), { message: "El patio necesita latitud y longitud" });

export const GET = withApiHandler("forestal-loth-planificador", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth-planificador");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  // z.object descarta las claves que no declara: un parámetro de más no rompe nada.
  const parsed = querySchema.safeParse(Object.fromEntries(sp.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const q = parsed.data;

  try {
    const ctx = await contextoDelPlan(auth.tenantId, q.planId || null);
    const [geo, seleccion] = await Promise.all([
      // NUNCA sale a internet: la geografía la trae `/loth/geografia` (el panel la
      // pide antes de proponer). Mover el patio recalcula con lo ya traído.
      obtenerGeografia(auth.tenantId, ctx, { soloCache: true, user: auth.username ?? "unknown" }),
      arbolesParaPlanificar(auth.tenantId, ctx, { soloEnPie: q.soloEnPie === "1" || q.soloEnPie === "true" }),
    ]);
    const dibujado = lineasDeCartografia(ctx.carto);
    const parametros: Partial<ParametrosPlan> = {
      ...(q.pendienteMax !== undefined && { pendienteMaxArrastrePct: q.pendienteMax }),
      ...(q.pendientePatio !== undefined && { pendienteMaxPatioPct: q.pendientePatio }),
      ...(q.fajaRio !== undefined && { fajaRioM: q.fajaRio }),
      ...(q.fajaQuebrada !== undefined && { fajaQuebradaM: q.fajaQuebrada }),
    };

    const t0 = performance.now();
    const propuesta = planificarExtraccion({
      arboles: seleccion.arboles,
      predio: ctx.contorno,
      rios: [...(geo.ok ? geo.geografia.rios : []), ...dibujado.rios],
      caminos: [...(geo.ok ? geo.geografia.caminos : []), ...dibujado.caminos],
      elevacion: geo.ok ? geo.geografia.elevacion : null,
      bbox: geo.ok ? geo.geografia.bbox : null,
      patioFijo: q.patioLat !== undefined && q.patioLng !== undefined ? [q.patioLat, q.patioLng] : null,
      semilleros: seleccion.semilleros,
      parametros,
    });
    const msCalculo = Math.round(performance.now() - t0);
    // Los avisos de la geografía y de la selección van primero: explican los del plan.
    propuesta.avisos = [...(geo.ok ? geo.geografia.avisos : [geo.motivo]), ...seleccion.avisos, ...propuesta.avisos];

    return NextResponse.json({
      planId: ctx.planId,
      propuesta,
      // El almacenero propone; guardar en el plano, con la regla del PUT de la cartografía.
      puedeGuardar: puedePedir("PUT /api/admin/forestal/loth/cartografia", auth.role),
      msCalculo,
      arboles: { considerados: seleccion.arboles.length, sinCoordenadas: ctx.sinCoordenadas, excluidos: seleccion.excluidos },
      geografia: geo.ok
        ? {
            bbox: geo.geografia.bbox,
            base: geo.geografia.base,
            fuentes: geo.geografia.fuentes,
            desdeCache: geo.geografia.desdeCache,
            rios: geo.geografia.rios.length,
            caminos: geo.geografia.caminos.length,
            dibujados: { rios: dibujado.rios.length, caminos: dibujado.caminos.length },
          }
        : null,
    });
  } catch (err) {
    logger.error("[loth.planificador.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
