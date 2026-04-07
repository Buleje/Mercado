export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { StoreBannersDB } from "@/lib/db/store-banners.db";
import { z } from "zod";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional(),
  position: z.number().int().min(0).optional(),
  section: z.enum(["hero", "featured", "promo"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

async function resolveStore(slug: string, tenantId: string) {
  return prisma.store.findFirst({ where: { slug, tenantId } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenantId = req.headers.get("x-tenant-id") ?? "main";
  const section = req.nextUrl.searchParams.get("section") ?? undefined;

  const store = await resolveStore(slug, tenantId);
  if (!store) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const banners = await StoreBannersDB.list(tenantId, store.id, section);
  return NextResponse.json({ banners });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;

  const store = await resolveStore(slug, auth.tenantId);
  if (!store) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const banner = await StoreBannersDB.create(auth.tenantId, {
    storeId: store.id,
    ...parsed.data,
  });

  return NextResponse.json({ banner }, { status: 201 });
}
