import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";

const Schema = z.object({
  phones: z.array(z.string().min(1)).min(1).max(5000),
  title: z.string().max(200),
  message: z.string().max(1000),
  promoId: z.string().optional(),
});

/**
 * POST /api/campaigns/notify — Batch-create in-app notifications for selected customers.
 * Used when sending bulk WhatsApp campaigns to also create bell notifications.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "campaigns-notify"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { phones, title, message, promoId } = parsed.data;

  // Batch create notifications (skip phones that don't exist as customers)
  const existing = await prisma.customer.findMany({
    where: { phone: { in: phones } },
    select: { phone: true, notifPromotions: true },
  });
  const opted = existing.filter(c => c.notifPromotions !== false);

  if (opted.length > 0) {
    await prisma.customerNotification.createMany({
      data: opted.map(c => ({
        customerPhone: c.phone,
        title: `🎉 ${title}`,
        body: message,
        type: "promotion",
        read: false,
        tenantId: auth.tenantId,
      })),
    });
  }

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("campaign_sent", "promotion", promoId ?? "bulk", `Campaña "${title}" enviada a ${opted.length} clientes`, "admin", requestId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  return NextResponse.json({ sent: opted.length, skipped: phones.length - opted.length });
}
