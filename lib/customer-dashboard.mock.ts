/**
 * Mock data consolidado para el dashboard unificado /cuenta.
 *
 * Agrega metrics de todas las sub-secciones (pedidos, suscripciones, gift cards,
 * cupones, socio buleje, favoritos, notificaciones, direcciones, pagos) mas
 * feed de actividad reciente y sugerencias personalizadas.
 *
 * ADR: este archivo es temporal MVP, no conecta a lib/db/*.db.ts.
 * Reemplazar con API real cuando existan endpoints customer-side.
 */

import { MOCK_ORDERS, type MockOrder } from "./customer-orders.mock";

// ── Perfil / membresia ─────────────────────────────────────────────
export type CustomerProfile = {
  firstName: string;
  memberSince: string; // ISO date
  memberMonths: number;
  isSocioBuleje: boolean;
  socioTier: "gratis" | "plus" | "pro";
  socioCashbackDisponible: number; // S/
  socioAhorroMes: number; // S/
};

// ── Suscripciones ──────────────────────────────────────────────────
export type SubscriptionSummary = {
  activeCount: number;
  nextDelivery: string | null; // ISO or null
  ahorroMesActual: number; // S/
  upcomingLabel: string | null;
};

// ── Gift cards ─────────────────────────────────────────────────────
export type GiftCardSummary = {
  recibidasCount: number;
  enviadasCount: number;
  saldoPendiente: number; // S/
  hasPendingClaim: boolean;
};

// ── Cupones ────────────────────────────────────────────────────────
export type CouponSummary = {
  disponiblesCount: number;
  descuentoTotal: number; // S/
  expirationNext: string | null; // ISO or null
};

// ── Favoritos / wishlist ───────────────────────────────────────────
export type FavoritesSummary = {
  productosCount: number;
  wishlistCount: number;
  tiendasCount: number;
};

// ── Notificaciones ─────────────────────────────────────────────────
export type NotificationsSummary = {
  unreadCount: number;
  lastLabel: string | null;
};

// ── Direcciones / pagos ────────────────────────────────────────────
export type AddressesSummary = {
  guardadasCount: number;
  defaultLabel: string | null;
};

export type PaymentsSummary = {
  methodsCount: number;
  preferredLabel: string | null;
};

// ── Actividad reciente (feed) ──────────────────────────────────────
export type ActivityEventKind =
  | "order_confirmed"
  | "order_delivered"
  | "order_shipped"
  | "coupon_new"
  | "subscription_upcoming"
  | "gift_received"
  | "socio_cashback"
  | "favorite_back_in_stock";

export type ActivityEvent = {
  id: string;
  kind: ActivityEventKind;
  title: string;
  detail: string;
  timestamp: string; // ISO
  href: string;
};

// ── Recomendaciones personalizadas ─────────────────────────────────
export type RecommendationIntent = "upgrade" | "schedule" | "urgent" | "suggestion";

export type Recommendation = {
  id: string;
  intent: RecommendationIntent;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
};

// ── Dashboard agregado ─────────────────────────────────────────────
export type CustomerDashboardData = {
  profile: CustomerProfile;
  totals: {
    pedidosTotales: number;
    pedidosActivos: number;
    favoritosCount: number;
    ahorroMesSocio: number;
  };
  orders: {
    active: MockOrder | null;
    recentCount: number;
    lastDeliveredAt: string | null;
  };
  subscriptions: SubscriptionSummary;
  giftCards: GiftCardSummary;
  coupons: CouponSummary;
  favorites: FavoritesSummary;
  notifications: NotificationsSummary;
  addresses: AddressesSummary;
  payments: PaymentsSummary;
  activity: ActivityEvent[];
  recommendations: Recommendation[];
};

// ── Datos demo ─────────────────────────────────────────────────────
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - 1000 * 60 * 60 * h).toISOString();
const daysAgo = (d: number) => new Date(now - 1000 * 60 * 60 * 24 * d).toISOString();
const daysAhead = (d: number) => new Date(now + 1000 * 60 * 60 * 24 * d).toISOString();

export const MOCK_DASHBOARD: CustomerDashboardData = {
  profile: {
    firstName: "Maria",
    memberSince: daysAgo(120),
    memberMonths: 4,
    isSocioBuleje: true,
    socioTier: "plus",
    socioCashbackDisponible: 18.5,
    socioAhorroMes: 42.3,
  },
  totals: {
    pedidosTotales: MOCK_ORDERS.length,
    pedidosActivos: MOCK_ORDERS.filter((o) =>
      ["pendiente", "confirmado", "en_camino"].includes(o.status),
    ).length,
    favoritosCount: 12,
    ahorroMesSocio: 42.3,
  },
  orders: {
    active:
      MOCK_ORDERS.find((o) =>
        ["pendiente", "confirmado", "en_camino"].includes(o.status),
      ) ?? null,
    recentCount: MOCK_ORDERS.length,
    lastDeliveredAt: daysAgo(2),
  },
  subscriptions: {
    activeCount: 2,
    nextDelivery: daysAhead(3),
    ahorroMesActual: 14.2,
    upcomingLabel: "Arroz Paisana 5kg + Aceite Primor",
  },
  giftCards: {
    recibidasCount: 1,
    enviadasCount: 2,
    saldoPendiente: 50,
    hasPendingClaim: true,
  },
  coupons: {
    disponiblesCount: 3,
    descuentoTotal: 25,
    expirationNext: daysAhead(5),
  },
  favorites: {
    productosCount: 12,
    wishlistCount: 4,
    tiendasCount: 2,
  },
  notifications: {
    unreadCount: 2,
    lastLabel: "Tu pedido esta en camino",
  },
  addresses: {
    guardadasCount: 2,
    defaultLabel: "Jr. Ucayali 342, Pucallpa",
  },
  payments: {
    methodsCount: 2,
    preferredLabel: "Yape *****7456",
  },
  activity: [
    {
      id: "act_01",
      kind: "order_shipped",
      title: "Pedido #ABC001 en camino",
      detail: "Bodega Dona Elena - llega en 15 a 30 min",
      timestamp: hoursAgo(0.5),
      href: "/cuenta/pedidos",
    },
    {
      id: "act_02",
      kind: "coupon_new",
      title: "Nuevo cupon MARIA10 disponible",
      detail: "10% de descuento en tu proximo pedido",
      timestamp: hoursAgo(6),
      href: "/cuenta/cupones",
    },
    {
      id: "act_03",
      kind: "subscription_upcoming",
      title: "Proxima entrega Bodega al Mes",
      detail: "Arroz Paisana 5kg - martes 22 abr",
      timestamp: hoursAgo(24),
      href: "/cuenta/suscripciones",
    },
    {
      id: "act_04",
      kind: "socio_cashback",
      title: "Cashback Socio acreditado",
      detail: "S/ 4.20 disponibles para tu proximo pedido",
      timestamp: daysAgo(2),
      href: "/cuenta/socio-buleje",
    },
    {
      id: "act_05",
      kind: "order_delivered",
      title: "Pedido #ABC002 entregado",
      detail: "Buleje - gracias por tu compra",
      timestamp: daysAgo(2),
      href: "/cuenta/pedidos",
    },
  ],
  recommendations: [
    {
      id: "rec_01",
      intent: "urgent",
      title: "Tenes S/ 50 sin canjear",
      description:
        "Una gift card sigue pendiente. Canjeala antes que venza en 12 dias.",
      ctaLabel: "Canjear ahora",
      href: "/cuenta/gift-cards",
    },
    {
      id: "rec_02",
      intent: "schedule",
      title: "Ajusta tu proxima entrega",
      description:
        "Tu suscripcion Arroz Paisana llega el martes. Cambia fecha o producto si queres.",
      ctaLabel: "Ajustar entrega",
      href: "/cuenta/suscripciones",
    },
    {
      id: "rec_03",
      intent: "suggestion",
      title: "Usa tu cupon MARIA10",
      description:
        "Tenes 10% de descuento esperando. Combinalo con productos Socio para maximo ahorro.",
      ctaLabel: "Explorar ofertas",
      href: "/ofertas",
    },
  ],
};

/** Formato relativo en espanol ("hace 2h", "hace 3d"). */
export function relativeFromNow(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "hace instantes";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.round(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}
