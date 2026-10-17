/**
 * GET /api/admin/comprobantes/expediente?ref=<id o código> — Expediente de la
 * operación (N03): un pedido o una venta con su comprobante, notas, guías,
 * cotización de origen, cobros, línea de tiempo y «qué falta para cerrar».
 *
 * `ref` = el id de cualquiera de sus papeles o lo que se escribe («#a1b2c3»,
 * «B001-12», «NC-0003»). Sólo lectura y siempre dentro del negocio de la
 * sesión: un enlace de otro negocio responde 404, no sus datos.
 * → `{ expediente }` · 404 `no-encontrado` · 409 `ambiguo` (el código corto
 * coincide con más de una operación).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { ComprobantesExpedienteDB } from "@/lib/db/comprobantes-expediente.db";

const ROLES = ["admin"] as const;
const RefSchema = z.string().trim().min(2).max(80);

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comprobantes-expediente");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const ref = RefSchema.safeParse(req.nextUrl.searchParams.get("ref") ?? "");
  if (!ref.success) return NextResponse.json({ error: "Escribe el código del pedido o del documento" }, { status: 400 });
  try {
    const r = await ComprobantesExpedienteDB.armar(auth.tenantId, ref.data);
    if (!r.ok) {
      return r.motivo === "ambiguo"
        ? NextResponse.json({ error: "Ese código coincide con más de una operación: escribe más letras.", motivo: r.motivo }, { status: 409 })
        : NextResponse.json({ error: "No hay ninguna operación ni documento con ese código en tu negocio.", motivo: r.motivo }, { status: 404 });
    }
    return NextResponse.json({ expediente: r.expediente });
  } catch (e) {
    logger.error("[comprobantes] expediente GET", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar el expediente" }, { status: 503 });
  }
}
