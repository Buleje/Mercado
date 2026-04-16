import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
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

    const { ownerName, ownerPhone, ownerEmail, storeName, description, category, zone, address: _address } = parsed.data;

    // Create Tenant REAL + Store via DB class en una transacción.
    // ADR-023: el tenantId ya NO es sintético — se crea un row real en Tenant
    // dentro del mismo $transaction, evitando stores huérfanos y data-leaks.
    // La dedup por ownerPhone vive en MarketplaceStoresDB.register().
    let store;
    try {
      store = await MarketplaceStoresDB.register({
        ownerName,
        ownerPhone,
        ownerEmail,
        storeName,
        description,
        category,
        zone,
      });
    } catch (dbErr) {
      const err = dbErr as Error & { code?: string; storeSlug?: string };
      if (err.code === "MKT_DUPLICATE_PHONE") {
        return NextResponse.json(
          { error: err.message, storeSlug: err.storeSlug },
          { status: 409 }
        );
      }
      throw dbErr;
    }

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
      await sendWhatsAppQueued(adminPhone, msg, { tenantId: store.id, context: "stores/apply:admin" }).catch(() => {});
    }

    // Confirmation to store owner
    await sendWhatsAppQueued(
      ownerPhone,
      [
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
      ].join("\n"),
      { tenantId: store.id, context: "stores/apply:owner" },
    ).catch(() => {});

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
