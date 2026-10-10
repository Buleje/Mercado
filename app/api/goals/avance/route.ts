import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { AdminGoalsDB } from "@/lib/db/admin-goals.db";
import { CATEGORIAS_META, PERIODOS_META } from "@/lib/admin/metas-tareas";
import type { RespuestaAvance } from "@/lib/admin/metas-catalogo";
import { avanceDeMetas, avanceDePrueba } from "@/lib/metas/avance";
import { ROLES_AVANCE } from "@/lib/metas/roles";

/**
 * GET /api/goals/avance — cuánto lleva cada meta, derivado de los datos reales
 * de su período (ADR-488). Totales en el servidor: antes la pantalla sumaba
 * `/api/sales?limit=500` en el navegador (sólo POS, hora del navegador, cortado
 * en 500 ventas).
 *
 * - Sin query → `RespuestaAvance` de todas las metas del negocio.
 * - `?category=&period=&unit=[&target=]` → la vista previa del modal: una sola
 *   medición, con id `vista-previa`, sin guardar nada.
 * - `?fresco=1` salta la caché (botón «Actualizar»).
 *
 * Roles: el avance es plata del negocio (ventas, compras, gastos, caja): los
 * que leen ventas Y gastos en la matriz — admin, dueño, encargado y analista.
 * Cajero y almacenero reciben 403 y la pantalla muestra las metas sin avance.
 * La constante es la misma de `/serie` y `/logros` (`lib/metas/roles.ts`).
 */
const vistaPreviaSchema = z.object({
  category: z.enum(CATEGORIAS_META),
  period: z.enum(PERIODOS_META),
  unit: z.string().trim().min(1).max(20).optional(),
  target: z.coerce.number().positive().max(999_999_999_999.99).optional(),
});

const SIN_CACHE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_AVANCE);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const fresco = sp.get("fresco") === "1";
  const hoy = limaDateKey();
  const pideVistaPrevia = ["category", "period", "unit", "target"].some((k) => sp.has(k));

  if (pideVistaPrevia) {
    const parsed = vistaPreviaSchema.safeParse({
      category: sp.get("category") ?? undefined,
      period: sp.get("period") ?? undefined,
      unit: sp.get("unit") || undefined,
      target: sp.get("target") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Elige qué medir y el período", code: "validation_error", issues: parsed.error.issues },
        { status: 422, headers: SIN_CACHE },
      );
    }
    try {
      const avance = await avanceDePrueba(auth.tenantId, parsed.data, hoy, { fresco });
      const cuerpo: RespuestaAvance = { hoy, avances: [avance] };
      return NextResponse.json(cuerpo, { headers: SIN_CACHE });
    } catch (e) {
      logger.error("[goals/avance] vista previa", { tenantId: auth.tenantId, err: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "No se pudo calcular cuánto llevas. Reintenta." }, { status: 503, headers: SIN_CACHE });
    }
  }

  try {
    const metas = await AdminGoalsDB.listar(auth.tenantId);
    const cuerpo: RespuestaAvance = { hoy, avances: await avanceDeMetas(auth.tenantId, metas, hoy, { fresco }) };
    return NextResponse.json(cuerpo, { headers: SIN_CACHE });
  } catch (e) {
    logger.error("[goals/avance] GET", { tenantId: auth.tenantId, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo calcular el avance de tus metas. Reintenta." }, { status: 503, headers: SIN_CACHE });
  }
}
