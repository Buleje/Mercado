export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";

// GET /api/customer-preferences?phone=XXX
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "cust-prefs");
  if (rl) return rl;

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { notifOrderUpdates: true, notifPromotions: true, notifRestock: true },
  });

  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(customer);
}

// PATCH /api/customer-preferences  body: { phone, notifOrderUpdates?, notifPromotions?, notifRestock? }
export async function PATCH(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "cust-prefs");
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const phone = normalizePhone(String(body.phone ?? ""));
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const data: Record<string, boolean> = {};
  if (typeof body.notifOrderUpdates === "boolean") data.notifOrderUpdates = body.notifOrderUpdates;
  if (typeof body.notifPromotions === "boolean") data.notifPromotions = body.notifPromotions;
  if (typeof body.notifRestock === "boolean") data.notifRestock = body.notifRestock;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  try {
    const updated = await prisma.customer.update({
      where: { phone },
      data,
      select: { notifOrderUpdates: true, notifPromotions: true, notifRestock: true },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
}
