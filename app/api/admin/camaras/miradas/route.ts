import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { ACCION_MIRADA, ENTIDAD_MIRADA, leerDetalleMirada } from "@/lib/camaras/registro-miradas";

/**
 * GET /api/admin/camaras/miradas?camaraId=&persona= — los últimos 50 que
 * miraron el video de las cámaras (Ley 29733). Sólo lectura; sólo admin y
 * dueño (`requireAdmin` deja pasar al encargado: se corta aparte).
 */
const querySchema = z.object({
  camaraId: z.string().trim().min(1).max(64).optional(),
  persona: z.string().trim().min(1).max(64).optional(),
});

export const GET = withApiHandler("camaras-miradas-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "ver quién miró el video de las cámaras");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "GENEROUS", "camaras-miradas");
  if (rl) return rl;

  const sp = new URL(req.url).searchParams;
  const q = querySchema.safeParse({
    camaraId: sp.get("camaraId") ?? undefined,
    persona: sp.get("persona") ?? undefined,
  });
  if (!q.success)
    return NextResponse.json(
      { error: "validation_error", message: "El filtro no es válido." },
      { status: 400 },
    );

  const { items } = await ActivityLogDB.listWithCursor(auth.tenantId, {
    entity: ENTIDAD_MIRADA,
    action: ACCION_MIRADA,
    entityId: q.data.camaraId,
    user: q.data.persona,
    limit: 50,
  });
  return NextResponse.json(
    {
      miradas: items.map((i) => {
        const d = leerDetalleMirada(i.detail);
        return {
          id: i.id,
          persona: i.user,
          rol: d.rol ?? null,
          camaraId: i.entityId,
          camara: d.camara ?? null,
          tipo: d.tipo ?? null,
          calidad: d.calidad ?? null,
          desde: d.desde ?? null,
          hasta: d.hasta ?? null,
          hora: i.createdAt.toISOString(),
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
