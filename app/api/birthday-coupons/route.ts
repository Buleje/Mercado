import { NextResponse, type NextRequest } from "next/server";
import { BirthdayCouponsDB } from "@/lib/db/birthday-coupons.db";
import { sendPushToPhone } from "@/lib/push-sender";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

async function checkAndCreateBirthdayCoupons() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();

  // Audit project-wide 2026-05-19: migrado a BirthdayCouponsDB.
  // Cross-tenant intencional — cron de plataforma (ADR-082).
  const allCustomers = await BirthdayCouponsDB.listBirthdayCandidates();

  const birthdayCustomers = allCustomers.filter((c) => {
    if (!c.birthday) return false;
    const bd = new Date(c.birthday);
    return bd.getMonth() + 1 === month && bd.getDate() === day;
  });

  let created = 0;

  for (const customer of birthdayCustomers) {
    const code = `CUMPLE-${customer.phone.slice(-4)}-${year}`;

    // Skip si el coupon ya existe para este customer este año
    if (await BirthdayCouponsDB.couponExists(code)) continue;

    // Crear 10% birthday discount coupon, valido por 7 dias
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    await BirthdayCouponsDB.createBirthdayCoupon({
      tenantId: customer.tenantId,
      code,
      customerName: customer.name,
      expiresAt,
    });

    // Push notification si opted-in
    if (customer.notifPromotions !== false) {
      sendPushToPhone(customer.phone, {
        title: "🎂 ¡Feliz cumpleaños!",
        body: `${customer.name}, tienes un cupón de 10% con código ${code}. ¡Válido por 7 días!`,
        url: "/cuenta",
      }).catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });
    }

    created++;
  }

  return { checked: birthdayCustomers.length, created };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await checkAndCreateBirthdayCoupons();
    return NextResponse.json({ ok: true, ...result });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "birthday-coupons"); if (_rl) return _rl;
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await checkAndCreateBirthdayCoupons();
    return NextResponse.json({ ok: true, ...result });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
