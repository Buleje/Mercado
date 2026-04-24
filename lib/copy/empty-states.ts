/**
 * Empty states — cada uno con next-step CTA visible.
 *
 * Regla Shopify: sin acción siguiente, el usuario abandona.
 * Formato: { eyebrow, title, description, cta }
 */

export interface EmptyStateCopy {
  eyebrow?: string;
  title: string;
  description: string;
  cta?: { label: string; href?: string };
}

export const EMPTY = {
  // ── Customer store ─────────────────────────────────────────
  cart: {
    eyebrow: "Carrito",
    title: "Arma tu pedido",
    description: "500+ productos esperan. Delivery en 25 min, pagás con Yape o efectivo al recibir.",
    cta: { label: "Ver catálogo", href: "/tienda" },
  },
  favorites: {
    eyebrow: "Favoritos",
    title: "Guarda tus favoritos",
    description: "Tocá el corazón en cualquier producto. Los verás aquí cuando vuelvas.",
    cta: { label: "Explorar productos", href: "/marketplace" },
  },
  ordersNoHistory: {
    eyebrow: "Mis pedidos",
    title: "Haz tu primer pedido",
    description: "Una vez que pidas, verás aquí el historial con estado y tiempos de entrega.",
    cta: { label: "Ir al marketplace", href: "/marketplace" },
  },
  ordersFiltered: {
    eyebrow: "Sin resultados",
    title: "Ningún pedido en este filtro",
    description: "Cambiá el filtro para ver otros pedidos.",
  },
  pointsNoBalance: {
    eyebrow: "Fidelidad",
    title: "Ganá puntos en cada compra",
    description: "Por cada S/10 de pedido, 1 punto. 100 puntos = S/5 de descuento.",
    cta: { label: "Hacer un pedido", href: "/marketplace" },
  },
  recipesNoResults: {
    eyebrow: "Recetario",
    title: "No encontramos esa receta",
    description: "Prueba con otro ingrediente o contanos qué plato quieres cocinar.",
    cta: { label: "Ver todas las recetas", href: "/marketplace/recetas" },
  },
  searchNoResults: (query: string) => ({
    eyebrow: "Búsqueda",
    title: `Nada coincide con "${query}"`,
    description: "Prueba con otra palabra, o contanos qué buscas por WhatsApp.",
    cta: { label: "Ver todo el catálogo", href: "/marketplace" },
  }),

  // ── Admin ──────────────────────────────────────────────────
  adminProductsNone: {
    eyebrow: "Inventario",
    title: "Agrega tu primer producto",
    description: "En 30 segundos tienes tu catálogo online. Empieza con lo que más vendes hoy.",
    cta: { label: "+ Nuevo producto" },
  },
  adminOrdersNone: {
    eyebrow: "Pedidos",
    title: "Todavía no hay pedidos",
    description: "Cuando llegue uno por WhatsApp o el marketplace, aparecerá aquí en tiempo real.",
    cta: { label: "Ver tienda online", href: "/" },
  },
  adminCustomersNone: {
    eyebrow: "Clientes",
    title: "Empieza tu base de clientes",
    description: "Cada vez que registres una venta, el cliente se guarda solo. O crea uno manual ahora.",
    cta: { label: "+ Nuevo cliente" },
  },
  adminCreditsNone: {
    eyebrow: "Fiados",
    title: "Sin créditos activos",
    description: "Tus clientes frecuentes pueden llevar productos al fiado. Se registra automático al cobrar.",
    cta: { label: "+ Nuevo fiado" },
  },
  adminReportsNone: {
    eyebrow: "Reportes",
    title: "Los reportes arrancan al tener ventas",
    description: "Con 1 semana de ventas ya empiezas a ver tendencias, productos top y horarios calientes.",
    cta: { label: "Ver demo con datos de ejemplo" },
  },
  adminAlertsNone: {
    eyebrow: "Alertas",
    title: "Todo al día",
    description: "Sin productos por vencer, stock crítico ni fiados atrasados. Buen trabajo.",
  },
  adminTableFiltered: {
    eyebrow: "Sin resultados",
    title: "Ningún registro en este filtro",
    description: "Ajusta los filtros o busca otro término.",
  },

  // ── Vendor / marketplace seller ────────────────────────────
  vendorOrdersPending: {
    eyebrow: "Pendientes",
    title: "Sin pedidos nuevos",
    description: "Cuando un cliente del marketplace pida de tu tienda, te avisaremos por WhatsApp y aparecerá aquí.",
    cta: { label: "Ver mi tienda pública", href: "/marketplace" },
  },
  vendorReviewsNone: {
    eyebrow: "Reseñas",
    title: "Las reseñas llegan tras los pedidos",
    description: "Después de cada entrega, el cliente califica. Las buenas reseñas te suben en el ranking del marketplace.",
  },

  // ── Delivery / repartidor ──────────────────────────────────
  driverAssignmentsNone: {
    eyebrow: "Repartos",
    title: "Sin entregas asignadas",
    description: "Cuando haya pedidos en tu zona, te avisaremos por WhatsApp. Mantené el WhatsApp activo.",
    cta: { label: "Ver zonas disponibles" },
  },
} as const satisfies Record<string, EmptyStateCopy | ((...args: never[]) => EmptyStateCopy)>;
