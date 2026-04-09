import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSupplier } from "@/lib/require-supplier";
import { SupplierOfferDB } from "@/lib/db/supplier-portal.db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const createOfferSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  discountPercent: z.number().min(0.1).max(100).optional(),
  minQuantity: z.number().int().min(1).optional(),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
});

/**
 * GET /api/supplier/offers
 * Ofertas del proveedor autenticado (activas e inactivas).
 * Query: active=true para solo activas.
 */
export async function GET(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const onlyActive = req.nextUrl.searchParams.get("active") === "true";
    const { supplierId } = supplier;

    const offers = onlyActive
      ? await SupplierOfferDB.getActive(supplierId)
      : await SupplierOfferDB.getAll(supplierId);

    logger.debug("[SUPPLIER-OFFERS] fetched", { supplierId, count: offers.length, onlyActive });

    return NextResponse.json({ offers });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

/**
 * POST /api/supplier/offers
 * Crear nueva oferta de temporada.
 */
export async function POST(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, supplierName, tenantId } = supplier;

    const body = await req.json().catch(() => ({}));
    const parsed = createOfferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Validar rango de fechas
    const from = new Date(parsed.data.validFrom);
    const until = new Date(parsed.data.validUntil);
    if (until <= from) {
      return NextResponse.json(
        { error: "validUntil debe ser posterior a validFrom" },
        { status: 400 },
      );
    }

    const offer = await SupplierOfferDB.create(tenantId, {
      supplierId,
      title: parsed.data.title,
      description: parsed.data.description,
      discountPercent: parsed.data.discountPercent,
      minQuantity: parsed.data.minQuantity,
      validFrom: parsed.data.validFrom,
      validUntil: parsed.data.validUntil,
      isActive: true,
    });

    logActivity(
      "CREATE",
      "supplier-offer",
      `Proveedor ${supplierName} creó oferta "${parsed.data.title}"`,
      offer.id,
      supplierName,
    ).catch(() => {});

    return NextResponse.json(offer, { status: 201 });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
