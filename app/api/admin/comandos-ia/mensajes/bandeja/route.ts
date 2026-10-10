/**
 * GET /api/admin/comandos-ia/mensajes/bandeja — «Para escribir hoy» (Comandos IA).
 *
 * Sin IA y sin costo: fiados vencidos o por vencer (por status), clientes que
 * rompieron su ritmo de compra, adelantos abiertos con teléfono (solo con
 * libros forestales) y seguimientos que ya tocan. Solo lectura.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerBandeja } from "@/lib/admin/comandos-ia/bandeja-servidor";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "ci-msg-bandeja");
  if (rl) return rl;

  try {
    const bandeja = await leerBandeja(auth.tenantId);
    return NextResponse.json(bandeja, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[comandos-ia/bandeja] no se pudo armar", { err: String(err), tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "No pude leer tus fiados y clientes. Reintenta en un momento." }, { status: 500 });
  }
}
