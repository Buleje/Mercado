import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { paginaPropiaDelNegocio } from "@/lib/extensiones/elegir-pagina";

/**
 * ADR-511 · ¿El negocio de la sesión tiene página propia PRENDIDA? La pide
 * «Formato de tu tienda» (Apariencia › Identidad): con propia, el formato
 * elegido no se ve hasta apagarla y el editor lo avisa.
 *
 * Misma regla que la tienda (`elegir-pagina.ts` → `TenantPieza`), con el
 * `tenantId` de la sesión — nunca de un header ni de la URL. Sólo dueño
 * (mismo rol que guarda el formato en `PUT /api/settings`).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const paginaPropia = await paginaPropiaDelNegocio(auth.tenantId);
  return NextResponse.json({ paginaPropia }, { headers: { "Cache-Control": "private, no-store" } });
}
