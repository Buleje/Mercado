import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { responderSnapshot } from "@/lib/camaras/servir-snapshot.server";

/**
 * GET /api/admin/camaras/[id]/snapshot — la foto de AHORA de una cámara.
 *
 * La lógica (credenciales, ISAPI, anotar la falla sólo cuando cambia, tipos de
 * imagen permitidos, `no-store`) vive en `lib/camaras/servir-snapshot.server.ts`,
 * compartida con el espejo del Modo TV (ADR-473); acá sólo la sesión y el cupo.
 */
export const GET = withApiHandler(
  "camaras-snapshot",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;
    /* Generoso a propósito: la pantalla pide una foto cada dos segundos y con
       el tope normal la vista en vivo se cortaría al minuto. */
    const rl = await applyRateLimit(req, "GENEROUS", "camaras-snapshot");
    if (rl) return rl;

    const { id } = await ctx.params;
    return responderSnapshot(auth.tenantId, id, auth.username ?? "unknown");
  },
);
