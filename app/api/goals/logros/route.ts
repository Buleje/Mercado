import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ROLES_AVANCE } from "@/lib/metas/roles";
import { evaluarLogros } from "@/lib/metas/logros";
import { limaDateKey } from "@/lib/utils";

/**
 * GET /api/goals/logros — los logros del negocio, medidos de los datos al
 * leer, en el día de Lima (ADR-488). `?fresco=1` salta la caché de 5 min.
 *
 * Reemplaza, para la pantalla Metas y logros, a `/api/admin/achievements`
 * (que guardaba lo que el navegador calculaba); ese endpoint queda sin uso acá.
 *
 * Roles: los mismos que el avance (`ROLES_AVANCE`): los logros dicen récords en
 * S/, saldos de fiados y m³. Cajero y almacenero, 403.
 */

const consulta = z.object({ fresco: z.enum(["0", "1"]).optional() });
const SIN_CACHE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_AVANCE);
  if (auth instanceof NextResponse) return auth;

  const parsed = consulta.safeParse({
    fresco: req.nextUrl.searchParams.get("fresco") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Usa ?fresco=1 o nada", code: "validation_error" },
      { status: 422, headers: SIN_CACHE },
    );
  }

  try {
    const respuesta = await evaluarLogros(auth.tenantId, limaDateKey(), parsed.data.fresco === "1");
    return NextResponse.json(respuesta, { headers: SIN_CACHE });
  } catch (e) {
    logger.error("[goals/logros] GET error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "No se pudieron leer tus logros. Reintenta en un rato." },
      { status: 503, headers: SIN_CACHE },
    );
  }
}
