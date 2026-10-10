import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { PLAN_ID_VALIDO, leerAlcanceGeo } from "@/lib/forestal/loth-alcance-geo";
import { hasCartografia } from "@/lib/forestal/loth-cartografia";
import { CartografiaCambioError, ForestLothCartografiaDB } from "@/lib/db/forest-loth-cartografia.db";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/cartografia — contexto del plano del Libro TH:
 * referencias georreferenciadas (centros poblados, campamentos, ingreso a la
 * UMF…) y el cuadro de ACCESOS (tramo · tiempo · movilidad).
 *
 * GET — lee la cartografía del tenant. ADR-462: una por permiso, con la misma
 *       lectura que la parcela (`planId`, `solo`, `todos`). En `todos` suma
 *       `porPermiso: [{ planId, cartografia }]` y mezcla las listas (referencias,
 *       vías, accesos) del negocio y de cada plan, cada ítem con su `planId`.
 * PUT — la reemplaza { referencias[], vias[], accesos[], nota, baseUpdatedAt?, planId? }.
 *       Con `baseUpdatedAt` (el `updatedAt` que se leyó) y otro guardó en el
 *       medio → 409 `cartografia_cambio` con la versión actual, sin escribir.
 *       Sin él (clientes viejos) se guarda como siempre. El 409 es POR PLAN.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const putSchema = z.object({
  referencias: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        nombre: z.string().trim().max(80),
        tipo: z.string().trim().max(30),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        nota: z.string().trim().max(160).optional(),
      }),
    )
    .max(120)
    .default([]),
  vias: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        nombre: z.string().trim().max(80),
        tipo: z.string().trim().max(20),
        puntos: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).max(500),
      }),
    )
    .max(40)
    .default([]),
  accesos: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        lugar: z.string().trim().max(120),
        tiempo: z.string().trim().max(40).optional(),
        movilidad: z.string().trim().max(40).optional(),
      }),
    )
    .max(20)
    .default([]),
  /**
   * Contorno e identidad del predio. Va en el schema y no sólo en el
   * normalizador: Zod descarta lo que no declara, así que sin esto el PUT
   * guardaba la cartografía SIN el predio y sin un solo error — la pantalla
   * decía "guardado" y al recargar el contorno no estaba.
   */
  predio: z
    .object({
      nombre: z.string().trim().max(120).default(""),
      sector: z.string().trim().max(120).default(""),
      comunidad: z.string().trim().max(120).default(""),
      vertices: z
        .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
        .max(500)
        .default([]),
    })
    .default({ nombre: "", sector: "", comunidad: "", vertices: [] }),
  nota: z.string().trim().max(300).default(""),
  /** La versión que el cliente leyó (control optimista); null = nunca se guardó. */
  baseUpdatedAt: z.string().trim().max(40).nullable().optional(),
  /** El permiso al que pertenece; sin él (o null) es la del negocio. */
  planId: z.string().regex(PLAN_ID_VALIDO).nullable().optional(),
});

/** Un permiso ajeno o dado de baja no se acepta: su clave quedaría huérfana, invisible para todo filtro. */
async function planInvalido(tenantId: string, planId: string | null | undefined) {
  if (!planId) return null;
  const plan = await ForestPlanDB.getPlan(tenantId, planId);
  return plan ? null : NextResponse.json({ error: "plan_not_found", message: "Ese permiso no existe en este negocio o fue dado de baja." }, { status: 404 });
}


async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-cartografia-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const lectura = leerAlcanceGeo(new URL(req.url).searchParams);
  if (!lectura.ok) return NextResponse.json({ error: "validation_error", message: lectura.mensaje }, { status: 400 });
  const { alcance } = lectura;

  try {
    if (alcance.tipo === "plan") {
      const propia = await ForestLothCartografiaDB.get(auth.tenantId, alcance.planId);
      if (hasCartografia(propia) || !alcance.heredar) return NextResponse.json({ cartografia: propia, heredada: false, porPermiso: [] });
      return NextResponse.json({ cartografia: await ForestLothCartografiaDB.get(auth.tenantId), heredada: true, porPermiso: [] });
    }
    const negocio = await ForestLothCartografiaDB.get(auth.tenantId);
    if (alcance.tipo === "todos") {
      const planes = await ForestPlanDB.listPlans(auth.tenantId);
      const porPermiso = await ForestLothCartografiaDB.listarPorPlan(auth.tenantId, planes.map((p) => p.id).filter((id) => PLAN_ID_VALIDO.test(id)));
      const conPlan = <T,>(items: T[], planId: string | null) => items.map((i) => ({ ...i, planId }));
      const cartografia = {
        ...negocio,
        referencias: [...conPlan(negocio.referencias, null), ...porPermiso.flatMap((p) => conPlan(p.cartografia.referencias, p.planId))],
        vias: [...conPlan(negocio.vias, null), ...porPermiso.flatMap((p) => conPlan(p.cartografia.vias, p.planId))],
        accesos: [...conPlan(negocio.accesos, null), ...porPermiso.flatMap((p) => conPlan(p.cartografia.accesos, p.planId))],
      };
      return NextResponse.json({ cartografia, heredada: false, porPermiso });
    }
    return NextResponse.json({ cartografia: negocio, heredada: false, porPermiso: [] });
  } catch (err) {
    logger.error("[loth.cartografia.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-cartografia-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["PUT /api/admin/forestal/loth/cartografia"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { baseUpdatedAt, planId, ...cartografiaNueva } = parsed.data;
  try {
    const ajeno = await planInvalido(auth.tenantId, planId);
    if (ajeno) return ajeno;
    const cartografia = await ForestLothCartografiaDB.set(auth.tenantId, cartografiaNueva, auth.username ?? "unknown", undefined, { baseUpdatedAt, planId: planId ?? null });
    return NextResponse.json({ cartografia });
  } catch (err) {
    if (err instanceof CartografiaCambioError) {
      return NextResponse.json(
        { error: "cartografia_cambio", message: "Alguien cambió el plano después de que lo abriste.", cartografia: err.actual },
        { status: 409 },
      );
    }
    logger.error("[loth.cartografia.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
