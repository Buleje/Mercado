import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { analizarAdelantos } from "@/lib/adelantos/analisis";
import { logger } from "@/lib/logger";

/** Tope de `AdelantosDB.list`: si se llega, el análisis lo dice en vez de callarlo. */
const TOPE_LISTA = 500;

/**
 * GET /api/adelantos/analisis — lo que dibuja la pestaña Análisis, ya sumado
 * (totales en el servidor, CLAUDE.md §4.6). Propio de esa pestaña: la lista
 * `/api/adelantos` la comparten todas y no se toca. Mismos permisos que la
 * lista (`permisoAdelantos` «read»).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    const adelantos = await AdelantosDB.list(auth.tenantId, { direccion: "todas" });
    return NextResponse.json(
      { ...analizarAdelantos(adelantos), truncado: adelantos.length >= TOPE_LISTA },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    logger.error("[adelantos/analisis] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
