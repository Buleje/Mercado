import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { LoyaltyDB } from "@/lib/db/loyalty.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { logger } from "@/lib/logger";
import { tierForCount } from "@/app/api/marketplace/customer-tier/route";


/**
 * GET /api/marketplace/loyalty/summary
 *
 * Combina balance de puntos (loyalty) + tier de pedidos (customer-tier)
 * en una sola request para el componente MyFidelidadCard.
 *
 * SECURITY: requiere customer-session válida con phone match.
 * Devuelve solo datos agregados (no PII name/totalSpent).
 *
 * Tiers loyalty (por puntos):
 *   bronce  <500  → siguiente: plata   a 500
 *   plata   500+  → siguiente: oro     a 1000
 *   oro    1000+  → tier máximo
 *
 * Tiers pedidos (cross-tenant, ADR-082):
 *   frecuente  5-9     → -5%
 *   vip       10-24    → -7%
 *   embajador  25+     → -10%
 *
 * Beneficios incluidos en la respuesta para renderizado directo.
 */

type LoyaltyTier = "bronce" | "plata" | "oro";

interface LoyaltyTierMeta {
  label: string;
  nextTier: string | null;
  nextAt: number | null;
  benefits: string[];
  pointsToSoles: number; // 1 punto = S/ 0.01
}

const LOYALTY_TIERS: Record<LoyaltyTier, LoyaltyTierMeta> = {
  bronce: {
    label: "Bronce",
    nextTier: "Plata",
    nextAt: 500,
    benefits: ["Acumula 1 punto por cada S/1 de compra", "Bienvenida de 100 puntos"],
    pointsToSoles: 0.01,
  },
  plata: {
    label: "Plata",
    nextTier: "Oro",
    nextAt: 1000,
    benefits: ["3% extra en compras seleccionadas", "Prioridad en atención"],
    pointsToSoles: 0.01,
  },
  oro: {
    label: "Oro",
    nextTier: null,
    nextAt: null,
    benefits: ["5% extra en compras", "Envío gratis cada 4 pedidos"],
    pointsToSoles: 0.01,
  },
};

function loyaltyTierFromPoints(points: number): LoyaltyTier {
  if (points >= 1000) return "oro";
  if (points >= 500) return "plata";
  return "bronce";
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "loyalty-summary");
  if (rl) return rl;

  // Autenticación: requiere customer-session válida
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
  if (!session?.customerId) {
    return NextResponse.json({ authorized: false }, { status: 401 });
  }

  const phone = session.customerId;
  // Round 7 fix H002: tenantId desde la session JWT firmada, NO del header.
  // Antes: `req.headers.get("x-tenant-id") ?? "main"` permitía cross-tenant oracle
  // (atacante con session válida en tenant_A enumeraba tenant_B/C inyectando header).
  const tenantId = session.tenantId;

  try {
    // Fetch paralelo: balance de puntos + conteo de pedidos marketplace
    const [loyaltyResult, orderCount] = await Promise.all([
      LoyaltyDB.getHistory(tenantId, phone, 5, 0).catch((err) => {
        logger.warn("[loyalty/summary] getHistory fallback", {
          phone,
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
        return { transactions: [], balance: 0, total: 0 };
      }),
      OrdersDB.countDeliveredByPhone(tenantId, phone, { source: "marketplace" }).catch(
        (err) => {
          logger.warn("[loyalty/summary] orderCount fallback", {
            error: String(err),
          });
          return 0;
        },
      ),
    ]);

    const points = loyaltyResult.balance;
    const loyaltyTier = loyaltyTierFromPoints(points);
    const tierMeta = LOYALTY_TIERS[loyaltyTier];
    const orderTier = tierForCount(orderCount);

    // Progreso al siguiente tier
    const progressPct =
      tierMeta.nextAt !== null
        ? Math.min(100, Math.round((points / tierMeta.nextAt) * 100))
        : 100;
    const pointsNeeded =
      tierMeta.nextAt !== null ? Math.max(0, tierMeta.nextAt - points) : 0;

    // Equivalencia en soles (totales los calcula el backend)
    const soleEquivalent = +(points * tierMeta.pointsToSoles).toFixed(2);

    return NextResponse.json(
      {
        authorized: true,
        points,
        soleEquivalent,
        loyaltyTier,
        tierLabel: tierMeta.label,
        nextTier: tierMeta.nextTier,
        progressPct,
        pointsNeeded,
        benefits: tierMeta.benefits,
        orderTier: orderTier
          ? {
              level: orderTier.level,
              label: orderTier.label,
              discountPct: orderTier.discountPct,
            }
          : null,
        orderCount,
        // Últimas 5 transacciones para historial rápido (no PII)
        recentHistory: loyaltyResult.transactions.slice(0, 5),
        historyTotal: loyaltyResult.total,
      },
      {
        headers: {
          // Cache privado 3 min: los puntos cambian con cada compra
          "Cache-Control": "private, max-age=180",
        },
      },
    );
  } catch (err) {
    logger.error("[loyalty/summary] unexpected error", { error: String(err) });
    return NextResponse.json(
      { authorized: true, error: "Error al cargar tu fidelidad" },
      { status: 500 },
    );
  }
}
