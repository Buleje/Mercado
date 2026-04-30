import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/trial-expiry
 *
 * Called nightly by Vercel Cron (see vercel.json).
 * Finds free-plan tenants whose trial has expired and suspends them.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("trial-expiry", async () => {
      const now = new Date();

      // ADR-084: NO desactivamos al tenant (active=false bloquearía el panel).
      // En su lugar, la lógica de read-only vive en `lib/billing/trial-status.ts`
      // y se aplica via:
      //   - `requireActiveSubscription()` en endpoints write (POST/PATCH/PUT/DELETE)
      //   - filtro en `lib/db/marketplace.db.ts` (oculta del marketplace)
      //   - guard en storefront público (redirect a "tienda no disponible")
      // El tenant sigue accesible en /admin para hacer upgrade del plan.
      //
      // Este cron ahora SOLO loggea y notifica — no muta `active`.
      const expired = await prisma.tenant.findMany({
        where: {
          active: true,
          plan: "free",
          stripeSubscriptionId: null,
          mpSubscriptionId: null,
          trialEndsAt: { lt: now },
        },
        select: { id: true, slug: true, trialEndsAt: true, ownerEmail: true, ownerPhone: true },
      });

      if (expired.length === 0) {
        return { ok: true, expired: 0, message: "No expired trials found" };
      }

      // Log de quien quedó en modo read-only (visibilidad operativa).
      logger.info("[cron/trial-expiry] Tenants en modo read-only post-trial", {
        count: expired.length,
        slugs: expired.map((t) => t.slug),
      });

      // Persistir un activity log por cada tenant expirado para auditoría.
      await Promise.all(
        expired.map((t) =>
          prisma.activityLog
            .create({
              data: {
                action: "trial_expired_readonly",
                entity: "tenant",
                entityId: t.slug,
                detail: `Trial expirado el ${t.trialEndsAt?.toISOString()} — tenant en modo read-only hasta activar plan`,
                user: "cron-trial-expiry",
                tenantId: t.slug,
              },
            })
            .catch((err) => logger.warn("[cron/trial-expiry] activityLog failed", { slug: t.slug, err: String(err) })),
        ),
      );

      return {
        ok: true,
        expired: expired.length,
        readOnly: true,
        slugs: expired.map((t) => t.slug),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
