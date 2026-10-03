import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlantaZonaDB, ZonaCroquisInvalidaError } from "@/lib/db/forest-planta-zona.db";
import { isZonaTipo } from "@/lib/forestal/planta-zona-types";

/**
 * /api/admin/forestal/ctp/planta/croquis/zonas — alta en LOTE de las zonas del
 * croquis que Brandon confirmó al importar el PDF del plano (ADR-465).
 *
 * POST { zonas: [{ codigo, nombre?, tipo, poligono, notas? }] } (1–200)
 *   → { ok, creadas: PlantaZona[], omitidas: [{ codigo, motivo }] }
 * Una sola escritura del KV; un código que ya existe NO se pisa (va a
 * `omitidas`). Polígono `[[y,x]]` en metros: área y centroide los calcula el
 * servidor. Admin/owner (es configurar el plano, como subir la imagen).
 */

const zonaSchema = z.object({
  codigo: z.string().trim().min(1).max(40),
  nombre: z.string().trim().max(120).nullable().optional(),
  tipo: z.string().trim().refine(isZonaTipo, "Tipo de zona inválido"),
  poligono: z.string().trim().min(2).max(50000),
  notas: z.string().trim().max(2000).nullable().optional(),
});
const bodySchema = z.object({ zonas: z.array(zonaSchema).min(1).max(200) });

export const POST = withApiHandler("forestal-ctp-planta-croquis-zonas", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
  }
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  try {
    const r = await ForestPlantaZonaDB.crearVarias(auth.tenantId, parsed.data.zonas, auth.username ?? "unknown");
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof ZonaCroquisInvalidaError) {
      return NextResponse.json({ error: "zona_croquis_invalida", message: err.message }, { status: 400 });
    }
    throw err;
  }
});
