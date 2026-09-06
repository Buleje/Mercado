import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { MAX_MUESTRAS } from "@/lib/forestal/loth-elevacion";

/**
 * /api/admin/forestal/loth/elevacion — altitud de una traza para el perfil de
 * terreno del mapa (¿por dónde se saca la madera?).
 *
 * Proxy de Open-Meteo Elevation (modelo digital de terreno global, sin API key).
 * Va por el server por lo mismo que Wayback: `connect-src` de la CSP no incluye
 * el dominio y abrirlo para todo el sitio por una herramienta de un tab no se
 * paga. Si el servicio no responde, se devuelve una lista vacía y la herramienta
 * lo dice — nunca una elevación inventada.
 */

const bodySchema = z.object({
  puntos: z
    .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
    .min(2)
    .max(MAX_MUESTRAS),
});

const OPEN_METEO = "https://api.open-meteo.com/v1/elevation";

export const POST = withApiHandler("forestal-loth-elevacion", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro");
  if (!enabled) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const lat = parsed.data.puntos.map((p) => p[0].toFixed(6)).join(",");
  const lng = parsed.data.puntos.map((p) => p[1].toFixed(6)).join(",");

  try {
    const res = await fetch(`${OPEN_METEO}?latitude=${lat}&longitude=${lng}`, {
      // El relieve no cambia: se cachea una semana por traza consultada.
      next: { revalidate: 604_800 },
    });
    if (!res.ok) {
      logger.warn("[loth.elevacion] servicio no disponible", { status: res.status, tenantId: auth.tenantId });
      return NextResponse.json({ elevaciones: [] });
    }
    const data = (await res.json()) as { elevation?: number[] };
    const elevaciones = Array.isArray(data.elevation) ? data.elevation.filter((n) => Number.isFinite(n)) : [];
    return NextResponse.json({ elevaciones, fuente: "Open-Meteo · modelo digital de terreno" });
  } catch (err) {
    logger.warn("[loth.elevacion] fetch falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ elevaciones: [] });
  }
});
