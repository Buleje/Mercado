import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/customer-tier?phone=...
 *
 * Devuelve el tier real del cliente (basado en cantidad de pedidos
 * marketplace ya completados — fuente de verdad server-side, no
 * localStorage). El front lo usa en checkout para mostrar el descuento
 * implícito que se aplicará.
 *
 * Tiers:
 *   - 5–9 pedidos   → "frecuente" (-5%)
 *   - 10–24 pedidos → "vip"       (-7%)
 *   - 25+ pedidos   → "embajador" (-10%)
 *
 * Sin pedidos o <5 → null.
 */

type Tier = {
  level: "frecuente" | "vip" | "embajador";
  label: string;
  discountPct: number;
};

export function tierForCount(count: number): Tier | null {
  if (count >= 25) return { level: "embajador", label: "Cliente Embajador", discountPct: 10 };
  if (count >= 10) return { level: "vip", label: "Cliente VIP", discountPct: 7 };
  if (count >= 5) return { level: "frecuente", label: "Cliente Frecuente", discountPct: 5 };
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const phone = url.searchParams.get("phone")?.trim();
  if (!phone || phone.length < 6) {
    return NextResponse.json({ tier: null, count: 0 });
  }

  try {
    const count = await prisma.order.count({
      where: {
        customerPhone: phone,
        source: "marketplace",
        deletedAt: null,
        status: "entregado",
      },
    });
    const tier = tierForCount(count);
    return NextResponse.json(
      { tier, count },
      {
        headers: {
          // Cache 5 min: el tier cambia raras veces, no romper
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (err) {
    logger.warn("[customer-tier]", { error: String(err) });
    return NextResponse.json({ tier: null, count: 0 });
  }
}
