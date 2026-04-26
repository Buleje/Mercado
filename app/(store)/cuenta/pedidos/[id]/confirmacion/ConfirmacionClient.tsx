"use client";

/**
 * ConfirmacionClient — Monta Celebration + CrossSell post-compra.
 * CK-4: Incluye ReorderInlineButton para "Comprar de nuevo".
 */

import { useCallback } from "react";
import PostPurchaseCelebration from "@/components/customer/post-purchase/PostPurchaseCelebration";
import PostPurchaseCrossSell from "@/components/customer/post-purchase/PostPurchaseCrossSell";
import ReorderInlineButton from "@/components/customer/post-purchase/ReorderInlineButton";

interface ConfirmacionClientProps {
  orderId: string;
  customerName?: string;
  etaIso: string;
}

export default function ConfirmacionClient({
  orderId,
  customerName,
  etaIso,
}: ConfirmacionClientProps) {
  const handleShare = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/cuenta/pedidos/${orderId}/seguimiento`;
    const text = `Compré en Buleje — hace seguimiento aquí: ${url}`;
    if (navigator.share) {
      navigator.share({ title: "Mi pedido Buleje", text, url }).catch(() => {
        // User canceled — silent
      });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        /* silent */
      });
    }
  }, [orderId]);

  const handleAddToNext = useCallback((productId: number) => {
    // Stub: en prod llamar a /api/next-order/add
    if (process.env.NODE_ENV !== "production") {
      console.log("[post-purchase] add-to-next", { productId, orderId });
    }
  }, [orderId]);

  return (
    <>
      <PostPurchaseCelebration
        orderId={orderId}
        customerName={customerName}
        etaIso={etaIso}
        onShare={handleShare}
      />

      {/* CK-4: Botón "Comprar de nuevo" — carga items del último pedido al carrito */}
      <div className="flex justify-start">
        <ReorderInlineButton orderId={orderId} />
      </div>

      <PostPurchaseCrossSell
        orderId={orderId}
        products={[]}
        onAddToNext={handleAddToNext}
      />
    </>
  );
}
