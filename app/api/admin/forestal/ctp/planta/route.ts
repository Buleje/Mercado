import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlantaZonaDB } from "@/lib/db/forest-planta-zona.db";
import { isZonaTipo } from "@/lib/forestal/planta-zona-types";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/planta — zonas físicas del aserradero (Mapa de Planta, ADR-142).
 *
 * GET                 → { zonas }
 * POST { ...zona }    → crea una zona (sin id) y devuelve la creada
 * PATCH { id, ...zona}→ actualiza una zona existente
 * DELETE ?id=<id>     → borra la zona
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'. Zonas en KV
 * (sin migración). Zod safeParse; tipo inválido → 400.
 */

const zonaSchema = z.object({
  id: z.string().trim().min(1).optional(),
  codigo: z.string().trim().min(1, "El código es obligatorio").max(40),
  nombre: z.string().trim().max(120).nullable().optional(),
  tipo: z.string().trim().refine(isZonaTipo, "Tipo de zona inválido"),
  poligono: z.string().trim().max(50000).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  areaM2: z.number().min(0).max(1_000_000_000).nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

async function guard(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
  }
  return auth;
}

export const GET = withApiHandler("forestal-ctp-planta", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const zonas = await ForestPlantaZonaDB.list(auth.tenantId);
  return NextResponse.json({ zonas });
});

async function upsert(req: NextRequest) {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = zonaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const zona = await ForestPlantaZonaDB.save(auth.tenantId, parsed.data, auth.username ?? "unknown");
  return NextResponse.json({ ok: true, zona });
}

export const POST = withApiHandler("forestal-ctp-planta-create", upsert);
export const PATCH = withApiHandler("forestal-ctp-planta-update", upsert);

export const DELETE = withApiHandler("forestal-ctp-planta-delete", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const ok = await ForestPlantaZonaDB.remove(auth.tenantId, id, auth.username ?? "unknown");
  return NextResponse.json({ ok });
});
