import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { LoyaltyDB, normalizePhone } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { PTS_PER_SOL } from "@/lib/loyalty-constants";

// ── Recompensas predefinidas ───────────────────────────────────────────────────
// ADR-380 Fase 1.5: el `value` de cada premio SIEMPRE deriva de PTS_PER_SOL
// (la fuente única de verdad de lib/loyalty-constants.ts) — antes esta tabla
// tenía su propia tarifa fija (100 pts = S/2 acá, S/1 en el checkout): el
// mismo punto valía el doble si lo canjeaba el cajero en el mostrador que si
// lo canjeaba el cliente en el checkout.

const soles = (pts: number) => Math.round((pts / PTS_PER_SOL) * 100) / 100;

export const REWARDS = [
  {
    id: "desc-2",
    name: `S/ ${soles(100)} de descuento`,
    description: "Descuento directo en tu próximo pedido",
    pointsCost: 100,
    type: "discount",
    value: soles(100),
    icon: "💰",
  },
  {
    id: "desc-5",
    name: `S/ ${soles(250)} de descuento`,
    description: "Descuento directo en tu próximo pedido",
    pointsCost: 250,
    type: "discount",
    value: soles(250),
    icon: "💸",
  },
  {
    id: "delivery-gratis",
    name: "Delivery gratis",
    description: "Envío sin costo en tu próximo pedido",
    pointsCost: 500,
    type: "free_delivery",
    value: 0,
    icon: "🛵",
  },
  {
    id: "desc-15",
    name: `S/ ${soles(1000)} de descuento`,
    description: "Descuento especial en tu próximo pedido",
    pointsCost: 1000,
    type: "discount",
    value: soles(1000),
    icon: "🎁",
  },
  {
    id: "producto-gratis",
    name: `Producto gratis`,
    description: `Elige un producto hasta S/ ${soles(2000)} de regalo`,
    pointsCost: 2000,
    type: "free_product",
    value: soles(2000),
    icon: "🏆",
  },
] as const;

export type Reward = (typeof REWARDS)[number];

// ── GET /api/loyalty/redeem — listar recompensas disponibles ──────────────────

export async function GET() {
  return NextResponse.json(REWARDS);
}

// ── POST /api/loyalty/redeem — canjear puntos por recompensa ─────────────────

const RedeemSchema = z.object({
  customerPhone: z.string().min(6).max(20),
  rewardId: z.string().min(1).max(50),
  pointsCost: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "loyalty-redeem"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = RedeemSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { customerPhone, rewardId, pointsCost } = parsed.data;

  // Verificar que la recompensa existe y el costo coincide
  const reward = REWARDS.find((r) => r.id === rewardId);
  if (!reward) {
    return NextResponse.json({ error: "Recompensa no encontrada" }, { status: 404 });
  }
  if (reward.pointsCost !== pointsCost) {
    return NextResponse.json({ error: "Costo de puntos incorrecto" }, { status: 400 });
  }

  const normalized = normalizePhone(customerPhone);

  try {
    // Verificar que el cliente tiene suficientes puntos
    const customer = await LoyaltyDB.getByPhone(auth.tenantId, normalized);
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    if (customer.loyaltyPoints < pointsCost) {
      return NextResponse.json(
        {
          error: "Puntos insuficientes",
          currentPoints: customer.loyaltyPoints,
          required: pointsCost,
        },
        { status: 422 },
      );
    }

    // Descontar puntos
    const ok = await LoyaltyDB.redeemPoints(auth.tenantId, normalized, pointsCost);
    if (!ok) {
      return NextResponse.json({ error: "No se pudieron descontar los puntos" }, { status: 500 });
    }

    const remainingPoints = customer.loyaltyPoints - pointsCost;

    // Registrar en ActivityLog (fire-and-forget)
    logActivity(
      "canjear",
      "loyalty",
      `${customer.name} (${normalized}) canjeó ${pointsCost} pts por "${reward.name}"`,
      normalized,
      "admin",
    ).catch((err) => logger.error("[loyalty/redeem] logActivity failed", { error: String(err) }));

    logger.info("[loyalty/redeem] canje exitoso", { phone: normalized, rewardId, pointsCost });

    return NextResponse.json({
      success: true,
      remainingPoints,
      reward: { id: reward.id, name: reward.name, icon: reward.icon },
    });
  } catch (e) {
    logger.error("[loyalty/redeem] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
