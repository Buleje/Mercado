import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";

/**
 * GET /api/cron/reminders
 *
 * Called hourly by Vercel Cron (see vercel.json: "0 * * * *").
 * 1. Marks overdue pending reminders as "vencido" (across all tenants).
 * 2. Returns a summary of what was updated.
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
    const result = await withCronRetry("reminders", async () => {
      const now = new Date();

      const { count } = await prisma.reminder.updateMany({
        where: {
          status: "pendiente",
          dueDate: { lt: now },
        },
        data: { status: "vencido" },
      });

      console.log(`[cron/reminders] Marked ${count} reminder(s) as vencido at ${now.toISOString()}`);

      return { ok: true, markedVencido: count, processedAt: now.toISOString() };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
