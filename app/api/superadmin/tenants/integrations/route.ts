import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/integrations
 *
 * Estado de integraciones por tienda (Brandon 2026-06-14): WhatsApp · Yape ·
 * Plin · SUNAT (facturación electrónica). Lee Settings (1:1 con tenant) para
 * detectar tiendas con setup incompleto (ej: no cobran, no facturan). Las que
 * más les falta van primero.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const [tenants, settings] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, slug: true, name: true } }),
      prisma.settings.findMany({
        select: {
          tenantId: true,
          yapeEnabled: true,
          plinEnabled: true,
          whatsappApiToken: true,
          sunatProvider: true,
          sunatApiKey: true,
        },
      }),
    ]);
    const sMap = new Map(settings.map((s) => [s.tenantId, s]));

    const rows = tenants.map((t) => {
      const s = sMap.get(t.id);
      const integrations = {
        whatsapp: !!s?.whatsappApiToken,
        yape: !!s?.yapeEnabled,
        plin: !!s?.plinEnabled,
        sunat: !!(s?.sunatProvider && s.sunatProvider !== "none" && s.sunatApiKey),
      };
      const active = Object.values(integrations).filter(Boolean).length;
      return { slug: t.slug, name: t.name, integrations, active, missing: 4 - active };
    });

    rows.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

    const summary = {
      total: rows.length,
      whatsapp: rows.filter((r) => r.integrations.whatsapp).length,
      yape: rows.filter((r) => r.integrations.yape).length,
      plin: rows.filter((r) => r.integrations.plin).length,
      sunat: rows.filter((r) => r.integrations.sunat).length,
    };
    return NextResponse.json({ rows, summary });
  } catch (e) {
    logger.error("[tenants/integrations] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
