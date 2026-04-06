import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToPhone } from "@/lib/push-sender";

export const dynamic = "force-dynamic";

async function checkAndCreateBirthdayCoupons() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();

  // Find customers whose birthday month/day matches today
  const allCustomers = await prisma.customer.findMany({
    where: { birthday: { not: null } },
    select: { phone: true, name: true, birthday: true, notifPromotions: true, tenantId: true },
  });

  const birthdayCustomers = allCustomers.filter((c) => {
    if (!c.birthday) return false;
    const bd = new Date(c.birthday);
    return bd.getMonth() + 1 === month && bd.getDate() === day;
  });

  let created = 0;

  for (const customer of birthdayCustomers) {
    const code = `CUMPLE-${customer.phone.slice(-4)}-${year}`;

    // Skip if coupon already exists for this customer this year
    const existing = await prisma.coupon.findFirst({ where: { code } });
    if (existing) continue;

    // Create 10% birthday discount coupon, valid for 7 days
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.coupon.create({
      data: {
        code,
        description: `🎂 Feliz cumpleaños ${customer.name}! 10% de descuento`,
        discountType: "percent",
        discountValue: 10,
        maxUses: 1,
        active: true,
        expiresAt,
        tenantId: customer.tenantId,
      },
    });

    // Send push notification (if customer opted in to promotions)
    if (customer.notifPromotions !== false) {
      sendPushToPhone(customer.phone, {
        title: "🎂 ¡Feliz cumpleaños!",
        body: `${customer.name}, tienes un cupón de 10% con código ${code}. ¡Válido por 7 días!`,
        url: "/cuenta",
      }).catch(() => {});
    }

    created++;
  }

  return { checked: birthdayCustomers.length, created };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkAndCreateBirthdayCoupons();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkAndCreateBirthdayCoupons();
  return NextResponse.json({ ok: true, ...result });
}
