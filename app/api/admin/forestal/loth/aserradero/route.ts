/**
 * GET /api/admin/forestal/loth/aserradero?ids=<trozadoId>,<trozadoId>…
 *
 * «Por árbol» sigue la troza hasta el aserradero (L13): para cada línea de
 * Trozado del Libro TH, las piezas del Libro CTP que guardan su enlace
 * (`lothTrozadoId`, ADR-450) con su estado leído por la MISMA regla del patio
 * y de la ficha (`estadoDeFicha`), su ingreso, su corrida y su despacho.
 *
 * Sólo lectura. Los roles son los que ya ven el Libro TH y la ficha de la
 * troza. El tenant sale del JWT y va en el WHERE: un id de Trozado de otro
 * negocio no trae nada. Una consulta por llamada; el cliente parte la lista
 * en tandas de `MAX_IDS`.
 *
 * Sin el Libro CTP activo no hay a dónde seguir la troza: `{ ctp: false }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import {
  MAX_IDS_ASERRADERO,
  TOPE_PIEZAS_ASERRADERO,
  piezaDeFilaCtp,
  type PiezaCtp,
  type RespuestaAserradero,
} from "@/lib/forestal/loth-trace-aserradero";

const MAX_IDS = MAX_IDS_ASERRADERO;
const TOPE_PIEZAS = TOPE_PIEZAS_ASERRADERO;

const IdsSchema = z
  .array(z.string().trim().min(1).max(40).regex(/^[a-z0-9]+$/i, "id inválido"))
  .min(1, "Faltan ids de Trozado")
  .max(MAX_IDS, `Hasta ${MAX_IDS} ids por llamada`);

export const GET = withApiHandler("forestal-loth-aserradero", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth-aserradero");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const crudo = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => x.trim() !== "");
  const parsed = IdsSchema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", message: parsed.error.issues[0]?.message ?? "Consulta inválida" },
      { status: 400 },
    );
  }

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ ctp: false, piezas: [], truncado: false } satisfies RespuestaAserradero);
  }

  try {
    const filas = await WoodEntriesDB.trozasDeTrozados(auth.tenantId, parsed.data, TOPE_PIEZAS + 1);
    const piezas = filas
      .slice(0, TOPE_PIEZAS)
      .map((f) => piezaDeFilaCtp(auth.tenantId, f))
      .filter((p): p is PiezaCtp => p !== null);
    return NextResponse.json({ ctp: true, piezas, truncado: filas.length > TOPE_PIEZAS } satisfies RespuestaAserradero);
  } catch (err) {
    logger.error("[loth.aserradero.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
