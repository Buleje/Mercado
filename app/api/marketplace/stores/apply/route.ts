import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const RegisterSchema = z.object({
  ownerName:    z.string().min(2, "Nombre muy corto").max(80),
  ownerPhone:   z.string().min(6, "Teléfono muy corto").max(20),
  ownerEmail:   z.string().email("Email inválido").optional(),
  storeName:    z.string().min(2, "Nombre de tienda muy corto").max(80),
  description:  z.string().max(500).optional(),
  category:     z.string().max(50).optional(),
  zone:         z.string().max(80).optional(),
  address:      z.string().max(200).optional(),
});

/**
 * POST /api/marketplace/stores/apply
 *
 * Endpoint PÚBLICO para que un dueño de bodega solicite registrarse
 * en el marketplace. Crea una solicitud pendiente que el superadmin aprueba.
 * NO requiere auth — es el punto de entrada para nuevos vendedores.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();

  // Rate limit: max 5 applications per IP per hour
  const rl = await applyRateLimit(req, "STRICT", "marketplace-apply");
  if (rl) return rl;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { ownerName, ownerPhone, ownerEmail: _ownerEmail, storeName, description, category, zone, address: _address } = parsed.data;

    // Check duplicate by phone
    const existingStores = await prisma.store.findMany({
      where: { zone: { not: null } },
      select: { id: true, slug: true, tenantId: true },
    });
    // Check if this phone already has a store (search by tenantId pattern)
    const existingByPhone = existingStores.find(
      (s) => s.tenantId === `store-${ownerPhone.replace(/\D/g, "")}`
    );
    if (existingByPhone) {
      return NextResponse.json(
        { error: "Ya tienes una solicitud registrada con ese teléfono", storeSlug: existingByPhone.slug },
        { status: 409 }
      );
    }

    // Create store via DB class (unpublished, pending approval)
    const store = await MarketplaceStoresDB.register({
      tenantId: `store-${ownerPhone.replace(/\D/g, "")}`,
      name: storeName,
      description,
      category,
      zone,
    });

    // Notify platform admin (fire-and-forget)
    const adminPhone = process.env.NOTIFY_PHONE;
    if (adminPhone) {
      const msg = [
        `🏪 *Nueva solicitud de tienda en Marketplace*`,
        `━━━━━━━━━━━━━━━━━━━`,
        ``,
        `📛 Tienda: *${storeName}*`,
        `👤 Dueño: ${ownerName}`,
        `📱 Teléfono: ${ownerPhone}`,
        category ? `📂 Categoría: ${category}` : "",
        zone ? `📍 Zona: ${zone}` : "",
        ``,
        `Estado: ⏳ Pendiente de aprobación`,
        ``,
        `Entra al admin → Marketplace → para aprobarla.`,
        ``,
        `─────`,
        `Buleje 🏪`,
      ].filter(Boolean).join("\n");
      sendWhatsAppText(adminPhone, msg).catch(() => {});
    }

    // Confirmation to store owner
    sendWhatsAppText(ownerPhone, [
      `🎉 *¡Recibimos tu solicitud!*`,
      ``,
      `Hola ${ownerName} 👋`,
      `Tu tienda *${storeName}* está siendo revisada.`,
      `Te avisaremos por este número cuando esté lista.`,
      ``,
      `Mientras, puedes ir preparando tus productos 📦`,
      ``,
      `─────`,
      `Marketplace Buleje 🏪`,
    ].join("\n")).catch(() => {});

    logActivity(
      "Solicitud",
      "marketplace_store",
      `Nueva solicitud: ${storeName} (${ownerName}, ${ownerPhone})`,
      store.id,
      "público"
    ).catch(() => {});

    return NextResponse.json(
      {
        data: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          status: "pendiente",
          message: "Tu solicitud fue recibida. Te avisaremos cuando esté aprobada.",
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
