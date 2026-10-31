import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { MembreteDB } from "@/lib/db/membrete.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/admin/forestal/loth/caratula/propuesta — lo que el sistema ya sabe
 * para prellenar la carátula: los datos del negocio (membrete + razón social,
 * RUC y correo de Ajustes) y el plan de manejo activo (título, resolución,
 * documento de gestión). Sólo lectura; cada lado es best-effort: si uno falla,
 * el otro igual se propone.
 */
export const GET = withApiHandler("forestal-loth-caratula-propuesta", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const [membrete, settings, plan] = await Promise.all([
    MembreteDB.del(auth.tenantId).catch((err) => {
      logger.warn("[loth.caratula.propuesta] membrete no leído", { tenantId: auth.tenantId, error: String(err) });
      return null;
    }),
    SettingsDB.get(auth.tenantId).catch((err) => {
      logger.warn("[loth.caratula.propuesta] ajustes no leídos", { tenantId: auth.tenantId, error: String(err) });
      return null;
    }),
    ForestPlanDB.getActivePlan(auth.tenantId).catch((err) => {
      logger.warn("[loth.caratula.propuesta] plan no leído", { tenantId: auth.tenantId, error: String(err) });
      return null;
    }),
  ]);

  const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return NextResponse.json(
    {
      negocio: {
        nombre: membrete?.nombre ?? null,
        razonSocial: txt(settings?.razonSocial),
        ruc: txt(settings?.ruc) ?? txt(settings?.sunatRuc),
        email: txt(settings?.businessEmail),
        telefono: membrete?.telefono ?? null,
        direccion: membrete?.direccion ?? null,
      },
      plan: plan
        ? {
            planType: plan.planType,
            planNumber: plan.planNumber,
            tituloHabilitante: plan.tituloHabilitante,
            resolucionNumber: plan.resolucionNumber,
            resolucionDate: plan.resolucionDate ? plan.resolucionDate.toISOString() : null,
            titularName: plan.titularName,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
