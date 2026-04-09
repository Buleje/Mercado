import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { StoreBannersDB } from "@/lib/db/store-banners.db";
import { z } from "zod";

const PutSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(300).optional(),
  imageUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  position: z.number().int().min(0).optional(),
  section: z.enum(["hero", "featured", "promo"]).optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bannerId: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { bannerId } = await params;

  const body = await req.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const banner = await StoreBannersDB.update(auth.tenantId, bannerId, parsed.data);
  if (!banner) {
    return NextResponse.json({ error: "Banner no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ banner });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bannerId: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { bannerId } = await params;

  await StoreBannersDB.delete(auth.tenantId, bannerId);

  return NextResponse.json({ ok: true });
}
