/**
 * GET /api/marketplace/storefront/payment-config?stores=slug1,slug2,...
 *
 * Endpoint público (storefront) que devuelve los métodos de pago habilitados
 * por cada tienda del carrito, junto con la data pública necesaria para
 * mostrarle al cliente cómo pagar (QR, titular, número, banco, cuenta).
 *
 * Cross-tenant by design: el marketplace agrega tiendas distintas en un
 * mismo carrito. Cada cliente puede tener config diferente:
 *   - bodega-san-martin → yape S/.xx + plin S/.yy
 *   - mi-pollo → solo efectivo
 *   - fruteria-luna → yape + transferencia BCP
 *
 * NO expone: adminPassword, smtpPass, stripeKeys, ni nada privado.
 * SI expone: yape/plin/transfer config (QR, titular, número, banco).
 *
 * Cache: 60s en memoria por slug. invalidateByPrefix(`payment-config:`)
 * cuando admin guarda Settings (futuro hook).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { SettingsDB } from "@/lib/db/settings.db";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { getOrSet } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  stores: z
    .string()
    .min(1)
    .max(500)
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => /^[a-z0-9-]{2,64}$/.test(x))
        .slice(0, 10),
    ),
});

export interface StorePaymentConfig {
  storeSlug: string;
  storeName?: string;
  /** Métodos disponibles para mostrar en orden estable */
  methods: PaymentMethodEntry[];
}

export type PaymentMethodKey = "efectivo" | "yape" | "plin" | "transfer";

export interface PaymentMethodEntry {
  key: PaymentMethodKey;
  enabled: boolean;
  /** Datos públicos del método — null si no aplica */
  yape?: { image?: string; name?: string; phone?: string };
  plin?: { image?: string; name?: string; phone?: string };
  transfer?: { bankName?: string; accountNumber?: string; accountHolder?: string };
}

async function getStoreConfig(slug: string): Promise<StorePaymentConfig | null> {
  return getOrSet<StorePaymentConfig | null>(
    `payment-config:${slug}`,
    60,
    async () => {
      try {
        const tenantId = await resolveTenantSlugToId(slug);
        if (!tenantId) return null;
        const s = await SettingsDB.get(tenantId);

        const methods: PaymentMethodEntry[] = [];

        // Efectivo (contra entrega) — siempre disponible salvo desactivado explícito
        if (s.cashEnabled !== false) {
          methods.push({ key: "efectivo", enabled: true });
        }

        if (s.yapeEnabled) {
          methods.push({
            key: "yape",
            enabled: true,
            yape: {
              image: s.yapeImage,
              name: s.yapeName,
              phone: s.yapePhone,
            },
          });
        }

        if (s.plinEnabled) {
          methods.push({
            key: "plin",
            enabled: true,
            plin: {
              image: s.plinImage,
              name: s.plinName,
              phone: s.plinPhone,
            },
          });
        }

        if (s.transferEnabled) {
          methods.push({
            key: "transfer",
            enabled: true,
            transfer: {
              bankName: s.transferBankName,
              accountNumber: s.transferAccountNum,
              accountHolder: s.transferAccountHolder,
            },
          });
        }

        return {
          storeSlug: slug,
          storeName: s.businessName,
          methods,
        };
      } catch (err) {
        logger.warn("[payment-config] resolve failed", { slug, error: String(err) });
        return null;
      }
    },
  );
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "payment-config");
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    stores: searchParams.get("stores") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Falta el parámetro `stores=slug1,slug2`" },
      { status: 400 },
    );
  }

  const slugs = parsed.data.stores;
  if (slugs.length === 0) {
    return NextResponse.json({ stores: [] });
  }

  const configs = await Promise.all(slugs.map((s) => getStoreConfig(s)));
  const stores = configs.filter((c): c is StorePaymentConfig => c !== null);

  return NextResponse.json(
    { stores },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60",
      },
    },
  );
}
