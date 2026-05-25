import { NextRequest, NextResponse } from "next/server";
import {
  listDepartamentos,
  listProvincias,
  listDistritos,
} from "@/lib/peru-ubigeo";

/**
 * GET /api/marketplace/ubigeo
 *   → lista departamentos
 * GET /api/marketplace/ubigeo?dep=25
 *   → lista provincias del departamento
 * GET /api/marketplace/ubigeo?dep=25&prov=01
 *   → lista distritos de la provincia
 *
 * Pública. Datos INEI cargados en memoria — no toca DB.
 *
 * PERF 2026-05-25 (audit): datos inmutables → Cache-Control 1 día + immutable.
 * Elimina el waterfall de 3 fetches de ubigeo (dep→prov→dist) en checkout en visitas repetidas.
 */
// Cacheable en CDN/navegador 1 día — el ubigeo del INEI no cambia entre deploys.
const UBIGEO_CACHE = "public, max-age=86400, s-maxage=86400, immutable";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dep = searchParams.get("dep");
  const prov = searchParams.get("prov");

  const items = !dep
    ? listDepartamentos()
    : !prov
      ? listProvincias(dep)
      : listDistritos(dep, prov);

  return NextResponse.json({ items }, { headers: { "Cache-Control": UBIGEO_CACHE } });
}
