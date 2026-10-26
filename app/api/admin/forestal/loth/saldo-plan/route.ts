import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestLothSaldoPlanDB } from "@/lib/db/forest-loth-saldo-plan.db";
import { ForestPlanPreliminaresDB } from "@/lib/db/forest-plan-preliminares.db";
import { logger } from "@/lib/logger";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * /api/admin/forestal/loth/saldo-plan — «Saldo que no se pasa» (24-10).
 *
 *   GET  ?planId=…   → el saldo del plan por especie: autorizado · usado · queda,
 *                      con la guía de cada m³ (`ForestLothSaldoPlanDB.saldo`).
 *        &preliminares=1 → además, las GTF preliminares del plan (hechas a mano,
 *                      por enviar a SERFOR) y «saldo si se registran», contra ESE
 *                      saldo. No tocan el freno: se muestran aparte.
 *   GET  ?sinPlan=1  → el de cada plan vigente con especies: lo que sale sin plan
 *                      se mide contra todos (el freno del despacho sin permiso).
 *   GET  ?sueltos=1  → las guías y trozas sin plan, con el plan sugerido y el que
 *                      se crearía desde cada guía.
 *   POST { gtfId, titularName, especies[] } → «Crear el plan desde la guía»: plan +
 *                      su registro (lo autorizado lo escribe la persona) + el atado
 *                      de la guía, en una transacción. 409 si el plan de ese título
 *                      ya existe (se ata a ése con POST /loth/guia-permiso).
 *
 * Leer: los roles que leen el libro. Crear un plan cambia el saldo de un permiso:
 * sólo admin/dueño (como asignarle el permiso a una guía).
 */

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "El identificador no es válido.");

/* `v` = la versión que manda la pantalla para releer; no cambia la respuesta. */
const getSchema = z.union([
  z.object({ sueltos: z.literal("1") }),
  z.object({ sinPlan: z.literal("1") }),
  z.object({ planId: id, preliminares: z.literal("1").optional() }),
]);

const postSchema = z.object({
  gtfId: id,
  titularName: z.string().trim().min(1, "Escribe el titular del plan.").max(200),
  especies: z
    .array(
      z.object({
        especie: z.string().trim().min(1).max(200),
        volumenAutorizadoM3: z.number().finite().positive("Lo autorizado va en m³, mayor que cero.").max(1_000_000),
      }),
    )
    .max(50)
    .default([]),
});

export const GET = withApiHandler("forestal-loth-saldo-plan-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  const parsed = getSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    if ("sueltos" in parsed.data) {
      return NextResponse.json(await ForestLothSaldoPlanDB.sueltos(auth.tenantId));
    }
    if ("sinPlan" in parsed.data) {
      return NextResponse.json(await ForestLothSaldoPlanDB.saldosDeLoSinPlan(auth.tenantId));
    }
    const r = await ForestLothSaldoPlanDB.saldo(auth.tenantId, parsed.data.planId);
    if (!r) return NextResponse.json({ error: "not_found", message: "No encontramos ese plan." }, { status: 404 });
    if (parsed.data.preliminares !== "1") return NextResponse.json(r);
    /* Lo preliminar no puede tumbar el saldo: si falla, el saldo sale igual y la pantalla lo dice. */
    const preliminares = await ForestPlanPreliminaresDB.delPlan(auth.tenantId, parsed.data.planId, r.saldo).catch((err) => {
      logger.error("[loth.saldo-plan.GET] preliminares falló", { error: String(err), tenantId: auth.tenantId });
      return null;
    });
    return NextResponse.json({ ...r, preliminares });
  } catch (err) {
    return lothErrorResponse(err, "loth.saldo-plan.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-loth-saldo-plan-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "crear el plan desde una guía");
  if (prohibido) return prohibido;
  /* Su propio balde: un alta no gasta el cupo de las lecturas del libro. */
  const rl = await applyRateLimit(req, "STRICT", "loth-plan-guia");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    const r = await ForestLothSaldoPlanDB.crearPlanDesdeLaGuia(
      auth.tenantId,
      parsed.data.gtfId,
      { titularName: parsed.data.titularName, especies: parsed.data.especies },
      auth.username ?? "unknown",
    );
    if (!r) return NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    /* Ya hay un plan con ese título: choca con algo que existe → 409, con el plan a usar. */
    if (err instanceof LothInvariantError && err.code === "PLAN_YA_EXISTE") {
      return NextResponse.json({ error: err.code, message: err.message, detail: err.detail }, { status: 409 });
    }
    return lothErrorResponse(err, "loth.saldo-plan.POST", auth.tenantId);
  }
});
