import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CroquisInvalidoError, ForestPlantaCroquisDB } from "@/lib/db/forest-planta-croquis.db";
import { borrarImagenCroquis } from "@/lib/forestal/croquis-storage";
import { CROQUIS_MAX_ALTO_M, CROQUIS_MAX_ANCHO_M, croquisParaCliente } from "@/lib/forestal/planta-croquis-guardado";

/**
 * /api/admin/forestal/ctp/planta/croquis — el croquis del aserradero en metros (ADR-465).
 *
 * GET → { croquis: PlantaCroquis | null }   (admin/almacenero/owner: lo ve quien ve el plano)
 * PUT { version?, anchoM?, altoM?, maquinas?, imagenRef? } → { ok, croquis }
 *     Todo opcional: lo que no viene se conserva (mover una máquina = sólo
 *     `maquinas`). Sin croquis previo, `anchoM` y `altoM` van sí o sí.
 *     `imagenRef`: lo que devolvió `POST croquis/imagen` · `null` = sacar la
 *     imagen · ausente = no tocarla.
 *
 * El PUT es SOLO admin/owner: cambiar las medidas del terreno mueve todo lo
 * dibujado; el almacenero ubica madera, no rediseña la planta.
 */

async function guard(req: NextRequest, roles: ("admin" | "almacenero" | "owner")[]) {
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
  }
  return auth;
}

export const GET = withApiHandler("forestal-ctp-planta-croquis-get", async (req: NextRequest) => {
  const auth = await guard(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ croquis: await ForestPlantaCroquisDB.getParaCliente(auth.tenantId) });
});

const maquinaSchema = z.object({
  codigo: z.string().trim().min(1).max(12),
  nombre: z.string().trim().min(1).max(60),
  /* Metros sobre el plano. La que está «fuera» puede traer cualquier punto
     razonable: se dibuja en la franja de afuera. */
  x: z.number().min(-1000).max(1000),
  y: z.number().min(-1000).max(1000),
  fuera: z.boolean().default(false),
});

const croquisSchema = z.object({
  version: z.number().int().min(1).max(999).optional(),
  anchoM: z.number().positive().max(CROQUIS_MAX_ANCHO_M, `El croquis admite hasta ${CROQUIS_MAX_ANCHO_M} m de ancho`).optional(),
  altoM: z.number().positive().max(CROQUIS_MAX_ALTO_M, `El croquis admite hasta ${CROQUIS_MAX_ALTO_M} m de alto`).optional(),
  maquinas: z.array(maquinaSchema).max(50).optional(),
  imagenRef: z.string().trim().min(1).max(300).nullable().optional(),
});

export const PUT = withApiHandler("forestal-ctp-planta-croquis-put", async (req: NextRequest) => {
  const auth = await guard(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = croquisSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const { imagenRef, ...resto } = parsed.data;
  try {
    const { croquis, imagenAnterior } = await ForestPlantaCroquisDB.save(
      auth.tenantId,
      { ...resto, imagenPath: imagenRef },
      auth.username ?? "unknown",
    );
    // La imagen reemplazada se borra del bucket; si falla queda un archivo suelto, nada más.
    if (imagenAnterior) {
      borrarImagenCroquis(imagenAnterior).catch((err) =>
        logger.error("[croquis] borrar imagen anterior falló", { tenantId: auth.tenantId, error: String(err) }),
      );
    }
    return NextResponse.json({ ok: true, croquis: croquisParaCliente(croquis) });
  } catch (err) {
    if (err instanceof CroquisInvalidoError) {
      return NextResponse.json({ error: "croquis_invalido", message: err.message }, { status: 400 });
    }
    throw err;
  }
});
