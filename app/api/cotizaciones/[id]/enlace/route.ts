import { NextRequest, NextResponse } from "next/server";
import { CotizacionesDB } from "@/lib/db/cotizaciones.db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { generarTokenCotizacion, vidaDelEnlace } from "@/lib/cotizaciones/enlace-token";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/cotizaciones/[id]/enlace
 *
 * Firma el enlace PÚBLICO de solo ver de una cotización para mandárselo al
 * cliente (abre sin clave en /cotizacion/<token>). Vence a la vigencia + 7 días.
 * La cotización se busca con el `tenantId` de la sesión en el WHERE: la de otro
 * negocio da 404 igual que una que no existe. Noche 04-11, tramo 1.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const _rl = await applyRateLimit(req, "MODERATE", "cotizaciones-enlace");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!id || id.length > 100 || id.includes(".")) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  try {
    const cot = await CotizacionesDB.getById(id, auth.tenantId);
    if (!cot || cot.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    const ahora = Date.now();
    const vida = vidaDelEnlace(cot.validoHasta, ahora);
    const token = generarTokenCotizacion(auth.tenantId, cot.id, vida, ahora);
    if (!token) {
      logger.error("[cotizaciones] enlace público sin secreto de firma", { tenantId: auth.tenantId });
      return NextResponse.json(
        { error: "No se pudo crear el enlace: falta configurar la firma del servidor." },
        { status: 503 },
      );
    }

    const base = (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/+$/, "");
    const venceEl = new Date(ahora + vida).toISOString();

    logAudit({
      req,
      action: "EXPORT",
      entity: "Cotizacion",
      entityId: cot.id,
      detail: `Enlace público de la cotización ${cot.numero} (vence ${venceEl.slice(0, 10)})`,
      // Sin esto la fila caía en «__unknown__» (visto en la prueba real del 04-11).
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ url: `${base}/cotizacion/${token}`, venceEl });
  } catch (e) {
    logger.error("[cotizaciones] crear enlace público falló", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo crear el enlace. Prueba de nuevo." }, { status: 503 });
  }
}
