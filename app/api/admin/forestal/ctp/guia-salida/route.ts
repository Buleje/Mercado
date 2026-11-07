import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestCtpGuiaSalidaDB } from "@/lib/db/forest-ctp-guia-salida.db";
import type { RespuestaGuiaSalida } from "@/lib/forestal/guia-salida-imprimible";

/**
 * GET /api/admin/forestal/ctp/guia-salida?despacho=<id> → `RespuestaGuiaSalida`
 *
 * La GTF de salida de un despacho del Libro CTP, ENTERA (todas las líneas con
 * su N°), lista para los papeles del menú ⋯ de la fila: hoja SERFOR, resumen,
 * talonario de la matricial y «con formato» (27-10). El servidor la arma con la
 * Ficha del CTP, el catálogo de especies y los permisos cargados, y devuelve
 * también las `entradas` del talonario, así la pantalla no recalcula nada.
 *
 * 404 si el despacho no es de este negocio · 409 `SIN_GUIA` si todavía no tiene
 * N° (borrador). Una anulada vuelve igual (`guia.anulada`): se imprime con su
 * sello. Sólo lectura.
 */

const querySchema = z.object({ despacho: z.string().trim().min(1).max(64) });

export const GET = withApiHandler("forestal-ctp-guia-salida", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  const q = querySchema.safeParse({ despacho: req.nextUrl.searchParams.get("despacho") ?? undefined });
  if (!q.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Indica el despacho (?despacho=<id>).", issues: q.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    const r = await ForestCtpGuiaSalidaDB.guiaSalidaDeDespacho(auth.tenantId, q.data.despacho);
    if (!r.ok && r.error === "NO_EXISTE") {
      return NextResponse.json({ error: "not_found", message: "No encontramos ese despacho." }, { status: 404 });
    }
    if (!r.ok) {
      return NextResponse.json({ error: "SIN_GUIA", message: "Emite la guía primero: botón Guía de la fila." }, { status: 409 });
    }
    const body: RespuestaGuiaSalida = { guia: r.guia, entradas: r.entradas };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[ctp.guia-salida.GET] falló", { error: String(err), tenantId: auth.tenantId, despacho: q.data.despacho });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
