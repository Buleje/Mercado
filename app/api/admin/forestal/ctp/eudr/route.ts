import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestOrigenGeoDB } from "@/lib/db/forest-origen-geo.db";
import { buildDdsForDespacho } from "@/lib/forestal/eudr-dossier";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/eudr — geolocalización de orígenes + dossier EUDR (ADR-140).
 *
 * GET                → { origins, geo } para el editor de geolocalización.
 * GET ?despacho=<id> → { dds } Declaración de Diligencia Debida de ese despacho.
 * PUT { originCode, ... } → guarda la geo de un origen.
 */

const geoSchema = z.object({
  originCode: z.string().trim().min(1, "Falta el código de origen").max(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  polygonJson: z.string().trim().max(20000).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  pais: z.string().trim().max(4).optional(),
  deforestationFree: z.boolean().optional(),
  notas: z.string().trim().max(1000).nullable().optional(),
});

export const GET = withApiHandler("forestal-ctp-eudr", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const despacho = req.nextUrl.searchParams.get("despacho");
  if (despacho) {
    const dds = await buildDdsForDespacho(auth.tenantId, despacho);
    if (!dds) return NextResponse.json({ error: "not_found", message: "Despacho no encontrado." }, { status: 404 });
    return NextResponse.json({ dds });
  }

  const [origins, geo] = await Promise.all([
    ForestOrigenGeoDB.distinctOrigins(auth.tenantId),
    ForestOrigenGeoDB.getMap(auth.tenantId),
  ]);
  return NextResponse.json({ origins, geo: Object.values(geo) });
});

export const PUT = withApiHandler("forestal-ctp-eudr-set", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = geoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const saved = await ForestOrigenGeoDB.set(auth.tenantId, parsed.data, auth.username ?? "unknown");
  return NextResponse.json({ ok: true, geo: saved });
});
