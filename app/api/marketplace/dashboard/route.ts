import { NextResponse } from "next/server";

/**
 * GET /api/marketplace/dashboard
 *
 * Stub que retorna 200 con body vacío. El caller (MarketplaceDashboard.tsx)
 * tiene fallback silencioso a mock data — este endpoint solo elimina el
 * 404 ruidoso de console mientras no haya implementación real. Reemplazar
 * por agregados live (KPIs, time series, top productos) cuando se priorice.
 *
 * Round 14: cambio de 204 → 200 vacío. NextResponse + 204 + Next 16
 * prerender bailing failed con "Response constructor: Invalid response
 * status code 204" durante build. 200 con {} body es 100% válido y
 * cumple el mismo contrato (caller comprueba payload, no status).
 */
export async function GET() {
  return NextResponse.json({}, { status: 200 });
}
