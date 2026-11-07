import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { estadoCarpetaPersonas } from "@/lib/camaras/personas-drive.server";

/**
 * GET /api/admin/camaras/personas — `{ ok, carpetaId | null, hoy }`: el enlace
 * «Ver carpeta» y el contador de fotos de hoy (Lima) por cámara. Solo lee:
 * no crea la carpeta si todavía no existe. Mismos roles que el video en vivo.
 */
export const GET = withApiHandler("camaras-personas-estado", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "camaras-personas");
  if (rl) return rl;

  const camaras = await CamarasDB.list(auth.tenantId);
  const estado = await estadoCarpetaPersonas(
    auth.tenantId,
    auth.role,
    camaras.map((c) => ({ id: c.id, nombre: c.nombre })),
  );
  return NextResponse.json({ ok: true, ...estado });
});
