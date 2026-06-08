"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const RecentPurchases = dynamic(() => import("@/components/store/RecentPurchases"), {});
const PostDeliverySurveyTrigger = dynamic(() => import("@/components/store/PostDeliverySurveyTrigger"), {});
const QuickReorderButton = dynamic(() => import("@/components/store/QuickReorderButton"), {});
const SocioPromoFlotante = dynamic(
  () => import("@/components/ui-system/widgets/SocioPromoFlotante").then((m) => m.SocioPromoFlotante),
  {},
);

// Rutas donde los flotantes (chat WhatsApp + repetir pedido + promo socio + recent
// purchases + post-delivery survey) tienen sentido: el usuario está comprando o
// gestionando un pedido. En landing/informativas (/, /precios, /terminos, etc.)
// estos widgets distraen y son ruido visual, por eso quedan ocultos.
const SHOPPING_PATH_PREFIXES = [
  "/marketplace",
  "/tienda",
  "/cuenta",
  "/mi-cuenta",
  "/mis-pedidos",
  "/mi-credito",
  "/mi-panel",
  "/mi-puntos",
  "/puntos",
  "/favoritos",
  "/buscar",
  "/tracking",
  "/checkout",
  "/pedido",
  "/venta",
  "/comprar-invitado",
  "/t/", // storefront por tenant slug (white-label)
];

function isShoppingContext(pathname: string | null): boolean {
  if (!pathname) return false;
  return SHOPPING_PATH_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default function StoreFloatingWidgets() {
  const pathname = usePathname();
  if (!isShoppingContext(pathname)) return null;
  return (
    <>
      <RecentPurchases />
      <PostDeliverySurveyTrigger />
      {/* Brandon 2026-06-07: el FAB de WhatsApp se quitó — había DOS botones
          flotantes (chat + WhatsApp). Queda solo el chat (LiveChatWidget). Repetir
          pedido + socio-promo se ocultan en mobile (saturan el cel); aparecen en sm+. */}
      <div className="hidden sm:contents">
        <QuickReorderButton />
        <SocioPromoFlotante />
      </div>
    </>
  );
}
