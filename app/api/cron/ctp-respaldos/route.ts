import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";
import { ForestCtpRespaldoDB } from "@/lib/db/forest-ctp-respaldo.db";

/**
 * GET /api/cron/ctp-respaldos — el respaldo de la noche del Libro CTP (ADR-530).
 *
 * Recorre SOLO los negocios con algo en el libro (tráfico de Supabase). Por
 * cada uno guarda una foto si el libro cambió desde el último respaldo (misma
 * huella → no guarda) y poda: 30 diarios · «antes de» 90 días con mínimo 10 ·
 * los manuales nunca. Un negocio que falla no frena a los demás.
 *
 * vercel.json `0 2 * * *` (21:00 de Lima) + disparador local de la PC.
 * Autorización: `Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const resultado = await withCronRetry(
      "ctp-respaldos",
      async () => {
        const tenants = await ForestCtpRespaldoDB.tenantsConLibro();
        let guardados = 0;
        let podados = 0;
        const fallidos: string[] = [];
        /* En fila, no en paralelo: cada foto lee el libro entero de un negocio. */
        for (const tenantId of tenants) {
          const r = await ForestCtpRespaldoDB.diario(tenantId);
          if (r.guardado) guardados++;
          podados += r.podados;
          if (r.error) fallidos.push(tenantId);
        }
        return { negocios: tenants.length, guardados, podados, fallidos };
      },
      { maxRetries: 1 },
    );
    logger.info("[cron/ctp-respaldos] respaldos de la noche", resultado);
    return NextResponse.json({ ok: resultado.fallidos.length === 0, ...resultado });
  } catch (err) {
    logger.error("[cron/ctp-respaldos] falló", { error: String(err) });
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}
