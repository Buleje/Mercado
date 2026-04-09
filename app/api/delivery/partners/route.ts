import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";

const PartnerPostSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(100),
  phone: z.string().regex(/^9\d{8}$/, "Teléfono peruano inválido (9XXXXXXXX)"),
  email: z.string().email("Email inválido").optional(),
  zone: z.string().min(1, "Zona requerida").max(100),
  vehicleType: z.string().max(50).optional(),
  fee: z.number().nonnegative("La tarifa debe ser >= 0").optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const zone = searchParams.get("zone");
    const active = searchParams.get("active");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (zone) where.zone = zone;
    if (active !== null) where.isActive = active === "true";
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    const partners = await prisma.deliveryPartner.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(partners);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = PartnerPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { name, phone, email, zone, vehicleType, fee } = parsed.data;

    const partner = await prisma.deliveryPartner.create({
      data: {
        name,
        phone,
        email,
        zone,
        tenantId: auth.tenantId,
        ...(vehicleType && { vehicleType }),
        ...(fee !== undefined && { fee }),
      },
    });

    logActivity(
      "Crear",
      "deliveryPartner",
      `Partner creado: ${partner.name} (${partner.zone})`,
      partner.id,
      auth.username
    ).catch(() => {});

    return NextResponse.json(partner, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
