"use client";

/**
 * SectionsGrid — grid responsive con todas las sub-secciones de /cuenta.
 *
 * 11 cards: pedidos, seguimiento, suscripciones, gift cards, cupones, socio,
 * favoritos, wishlist, notificaciones, direcciones, pagos, preferencias.
 *
 * Cada card trae metrica + link. Si esta vacia, muestra empty state mini con CTA.
 */

import { memo } from "react";
import { Kicker, SectionTitle } from "@buleje/design-system";
import {
  Package,
  Truck,
  Repeat,
  Gift,
  Tag,
  Award,
  Heart,
  Bookmark,
  Bell,
  MapPin,
  CreditCard,
  Settings,
} from "@buleje/design-system/icons";
import SectionCard from "./SectionCard";
import type { CustomerDashboardData } from "@/lib/customer-dashboard.mock";

export interface SectionsGridProps {
  data: CustomerDashboardData;
}

function fmtSoles(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

export const SectionsGrid = memo(function SectionsGrid({ data }: SectionsGridProps) {
  const hasActiveOrder = data.orders.active !== null;
  const activeOrderHref = hasActiveOrder
    ? `/cuenta/pedidos`
    : "/cuenta/pedidos";

  return (
    <section aria-labelledby="sections-heading">
      <div className="mb-4">
        <Kicker>Tu cuenta</Kicker>
        <SectionTitle id="sections-heading" className="mt-0.5">
          Todo en un solo lugar
        </SectionTitle>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SectionCard
          icon={Package}
          title="Mis pedidos"
          metric={`${data.orders.recentCount} pedidos`}
          detail={
            data.orders.lastDeliveredAt
              ? "Último entregado hace 2 dias"
              : "Sin historial aun"
          }
          href="/cuenta/pedidos"
          isEmpty={data.orders.recentCount === 0}
          emptyLabel="Aun no hiciste tu primer pedido"
          emptyHref="/tienda"
        />
        <SectionCard
          icon={Truck}
          title="Seguimiento"
          metric={
            hasActiveOrder
              ? `${data.totals.pedidosActivos} activo${data.totals.pedidosActivos === 1 ? "" : "s"}`
              : "0 activos"
          }
          detail={
            hasActiveOrder
              ? `${data.orders.active?.storeName ?? "Dona Elena"} - ${data.orders.active?.deliveryWindow ?? "pronto"}`
              : "Sin pedidos en curso"
          }
          href={activeOrderHref}
          isEmpty={!hasActiveOrder}
          emptyLabel="Nada en camino ahora mismo"
          emptyHref="/tienda"
          accent={hasActiveOrder ? "accent" : null}
        />
        <SectionCard
          icon={Repeat}
          title="Bodega al Mes"
          metric={
            data.subscriptions.activeCount > 0
              ? `${data.subscriptions.activeCount} activas`
              : "Sin suscripciones"
          }
          detail={
            data.subscriptions.activeCount > 0
              ? `Ahorras ${fmtSoles(data.subscriptions.ahorroMesActual)}/mes`
              : undefined
          }
          href="/cuenta/suscripciones"
          isEmpty={data.subscriptions.activeCount === 0}
          emptyLabel="Probate una suscripcion y ahorra 5%"
          emptyHref="/bodega-al-mes"
        />
        <SectionCard
          icon={Gift}
          title="Gift Cards"
          metric={
            data.giftCards.recibidasCount + data.giftCards.enviadasCount > 0
              ? `${data.giftCards.recibidasCount} recibidas - ${data.giftCards.enviadasCount} enviadas`
              : "Sin movimientos"
          }
          detail={
            data.giftCards.hasPendingClaim
              ? `${fmtSoles(data.giftCards.saldoPendiente)} sin canjear`
              : undefined
          }
          href="/cuenta/gift-cards"
          isEmpty={data.giftCards.recibidasCount + data.giftCards.enviadasCount === 0}
          emptyLabel="Regalale credito a alguien que quieras"
          emptyHref="/cuenta/gift-cards"
          accent={data.giftCards.hasPendingClaim ? "urgent" : null}
        />
        <SectionCard
          icon={Tag}
          title="Cupones"
          metric={
            data.coupons.disponiblesCount > 0
              ? `${data.coupons.disponiblesCount} disponibles`
              : "Sin cupones"
          }
          detail={
            data.coupons.disponiblesCount > 0
              ? `Hasta ${fmtSoles(data.coupons.descuentoTotal)} de descuento`
              : undefined
          }
          href="/cuenta/cupones"
          isEmpty={data.coupons.disponiblesCount === 0}
          emptyLabel="No tenes cupones aun - explora ofertas"
          emptyHref="/ofertas"
        />
        <SectionCard
          icon={Award}
          title="Socio Buleje"
          metric={
            data.profile.isSocioBuleje
              ? `Socio ${data.profile.socioTier === "plus" ? "Plus" : data.profile.socioTier === "pro" ? "Pro" : "Gratis"}`
              : "Sin membresia"
          }
          detail={
            data.profile.isSocioBuleje
              ? `${fmtSoles(data.profile.socioCashbackDisponible)} cashback disponible`
              : "Descubri los beneficios"
          }
          href="/cuenta/socio-buleje"
        />
        <SectionCard
          icon={Heart}
          title="Favoritos"
          metric={
            data.favorites.productosCount > 0
              ? `${data.favorites.productosCount} productos`
              : "Sin favoritos"
          }
          detail={
            data.favorites.tiendasCount > 0
              ? `${data.favorites.tiendasCount} tiendas guardadas`
              : undefined
          }
          href="/favoritos"
          isEmpty={data.favorites.productosCount === 0}
          emptyLabel="Marca productos con corazon"
          emptyHref="/tienda"
        />
        <SectionCard
          icon={Bookmark}
          title="Wishlist"
          metric={
            data.favorites.wishlistCount > 0
              ? `${data.favorites.wishlistCount} items`
              : "Sin items"
          }
          detail={data.favorites.wishlistCount > 0 ? "Guardados para despues" : undefined}
          href="/wishlist"
          isEmpty={data.favorites.wishlistCount === 0}
          emptyLabel="Guarda productos para comprar luego"
          emptyHref="/tienda"
        />
        <SectionCard
          icon={Bell}
          title="Notificaciones"
          metric={
            data.notifications.unreadCount > 0
              ? `${data.notifications.unreadCount} sin leer`
              : "Todo al dia"
          }
          detail={data.notifications.lastLabel ?? undefined}
          href="/cuenta/notificaciones"
          accent={data.notifications.unreadCount > 0 ? "accent" : null}
        />
        <SectionCard
          icon={MapPin}
          title="Direcciones"
          metric={
            data.addresses.guardadasCount > 0
              ? `${data.addresses.guardadasCount} guardadas`
              : "Sin direcciones"
          }
          detail={data.addresses.defaultLabel ?? undefined}
          href="/cuenta/direcciones"
          isEmpty={data.addresses.guardadasCount === 0}
          emptyLabel="Agrega tu primera direccion"
          emptyHref="/cuenta/direcciones"
        />
        <SectionCard
          icon={CreditCard}
          title="Metodos de pago"
          metric={
            data.payments.methodsCount > 0
              ? `${data.payments.methodsCount} guardados`
              : "Sin metodos"
          }
          detail={data.payments.preferredLabel ?? undefined}
          href="/cuenta/pagos"
          isEmpty={data.payments.methodsCount === 0}
          emptyLabel="Agrega Yape o efectivo"
          emptyHref="/cuenta/pagos"
        />
        <SectionCard
          icon={Settings}
          title="Preferencias"
          metric="Configurar"
          detail="Notificaciones, idioma, tema"
          href="/cuenta/preferencias"
        />
      </div>
    </section>
  );
});

export default SectionsGrid;
