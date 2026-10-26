/**
 * GTF preliminares de un plan (Brandon 25-10): las guías hechas a mano que
 * todavía no se registran en SERFOR ni en el libro.
 *
 *   POST  { planId, numeroGtf, numerosLt[], fecha?, lineas[], nota? } → 201 { guia, yaEnElLibro, message? }
 *   PATCH { planId, id, accion: "corregir", datos }                → { guia, yaEnElLibro, message? }
 *   PATCH { planId, id, accion: "registrada" | "pendiente" }        → { guia }
 *   PATCH { planId, id, accion: "anular", motivo }                  → { guia }
 *
 * Leer va junto con el saldo (`GET /loth/saldo-plan?planId=…&preliminares=1`):
 * el KPI se calcula contra ESE saldo, en el servidor. Escribe quien edita el
 * plan (admin y dueño, como `plan/bloques`). El freno legal no lee esto.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestPlanPreliminaresDB, PreliminarError } from "@/lib/db/forest-plan-preliminares.db";
import { datosPreliminarSchema, type GtfPreliminar } from "@/lib/forestal/loth-plan-preliminares";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { motivoObligatorio } from "@/lib/validations/motivo";

const id = z.string({ error: "Falta el identificador." }).trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "El identificador no es válido.");

const postSchema = z.strictObject({ planId: id, ...datosPreliminarSchema.shape });

const patchSchema = z.discriminatedUnion(
  "accion",
  [
    z.strictObject({ planId: id, id, accion: z.literal("corregir"), datos: datosPreliminarSchema }),
    z.strictObject({ planId: id, id, accion: z.literal("registrada") }),
    z.strictObject({ planId: id, id, accion: z.literal("pendiente") }),
    z.strictObject({ planId: id, id, accion: z.literal("anular"), motivo: motivoObligatorio(300) }),
  ],
  { error: "Elige qué hacer con la guía: corregir, registrada, pendiente o anular." },
);

/** El 400 con el mensaje de la fila que falla («Fila 2: los m³ van mayores que cero.»). */
function invalido(error: z.ZodError): NextResponse {
  const i = error.issues[0];
  const path = (i?.path ?? []).filter((p) => p !== "datos");
  const fila = path[0] === "lineas" && typeof path[1] === "number" ? `Fila ${path[1] + 1}: ` : "";
  return NextResponse.json(
    { error: "validation_error", message: i ? `${fila}${i.message}` : "Los datos enviados no son válidos.", issues: error.issues },
    { status: 400 },
  );
}

/** Rol, cupo y especialidad: lo mismo para alta y cambios. */
async function puertas(req: NextRequest, que: string) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, que);
  if (prohibido) return prohibido;
  /* Su propio balde: anotar guías no gasta el cupo de las lecturas del libro. */
  const rl = applyRateLimit(req, "GENEROUS", "loth-preliminar");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  return auth;
}

async function leerBody(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

const yaEnElLibroMsg = (g: GtfPreliminar) =>
  `La GTF ${g.numeroGtf} ya estaba en el libro de este plan: quedó como registrada y no descuenta otra vez.`;

function fallo(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof PreliminarError) {
    return NextResponse.json({ error: err.codigo, message: err.message }, { status: err.status });
  }
  logger.error(`[${ctx}] failed`, { error: String(err), tenantId });
  return NextResponse.json({ error: "internal_error", message: "No se pudo guardar la guía. Vuelve a intentar." }, { status: 500 });
}

const planNoEncontrado = () => NextResponse.json({ error: "plan_no_encontrado", message: "No encontramos ese plan." }, { status: 404 });

export const POST = withApiHandler("forestal-plan-preliminares-post", async (req: NextRequest) => {
  const auth = await puertas(req, "anotar GTF preliminares del plan");
  if (auth instanceof Response) return auth;
  const b = await leerBody(req);
  if (!b.ok) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = postSchema.safeParse(b.body);
  if (!parsed.success) return invalido(parsed.error);
  const { planId, ...datos } = parsed.data;
  try {
    // El plan tiene que ser de este negocio: el planId suelto no dice de quién es.
    if (!(await ForestPlanDB.getPlan(auth.tenantId, planId))) return planNoEncontrado();
    const r = await ForestPlanPreliminaresDB.crear(auth.tenantId, planId, datos, auth.username ?? "unknown");
    return NextResponse.json({ ...r, message: r.yaEnElLibro ? yaEnElLibroMsg(r.guia) : undefined }, { status: 201 });
  } catch (err) {
    return fallo(err, "plan.preliminares.POST", auth.tenantId);
  }
});

export const PATCH = withApiHandler("forestal-plan-preliminares-patch", async (req: NextRequest) => {
  const auth = await puertas(req, "cambiar las GTF preliminares del plan");
  if (auth instanceof Response) return auth;
  const b = await leerBody(req);
  if (!b.ok) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = patchSchema.safeParse(b.body);
  if (!parsed.success) return invalido(parsed.error);
  const p = parsed.data;
  const user = auth.username ?? "unknown";
  try {
    if (!(await ForestPlanDB.getPlan(auth.tenantId, p.planId))) return planNoEncontrado();
    if (p.accion === "corregir") {
      const r = await ForestPlanPreliminaresDB.corregir(auth.tenantId, p.planId, p.id, p.datos, user);
      return NextResponse.json({ ...r, message: r.yaEnElLibro ? yaEnElLibroMsg(r.guia) : undefined });
    }
    /* «Ya la registré»: la guía del libro la busca el servidor por el N.º (nunca un id que mande la pantalla). */
    const accion = p.accion === "anular" ? { accion: "anular" as const, motivo: p.motivo } : { accion: p.accion };
    const guia = await ForestPlanPreliminaresDB.cambiarEstado(auth.tenantId, p.planId, p.id, accion, user);
    return NextResponse.json({ guia });
  } catch (err) {
    return fallo(err, "plan.preliminares.PATCH", auth.tenantId);
  }
});
