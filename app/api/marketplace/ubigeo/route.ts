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
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dep = searchParams.get("dep");
  const prov = searchParams.get("prov");

  if (!dep) {
    return NextResponse.json({ items: listDepartamentos() });
  }
  if (!prov) {
    return NextResponse.json({ items: listProvincias(dep) });
  }
  return NextResponse.json({ items: listDistritos(dep, prov) });
}
