import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CotizacionesDB } from "@/lib/db/cotizaciones.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { SunatDB } from "@/lib/db/sunat.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { igvRateFromSettings } from "@/lib/tax";
import { htmlDeCotizacion, type EmpresaEmisor } from "@/lib/documentos/cotizacion-print";

/**
 * GET /api/admin/ia/papeles/cotizacion/[id] — la hoja de una cotización (la
 * misma del módulo Cotizaciones, `htmlDeCotizacion`) para el enlace que
 * devuelve `papeles_cotizacion` en el chat (ADR-528). Se abre en pestaña nueva
 * y se imprime / guarda en PDF desde el navegador.
 *
 * Ownership por tenantId en el WHERE: una cotización de otro negocio = 404.
 * Sin CSP en `/api/*` (security-headers), así que el botón «Imprimir» de la
 * hoja funciona igual que en la ventana del módulo.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = applyRateLimit(req, "GENEROUS", "ia:papeles:cotizacion");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || id.length > 100) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  try {
    const cot = await CotizacionesDB.getById(id, auth.tenantId);
    if (!cot) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const [config, membrete, ajustes] = await Promise.all([
      SunatDB.getConfig(auth.tenantId).catch((err) => {
        logger.warn("[ia/papeles] sin datos SUNAT del emisor", { error: String(err) });
        return null;
      }),
      MembreteDB.del(auth.tenantId).catch((err) => {
        logger.warn("[ia/papeles] sin membrete", { error: String(err) });
        return null;
      }),
      SettingsDB.get(auth.tenantId).catch((err) => {
        logger.warn("[ia/papeles] sin ajustes: IGV por defecto", { error: String(err) });
        return null;
      }),
    ]);
    const empresa: EmpresaEmisor | null = config?.ruc
      ? { razonSocial: config.razonSocial, ruc: config.ruc, direccionFiscal: config.direccionFiscal ?? null }
      : null;

    const html = htmlDeCotizacion(
      { ...cot, tasaIgv: igvRateFromSettings(ajustes?.taxRate) },
      empresa,
      membrete,
    );
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    logger.error("[ia/papeles] hoja de cotización falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
