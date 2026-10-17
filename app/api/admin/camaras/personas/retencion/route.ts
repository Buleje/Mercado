import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { CamarasDB } from "@/lib/db/camaras.db";
import {
  DIAS_RETENCION_PERSONAS_DEFECTO,
  DIAS_RETENCION_PERSONAS_MAX,
  DIAS_RETENCION_PERSONAS_MIN,
} from "@/lib/camaras/personas-retencion";

/**
 * /api/admin/camaras/personas/retencion — cuántos días se guardan las fotos del
 * detector de personas antes de ir a la papelera del Drive (cron diario
 * `camaras-personas-retencion`).
 *
 * GET — `{ ok, dias, porDefecto, min, max, puedeEditar }` (admin, dueño, almacenero).
 * PUT — `{ dias }` entero 1-60 → `{ ok, dias }`. Sólo admin y dueño: decide
 *       cuánto historial se conserva (`requireAdmin` deja pasar al encargado:
 *       se corta aparte con `soloAdminODueno`).
 */
const cuerpoSchema = z.object({
  dias: z.number().int().min(DIAS_RETENCION_PERSONAS_MIN).max(DIAS_RETENCION_PERSONAS_MAX),
});

const json = (cuerpo: unknown, status = 200) =>
  NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export const GET = withApiHandler("camaras-personas-retencion-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "camaras-personas-retencion");
  if (rl) return rl;
  const dias = await CamarasDB.retencionPersonas(auth.tenantId);
  return json({
    ok: true,
    dias,
    porDefecto: DIAS_RETENCION_PERSONAS_DEFECTO,
    min: DIAS_RETENCION_PERSONAS_MIN,
    max: DIAS_RETENCION_PERSONAS_MAX,
    puedeEditar: auth.role === "admin" || auth.role === "owner",
  });
});

export const PUT = withApiHandler("camaras-personas-retencion-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "cambiar cuánto se guardan las fotos de personas");
  if (prohibido) return prohibido;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "camaras-personas-retencion");
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const p = cuerpoSchema.safeParse(body);
  if (!p.success) {
    return json(
      {
        error: "validation_error",
        message: `Pon un número entero de días entre ${DIAS_RETENCION_PERSONAS_MIN} y ${DIAS_RETENCION_PERSONAS_MAX}.`,
      },
      400,
    );
  }
  const ok = await CamarasDB.fijarRetencionPersonas(auth.tenantId, p.data.dias, auth.username ?? "unknown");
  if (!ok) return json({ error: "validation_error", message: "Ese número de días no vale." }, 400);
  return json({ ok: true, dias: p.data.dias });
});
