export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cart/[phone] — Retrieve saved cart for a customer
 * PUT /api/cart/[phone] — Save/update cart for a customer
 * DELETE /api/cart/[phone] — Clear saved cart
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 6) {
    return NextResponse.json({ items: [] });
  }

  const saved = await prisma.savedCart.findUnique({
    where: { customerPhone: clean },
  });

  if (!saved) return NextResponse.json({ items: [] });

  try {
    const items = JSON.parse(saved.itemsJson);
    return NextResponse.json({ items, updatedAt: saved.updatedAt });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 6) {
    return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
  }

  const body = await req.json();
  const items = body.items;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Invalid items" }, { status: 400 });
  }

  // If empty cart, delete the saved cart
  if (items.length === 0) {
    await prisma.savedCart.deleteMany({ where: { customerPhone: clean } });
    return NextResponse.json({ ok: true });
  }

  await prisma.savedCart.upsert({
    where: { customerPhone: clean },
    update: { itemsJson: JSON.stringify(items) },
    create: { customerPhone: clean, itemsJson: JSON.stringify(items) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;
  const clean = phone.replace(/\D/g, "");
  await prisma.savedCart.deleteMany({ where: { customerPhone: clean } });
  return NextResponse.json({ ok: true });
}
