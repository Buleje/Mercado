export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  color: z.string().max(50).default("bg-blue-500"),
  deliveryFee: z.number().min(0).default(3),
  estimatedMin: z.number().min(0).default(30),
  neighborhoods: z.array(z.string()).default([]),
});

const DEFAULT_ZONES = [
  { id: "z-1", name: "Zona Centro", color: "bg-blue-500", deliveryFee: 3, estimatedMin: 20, neighborhoods: ["Jr. Progreso", "Jr. Inmaculada", "Jr. Ucayali", "Av. Centenario"] },
  { id: "z-2", name: "Zona Norte", color: "bg-green-500", deliveryFee: 4, estimatedMin: 30, neighborhoods: ["Manantay", "San Fernando", "9 de Octubre"] },
  { id: "z-3", name: "Zona Sur", color: "bg-amber-500", deliveryFee: 5, estimatedMin: 35, neighborhoods: ["Yarinacocha", "Puerto Callao", "San José"] },
  { id: "z-4", name: "Zona Este", color: "bg-red-500", deliveryFee: 5, estimatedMin: 40, neighborhoods: ["Campo Verde", "Nueva Requena"] },
];

// GET /api/admin/delivery-zones
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const settings = await prisma.settings.findFirst({ where: { tenantId: auth.tenantId }, select: { deliveryZone: true } });

  if (settings?.deliveryZone) {
    try {
      const zones = JSON.parse(settings.deliveryZone);
      return NextResponse.json(zones);
    } catch {
      // Corrupted JSON — return defaults
    }
  }

  return NextResponse.json(DEFAULT_ZONES);
}

// POST /api/admin/delivery-zones — save all zones
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = z.array(ZoneSchema).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    await prisma.settings.upsert({
      where: { tenantId: auth.tenantId },
      update: { deliveryZone: JSON.stringify(parsed.data) },
      create: { tenantId: auth.tenantId, deliveryZone: JSON.stringify(parsed.data) },
    });

    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
