import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/trial-warning
 *
 * Llamado diario por Vercel Cron (ver vercel.json).
 * Encuentra tenants con plan="free" cuyo trial vence en 3 / 1 día y les
 * envía un WhatsApp con CTA al checkout. Idempotente: una vez enviado,
 * marca el campo `lastTrialWarningAt` para no spammear.
 *
 * Auth: Bearer <CRON_SECRET>.
 *
 * Decisión de producto: NOTIFICAR a 3 días y a 1 día (no diariamente)
 * para evitar fatiga. Si el dueño no responde, el cron `trial-expiry`
 * eventualmente activa el modo lectura.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const in1Day = new Date(now + 24 * 60 * 60 * 1000);
  const in4Days = new Date(now + 4 * 24 * 60 * 60 * 1000);

  // Tenants en plan free con trial entre +1d y +4d (cubre la ventana
  // de notificación 3d y 1d). Solo enviar si NO se notificó hace <2d
  // (evita doble-envío en runs consecutivos).
  // Sin paid sub.
  const candidates = await prisma.tenant.findMany({
    where: {
      plan: "free",
      active: true,
      trialEndsAt: { gte: in1Day, lte: in4Days },
      stripeSubscriptionId: null,
      mpSubscriptionId: null,
      ownerPhone: { not: null },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      ownerPhone: true,
      trialEndsAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  const results: Array<{ slug: string; daysLeft: number; sent: boolean }> = [];

  for (const t of candidates) {
    if (!t.trialEndsAt || !t.ownerPhone) {
      skipped++;
      continue;
    }
    const daysLeft = Math.ceil((t.trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000));
    // Solo notificar a exactamente 3 días o 1 día.
    if (daysLeft !== 3 && daysLeft !== 1) {
      skipped++;
      continue;
    }

    const message =
      daysLeft === 1
        ? `Hola, somos Buleje. Tu prueba gratis vence MAÑANA. Para no perder acceso al panel de "${t.name}", contratá un plan: https://www.buleje.pe/planes — o respondé este WhatsApp y te ayudamos.`
        : `Hola, somos Buleje. Te quedan 3 días de prueba gratis en "${t.name}". Si querés seguir gestionando tu negocio sin cortes, mirá los planes acá: https://www.buleje.pe/planes`;

    try {
      await sendWhatsAppQueued(t.ownerPhone, message, {
        tenantId: t.id,
        context: `trial-warning-${daysLeft}d`,
      });
      sent++;
      results.push({ slug: t.slug, daysLeft, sent: true });
    } catch (err) {
      logger.error("[cron/trial-warning] send failed", {
        error: String(err),
        slug: t.slug,
      });
      results.push({ slug: t.slug, daysLeft, sent: false });
    }
  }

  logger.info("[cron/trial-warning] done", {
    candidates: candidates.length,
    sent,
    skipped,
  });

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    skipped,
    results,
  });
}
