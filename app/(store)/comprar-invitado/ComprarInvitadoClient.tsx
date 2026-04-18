"use client";

/**
 * ComprarInvitadoClient — Página cliente que monta GuestBuyEntry.
 *
 * Demo: usa items mock. En producción, leer el cart real via use-marketplace-cart
 * sin modificarlo (regla zona peligro).
 */

import { useRouter } from "next/navigation";
import GuestBuyEntry from "@/components/customer/guest-checkout/GuestBuyEntry";

// Mock — en prod: items = useMarketplaceCart().items (solo lectura)
const MOCK_CART_ITEMS = [
  {
    productId: 1001,
    storeProductId: "sp-1001",
    storeId: "store-main",
    quantity: 2,
    unitPrice: 4.5,
    name: "Leche Gloria 400g",
  },
  {
    productId: 1002,
    storeProductId: "sp-1002",
    storeId: "store-main",
    quantity: 1,
    unitPrice: 28.9,
    name: "Arroz Costeño 5kg",
  },
];

export default function ComprarInvitadoClient() {
  const router = useRouter();

  return (
    <GuestBuyEntry
      cartItems={MOCK_CART_ITEMS}
      onSuccess={(orderId) => {
        if (!orderId) return;
        // Redirect al tracking público
        router.push(`/tracking?order=${orderId}`);
      }}
    />
  );
}
