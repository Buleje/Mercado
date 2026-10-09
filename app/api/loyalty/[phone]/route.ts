import { NextRequest, NextResponse } from "next/server";
import { LoyaltyDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireCustomer } from "@/lib/auth/require-customer";
import { CUSTOMER_SESSION, telefonoDeLaSesion } from "@/lib/auth/customer-session";
import { rateLimit, getClientIp , applyRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Auto-discount tiers based on purchase count (from discount engine)
const AUTO_DISCOUNT_TIERS = [
  { minPurchases: 50, percent: 6, label: "VIP" },
  { minPurchases: 20, percent: 4, label: "Habitual" },
  { minPurchases: 5, percent: 2, label: "Conocido" },
  { minPurchases: 0, percent: 0, label: "Nuevo" },
];

// -- GET /api/loyalty/[phone] -- autenticado, solo el propio customer ---------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`loyalty-get:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { phone } = await params;
  const requestedPhone = normalizePhone(phone);

  // Quién lee nombre y puntos de un teléfono (Ley 29733, security 2026-10-08):
  //  1. la sesión que PROBÓ ese teléfono (código), del mismo negocio
  //     (`requireCustomer` compara el negocio de la sesión con el del pedido);
  //  2. el panel admin del negocio (LoyaltyTab).
  // Nadie más: 401 sin datos. Antes alcanzaba que los últimos 9 dígitos del
  // `customerId` coincidieran («google_1177…987654321» abría el 987654321).
  let tenantId: string | null = null;
  if (req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value) {
    const customer = await requireCustomer(req);
    if (!(customer instanceof NextResponse) && telefonoDeLaSesion(customer) === requestedPhone) {
      tenantId = customer.tenantId;
    }
  }
  if (!tenantId) {
    const admin = await requireAdmin(req, ["admin", "cajero", "tienda_owner"]);
    if (admin instanceof NextResponse) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    tenantId = admin.tenantId;
  }

  try {
    const data = await LoyaltyDB.getByPhone(tenantId, requestedPhone);
    // Defensa oracle: 404 uniforme si no existe (no revela 401/403 por existencia)
    if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    // Count total orders for auto-discount calculation
     
    const totalOrders = await prisma.order.count({
      where: { tenantId, customerPhone: requestedPhone },
       
    }).catch((err) => { logger.error("[loyalty] totalOrders count failed", { error: String(err), phone: requestedPhone }); return 0; });

    // Find current and next auto-discount tier
    const currentTier = AUTO_DISCOUNT_TIERS.find(t => totalOrders >= t.minPurchases) ?? AUTO_DISCOUNT_TIERS[AUTO_DISCOUNT_TIERS.length - 1];
    const nextTier = AUTO_DISCOUNT_TIERS.slice().reverse().find(t => totalOrders < t.minPurchases);

    return NextResponse.json({
      ...data,
      tiers: LoyaltyDB.TIERS,
      autoDiscount: {
        totalOrders,
        currentTier: currentTier.label,
        currentPercent: currentTier.percent,
        nextTier: nextTier ? { label: nextTier.label, percent: nextTier.percent, ordersNeeded: nextTier.minPurchases - totalOrders } : null,
        allTiers: AUTO_DISCOUNT_TIERS,
      },
    });
  } catch (e) {
    logger.error("[loyalty] GET error", { error: String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

const AdjustSchema = z.object({
  points: z.number().int().refine((n) => n !== 0, "points must be non-zero"),
  reason: z.string().max(200).optional(),
});

// -- PATCH /api/loyalty/[phone] -- admin only, manual point adjustment --------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "loyalty-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { phone } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = AdjustSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const normalized = normalizePhone(phone);
    const { points } = parsed.data;
    if (points > 0) {
      const result = await LoyaltyDB.accruePoints(auth.tenantId, normalized, points);
      if (!result) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      return NextResponse.json(result);
    } else {
      const ok = await LoyaltyDB.redeemPoints(auth.tenantId, normalized, Math.abs(points));
      if (!ok) return NextResponse.json({ error: "Puntos insuficientes" }, { status: 422 });
      const data = await LoyaltyDB.getByPhone(auth.tenantId, normalized);
      return NextResponse.json(data);
    }
  } catch (e) {
    logger.error("[loyalty] PATCH error", { error: String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
