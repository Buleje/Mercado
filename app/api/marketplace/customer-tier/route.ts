import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";



/**
 * GET /api/marketplace/customer-tier?phone=...
 *
 * Devuelve el tier real del cliente (basado en cantidad de pedidos
 * marketplace ya completados — fuente de verdad server-side, no
 * localStorage). El front lo usa en checkout para mostrar el descuento
 * implícito que se aplicará.
 *
 * @cross-tenant intentional (ADR-082)
 * SECURITY: este endpoint cuenta pedidos del cliente CROSS-TENANT por
 * diseño — el programa marketplace recompensa fidelidad GLOBAL del
 * cliente al ecosistema Buleje, no a una tienda específica. No filtra
 * por tenantId del request. Devuelve solo agregados (count + tier);
 * NO retorna PII (name, total spent, items).
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
  // SECURITY 2026-05-06 (audit team H005): rate limit + customer-session
  // match. Antes el endpoint era enumerable: cualquiera con lista de
  // teléfonos podía mapear phone→tier (BI leak del competidor).
  const rl = await applyRateLimit(req, "STRICT", "customer-tier");
  if (rl) return rl;

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone")?.trim();
  if (!phone || phone.length < 6) {
    return NextResponse.json({ tier: null, count: 0 });
  }

  // Exigir customer-session con phone match (ADR-082 sigue cross-tenant
  // por diseño, pero solo el dueño del phone puede consultar SU tier).
  //
  // 2026-06-01: ante sesión ausente/no-match devolvemos 200 con tier null en
  // vez de 401. El status 401 NO es el mecanismo de seguridad (lo es el match
  // sesión↔phone); solo generaba ruido rojo en consola cuando un customer
  // queda en localStorage pero la cookie expiró (la app re-pega en cada carga
  // de home/tiendas). La anti-enumeración se mantiene: la respuesta es
  // idéntica para cualquier phone sin sesión válida (no revela existencia).
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
  if (!session || session.customerId !== phone) {
    return NextResponse.json({ tier: null, count: 0 });
  }

  try {
    const count = await MarketplacePublicDB.getCustomerOrderCount(phone);
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
