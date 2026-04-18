import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/socio/renew-cycles
 *
 * Cron diario — ADR-078 programa Socio Buleje.
 *
 * Encuentra memberships activas cuyo `currentPeriodEnd` vence en < 24h y
 * genera el próximo `SocioBillingCycle` (idempotente via DB class). No cobra;
 * solo encola ciclos `pending` que el sistema de pagos despachará aparte.
 *
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("socio-renew-cycles", async () => {
      const now = new Date();
      const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Buscar candidatos en TODOS los tenants. Multi-tenant: cada uno tiene su bucket.
      type Candidate = { id: string; tenantId: string };
      const candidates = (await (prisma as unknown as {
        socioMembership: {
          findMany(args: {
            where: Record<string, unknown>;
            select: { id: true; tenantId: true };
          }): Promise<Candidate[]>;
        };
      }).socioMembership.findMany({
        where: {
          currentPeriodEnd: { lte: threshold },
          cancelAtPeriodEnd: false,
          autoRenew: true,
          status: { in: ["active", "trial", "past_due"] },
        },
        select: { id: true, tenantId: true },
      })) as Candidate[];

      if (candidates.length === 0) {
        return { ok: true, processed: 0, renewed: 0, skipped: 0 };
      }

      let renewed = 0;
      let skipped = 0;
      const errors: Array<{ membershipId: string; error: string }> = [];

      for (const c of candidates) {
        try {
          const cycle = await SocioBulejeDB.renewCycleIfDue(c.tenantId, c.id);
          if (cycle) renewed += 1;
          else skipped += 1;
        } catch (err) {
          errors.push({
            membershipId: c.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info("[cron/socio-renew-cycles] done", {
        processed: candidates.length,
        renewed,
        skipped,
        errors: errors.length,
      });

      return {
        ok: errors.length === 0,
        processed: candidates.length,
        renewed,
        skipped,
        errors,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
