import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/superadmin/stores
// Placeholder para Fase 4 — devuelve stores con info básica del tenant
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stores = await prisma.store.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      isPublished: true,
      rating: true,
      reviewCount: true,
      category: true,
      commission: true,
      createdAt: true,
      tenant: {
        select: { id: true, slug: true, name: true, plan: true, active: true },
      },
      _count: { select: { products: true } },
    },
  });

  return NextResponse.json({ stores });
}
