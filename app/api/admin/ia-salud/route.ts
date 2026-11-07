import "server-only";

/**
 * app/api/admin/ia-salud/route.ts
 *
 * El diagnóstico de la capa de IA, para el panel.
 *
 *   GET               → estado cacheado (5 min)
 *   GET ?refrescar=1  → vuelve a preguntarle al proveedor
 *
 * Requiere admin: el detalle nombra modelos y huecos de configuración, que es
 * reconocimiento gratis para alguien de afuera. No es `/api/agents/health`
 * —ése es público y sólo mira el registro en memoria— sino la pregunta que
 * aquél no hace: ¿los modelos que decimos usar EXISTEN?
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { diagnosticarIA } from "@/lib/ai/diagnostico";

export async function GET(req: NextRequest) {
  // Refrescar sale una llamada al proveedor: se limita para que recargar la
  // pantalla en loop no queme cuota.
  const rl = await applyRateLimit(req, "MODERATE", "ia-salud");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const refrescar = req.nextUrl.searchParams.get("refrescar") === "1";
  return NextResponse.json(await diagnosticarIA({ refrescar }));
}
