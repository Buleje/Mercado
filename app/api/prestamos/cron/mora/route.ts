import { NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/prestamos/cron/mora — marca préstamos vencidos como VENCIDO.
 *
 * SECURITY 2026-05-06: migrado a `withCronAuth` (timing-safe + fail-closed).
 * BUGFIX 2026-05-06: antes leía tenantId del header con default "default" →
 * solo procesaba 1 tenant inexistente. Ahora itera TODOS los tenants activos.
 *
 * Cambio POST→GET: Vercel cron solo dispara GET.
 */
export const GET = withCronAuth("prestamos-mora", async () => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true },
    });

    const results: Array<{ tenantId: string; marked: number; error?: string }> = [];
    for (const t of tenants) {
      try {
        const marked = await PrestamosDB.marcarVencidos(t.id);
        results.push({ tenantId: t.id, marked });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[prestamos/cron/mora] tenant failed", { tenantId: t.id, error: msg });
        results.push({ tenantId: t.id, marked: 0, error: msg });
      }
    }

    const totalMarked = results.reduce((s, r) => s + r.marked, 0);
    logger.info("[prestamos/cron/mora] completed", {
      tenantsProcessed: tenants.length,
      totalMarked,
    });

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      totalMarked,
      results,
    });
  } catch (e) {
    logger.error("[prestamos/cron/mora] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
});
