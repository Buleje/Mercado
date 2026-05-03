import { NextResponse } from "next/server";

/**
 * GET /api/marketplace/dashboard
 *
 * Stub que retorna 204 No Content. El caller (MarketplaceDashboard.tsx)
 * tiene fallback silencioso a mock data — este endpoint solo elimina el
 * 404 ruidoso de console mientras no haya implementacion real. Reemplazar
 * por agregados live (KPIs, time series, top productos) cuando se priorice.
 */
export async function GET() {
  return new NextResponse(null, { status: 204 });
}
