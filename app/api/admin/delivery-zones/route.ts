import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdminDeliveryZonesDB } from "@/lib/db/admin-delivery-zones.db";

const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  color: z.string().max(50).default("bg-[var(--data-success-500)]"),
  deliveryFee: z.number().min(0).default(3),
  estimatedMin: z.number().min(0).default(30),
  neighborhoods: z.array(z.string()).default([]),
});

// GET /api/admin/delivery-zones
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const zones = await AdminDeliveryZonesDB.getZones(auth.tenantId);
  return NextResponse.json(zones);
}

// POST /api/admin/delivery-zones — save all zones
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
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

    const zones = await AdminDeliveryZonesDB.saveZones(auth.tenantId, parsed.data);
    return NextResponse.json(zones);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
