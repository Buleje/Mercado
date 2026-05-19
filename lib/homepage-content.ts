// Shared homepage content types and defaults used by both admin editor and storefront components

export type HomepageContent = {
  // Hero
  heroGreetingEnabled: boolean;
  heroTitle: string;
  heroTitleAccent: string;
  heroSubtitle: string;
  heroCta1Text: string;
  heroCta1Link: string;
  heroCta2Text: string;
  heroCta2Link: string;
  heroBadgeText: string;
  heroBadgeSubtext: string;
  // Stats
  statProducts: string;
  statClients: string;
  statOrders: string;
  statRating: string;
  // Products Preview
  previewBadge: string;
  previewTitle: string;
  previewTitleAccent: string;
  previewSubtitle: string;
  previewCtaText: string;
  // Footer
  footerDescription: string;
  footerWhatsApp: string;
  footerFacebook: string;
  footerInstagram: string;
  footerRating: string;
  footerClients: string;
  // Announcement Bar
  announcementMessages: { text: string; link: string; highlight: string }[];
  announcementEnabled: boolean;
  // Countdown Banner
  countdownEnabled: boolean;
  countdownTitle: string;
  countdownSubtitle: string;
  countdownCtaText: string;
  // FAQ
  faqItems: { question: string; answer: string }[];
  // Benefits
  benefitItems: { title: string; description: string; back?: string; stat?: number; statSuffix?: string; statLabel?: string }[];
  // Testimonials
  testimonialItems: { name: string; location: string; text: string; rating: number }[];
  // Flash Deals — admin-selected product IDs with discount %
  flashDealIds: number[];
  flashDealDiscount: number;
  // Exit Intent promo
  exitPromoCode: string;
  exitPromoMinAmount: number;
};

/**
 * Defaults genéricos para tiendas nuevas (tenants que no son "main").
 * No contiene datos de Pucallpa, FAQs específicas ni métricas inventadas.
 */
export const NEW_STORE_DEFAULTS: HomepageContent = {
  heroGreetingEnabled: true,
  heroTitle: "Bienvenido a",
  heroTitleAccent: "nuestra tienda",
  heroSubtitle: "Explora nuestros productos. Delivery disponible. ¡Haz tu pedido!",
  heroCta1Text: "Ver Productos",
  heroCta1Link: "/tienda",
  heroCta2Text: "Contactar",
  heroCta2Link: "#contacto",
  heroBadgeText: "",
  heroBadgeSubtext: "",
  statProducts: "0",
  statClients: "0",
  statOrders: "0",
  statRating: "5.0/5",
  previewBadge: "Destacados",
  previewTitle: "Nuestros",
  previewTitleAccent: "productos",
  previewSubtitle: "Encuentra todo lo que necesitas en un solo lugar.",
  previewCtaText: "Ver todos los productos",
  footerDescription: "Tu tienda online. Compra fácil y rápido.",
  footerWhatsApp: "",
  footerFacebook: "",
  footerInstagram: "",
  footerRating: "Nuevo",
  footerClients: "0",
  announcementMessages: [],
  announcementEnabled: false,
  countdownEnabled: false,
  countdownTitle: "OFERTAS DEL DÍA",
  countdownSubtitle: "¡Aprovecha antes de la medianoche!",
  countdownCtaText: "Ver ofertas",
  flashDealIds: [],
  flashDealDiscount: 0,
  exitPromoCode: "",
  exitPromoMinAmount: 0,
  faqItems: [],
  benefitItems: [],
  testimonialItems: [],
};

export const DEFAULT_HOMEPAGE: HomepageContent = {
  heroGreetingEnabled: true,
  heroTitle: "Tus abarrotes",
  heroTitleAccent: "en tu puerta",
  heroSubtitle: "+500 productos · Paga con Yape o efectivo · Delivery gratis desde S/50. ¡Haz tu pedido ahora!",
  heroCta1Text: "Explorar Tienda",
  heroCta1Link: "/tienda",
  heroCta2Text: "Pedir por WhatsApp",
  heroCta2Link: "https://wa.me/51929340532?text=Hola%2C%20quiero%20hacer%20un%20pedido",
  heroBadgeText: "Delivery GRATIS",
  heroBadgeSubtext: "Compras desde S/50",
  statProducts: "500+",
  statClients: "1200+",
  statOrders: "3500+",
  statRating: "4.8/5",
  previewBadge: "Lo más pedido",
  previewTitle: "Productos",
  previewTitleAccent: "destacados",
  previewSubtitle: "Los favoritos de nuestros clientes, siempre frescos y a los mejores precios.",
  previewCtaText: "Ver todos los productos",
  footerDescription: "Tienda virtual de abarrotes en Pucallpa. Delivery rápido, pago con Yape o efectivo.",
  footerWhatsApp: "https://wa.me/51929340532?text=Hola%2C%20quiero%20hacer%20un%20pedido",
  footerFacebook: "https://facebook.com",
  footerInstagram: "https://instagram.com",
  footerRating: "4.8 / 5 · +800 clientes",
  footerClients: "+800",
  announcementMessages: [
    { text: "🚚 Delivery gratis en compras desde S/50", link: "#productos", highlight: "S/50" },
    { text: "🎉 Nuevos productos cada semana — ¡Descúbrelos!", link: "#productos", highlight: "cada semana" },
    { text: "💳 Paga con Yape o efectivo contra entrega", link: "#productos", highlight: "Yape" },
    { text: "⭐ 4.8/5 — Los mejores precios de Pucallpa", link: "#testimonios", highlight: "4.8/5" },
  ],
  announcementEnabled: true,
  countdownEnabled: true,
  countdownTitle: "🔥 OFERTAS DEL DÍA",
  countdownSubtitle: "¡Aprovecha antes de la medianoche!",
  countdownCtaText: "Ver ofertas",
  flashDealIds: [],
  flashDealDiscount: 20,
  exitPromoCode: "BIENVENIDO",
  exitPromoMinAmount: 50,
  faqItems: [
    {
      question: "¿Hacen delivery de abarrotes en todo Pucallpa?",
      answer: "Sí, realizamos delivery de abarrotes en toda la zona urbana de Pucallpa. Nuestro servicio de entrega a domicilio cubre la mayoría de barrios y urbanizaciones. Consulta por WhatsApp si tienes dudas sobre la cobertura en tu zona.",
    },
    {
      question: "¿Se puede pagar con Yape?",
      answer: "¡Por supuesto! Aceptamos pagos con Yape para tu comodidad. También puedes pagar en efectivo contra entrega. Somos una tienda con Yape en Pucallpa para que compres de forma fácil y segura.",
    },
    {
      question: "¿También aceptan efectivo contra entrega?",
      answer: "Sí, aceptamos pago en efectivo al momento de la entrega. Nuestro repartidor llevará tu pedido y podrás pagarlo en el momento. Es una opción ideal si prefieres no usar medios digitales.",
    },
    {
      question: "¿Qué productos venden?",
      answer: "Vendemos una amplia variedad de productos: abarrotes, bebidas, golosinas, carne, pollo, productos de limpieza, artículos para el hogar, snacks y más. Todo lo que necesitas para tu hogar o negocio lo encuentras en nuestra tienda virtual.",
    },
  ],
  benefitItems: [
    { title: "Delivery Rápido", description: "Entrega a domicilio en toda la zona urbana de Pucallpa. Recibe tus abarrotes, bebidas y productos en tu puerta.", back: "Tiempo estimado: ~30 min en zona urbana de Pucallpa. Sin costo adicional en pedidos mayores a S/50.", stat: 30, statSuffix: " min", statLabel: "entrega promedio" },
    { title: "Pago con Yape o Efectivo", description: "Paga fácil con Yape o en efectivo contra entrega. Compra online sin complicaciones.", back: "Aceptamos Yape, Plin y efectivo. Sin tarjetas, sin cargos, sin complicaciones.", stat: 0, statSuffix: " comisiones", statLabel: "sin comisiones extra" },
    { title: "Calidad Garantizada", description: "Productos seleccionados y verificados: abarrotes, golosinas, carne, pollo y más para tu familia.", back: "Si no estás satisfecho, te devolvemos tu dinero. Revisamos cada pedido antes de enviarlo.", stat: 100, statSuffix: "%", statLabel: "satisfacción" },
    { title: "Productos Frescos", description: "Frutas, verduras y carnes frescas seleccionadas diariamente para tu mesa.", back: "Stock renovado cada mañana. Trabajamos con proveedores locales de Pucallpa y Ucayali.", stat: 500, statSuffix: "+", statLabel: "productos en stock" },
  ],
  testimonialItems: [
    { name: "María López", location: "Yarinacocha", text: "Excelente servicio, los productos llegan frescos y a buen precio. Ya no necesito ir al mercado.", rating: 5 },
    { name: "Carlos Ramírez", location: "Manantay", text: "Pedir por WhatsApp es súper fácil. En menos de una hora ya tenía todo en mi casa. ¡Recomendado!", rating: 5 },
    { name: "Ana Gutiérrez", location: "Callería", text: "La calidad de las frutas y verduras es increíble. Se nota que seleccionan lo mejor. Cliente fija.", rating: 5 },
  ],
};
