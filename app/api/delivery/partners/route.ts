import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { DeliveryPartnersDB } from "@/lib/db/delivery-partners.db";
import { logger } from "@/lib/logger";
import {
  PartnerAltaSchema,
  camposConError,
  mensajeTelefonoRepetido,
} from "@/lib/delivery/partner-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active");

    // SECURITY 2026-05-06 (audit team): scope tenantId. Antes findMany sin
    // tenantId leakeaba teléfonos PE de partners de TODOS los tenants
    // (Ley 29733 PE — protección de datos personales).
    // 17-10: además mandaba `passwordHash` (el de la app del repartidor) al
    // navegador del cajero; la clase lo omite.
    const partners = await DeliveryPartnersDB.listForAdmin(auth.tenantId, {
      zone: searchParams.get("zone"),
      active: active === null ? undefined : active === "true",
      search: searchParams.get("search"),
    });

    return NextResponse.json(partners);
  } catch (err) {
    logger.error("[delivery/partners] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = PartnerAltaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Revisa los campos marcados.",
          campos: camposConError(parsed.error.issues),
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const { name, phone, email, zone, vehicleType, fee, isActive } = parsed.data;

    // La misma persona dada de alta dos veces recibe ofertas dobles y parte su historial.
    const repetido = await DeliveryPartnersDB.findByPhone(auth.tenantId, phone);
    if (repetido) {
      const msg = mensajeTelefonoRepetido(repetido);
      return NextResponse.json({ error: msg, campos: { phone: msg } }, { status: 409 });
    }

    const partner = await DeliveryPartnersDB.createForAdmin(auth.tenantId, {
      name,
      phone,
      zone,
      ...(email ? { email } : {}),
      ...(vehicleType ? { vehicleType } : {}),
      ...(fee !== undefined ? { fee } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });

    logActivity(
      "Crear",
      "deliveryPartner",
      `Partner creado: ${partner.name} (${partner.zone})`,
      partner.id,
      auth.username,
    ).catch((err) => logger.error("[delivery/partners] activity log failed", { error: String(err) }));

    return NextResponse.json(partner, { status: 201 });
  } catch (err) {
    logger.error("[delivery/partners] POST failed", { error: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
