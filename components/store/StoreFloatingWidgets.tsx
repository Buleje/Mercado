"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const RecentPurchases = dynamic(() => import("@/components/store/RecentPurchases"), {});
const PostDeliverySurveyTrigger = dynamic(() => import("@/components/store/PostDeliverySurveyTrigger"), {});
const WhatsAppFloatingButton = dynamic(() => import("@/components/store/WhatsAppFloatingButton"), {});
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
      {/* Brandon mayo 14 2026 v2: el chat WhatsApp + repetir pedido +
          socio-promo se ocultan en mobile (saturan la pantalla del cel).
          Solo aparecen en sm+ donde hay espacio sobrante a la derecha. */}
      <div className="hidden sm:contents">
        <WhatsAppFloatingButton />
        <QuickReorderButton />
        <SocioPromoFlotante />
      </div>
    </>
  );
}
