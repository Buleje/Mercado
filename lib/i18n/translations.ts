/**
 * translations.ts — Diccionario multi-idioma ligero (~60 keys).
 *
 * Soporta:
 *   - es  Español (default)
 *   - en  English
 *   - shi Shipibo-Konibo (lengua originaria amazónica de Pucallpa)
 *   - qu  Runa Simi / Quechua sureño chanka (Perú: ~4M hablantes)
 *
 * Brandon decisión 2026-05-02: agregar quechua amplía alcance al
 * mercado andino e identidad nacional. Variedad chanka (Ayacucho /
 * Huancavelica / Apurímac) por ser la mas neutral entre las 6 variedades
 * del Perú. Las traducciones quechuas viven en `translations-qu.ts`
 * como overlay — se agregan progresivamente sin bloquear el typing.
 *
 * ADR-068: 0 emojis, tokens CSS only.
 */

import { QU_OVERRIDES } from "./translations-qu";

export type Locale = "es" | "en" | "shi" | "qu";

export const LOCALES: Locale[] = ["es", "en", "shi", "qu"];

export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
  shi: "Shipibo-Konibo",
  qu: "Runa Simi",
};

export const LOCALE_SHORT: Record<Locale, string> = {
  es: "ES",
  en: "EN",
  shi: "SHI",
  qu: "QU",
};

// Quechua es overlay opcional: las keys sin traducción caen a español.
type TranslationEntry = Record<"es" | "en" | "shi", string>;

export const TRANSLATIONS: Record<string, TranslationEntry> = {
  // ── Navegación ─────────────────────────────────────────────────────────
  "nav.home": { es: "Inicio", en: "Home", shi: "Nete" },
  "nav.stores": { es: "Bodegas", en: "Stores", shi: "Xobo" },
  "nav.shopDirectory": { es: "Tiendas", en: "Shops", shi: "Xobo" },
  "nav.explore": { es: "Explorar", en: "Explore", shi: "Benakoi" },
  "nav.discover": { es: "Descubrí", en: "Discover", shi: "Ikai" },
  "nav.more": { es: "Más", en: "More", shi: "Bewa" },
  "nav.recipes": { es: "Recetas", en: "Recipes", shi: "Piti kirika" },
  "nav.about": { es: "Nosotros", en: "About us", shi: "Noa" },
  "nav.account": { es: "Mi cuenta", en: "My account", shi: "Noa kirika" },
  "nav.cart": { es: "Carrito", en: "Cart", shi: "Yoi" },
  "nav.orders": { es: "Mis pedidos", en: "My orders", shi: "Payowan" },
  "nav.favorites": { es: "Favoritos", en: "Favorites", shi: "Noi" },
  "nav.openStore": { es: "Abre tu tienda", en: "Open your store", shi: "Mi xobo" },
  "nav.business": { es: "Negocios", en: "Business", shi: "Tsain" },
  "nav.socio": { es: "Socio", en: "Membership", shi: "Jawen" },
  "nav.login": { es: "Ingresar", en: "Sign in", shi: "Ichinon" },
  "nav.logout": { es: "Cerrar sesión", en: "Sign out", shi: "Kenai" },
  "nav.search": { es: "Buscar", en: "Search", shi: "Benati" },
  "nav.searchPlaceholder": {
    es: "Busca productos o tiendas en Pucallpa...",
    en: "Search products or stores in Pucallpa...",
    shi: "Benati piti, xobo Pucallpa...",
  },
  "nav.darkMode": { es: "Modo oscuro", en: "Dark mode", shi: "Jonipakoi" },
  "nav.lightMode": { es: "Modo claro", en: "Light mode", shi: "Pakoi" },
  "nav.live": { es: "En Vivo", en: "Live", shi: "Kikini" },
  "nav.offers": { es: "Ofertas", en: "Offers", shi: "Rawe" },
  "nav.howToPay": { es: "Cómo pagar", en: "How to pay", shi: "Akiranki kopiti" },
  "nav.new": { es: "Nuevo", en: "New", shi: "Bena" },
  "nav.liveNow": { es: "Transmisión en vivo activa", en: "Live broadcast active", shi: "Kikini iki" },
  "nav.notifications": { es: "Notificaciones", en: "Notifications", shi: "Yoiti" },
  "nav.subscriptions": { es: "Suscripciones", en: "Subscriptions", shi: "Jene kirika" },

  // ── Cart / Carrito ────────────────────────────────────────────────────
  "cart.add": { es: "Agregar al carrito", en: "Add to cart", shi: "Yoimea" },
  "cart.added": { es: "Agregado", en: "Added", shi: "Yoisa" },
  "cart.empty": { es: "Tu carrito está vacío", en: "Your cart is empty", shi: "Yoi mashko iki" },
  "cart.total": { es: "Total", en: "Total", shi: "Tukuy" },
  "cart.checkout": { es: "Continuar compra", en: "Checkout", shi: "Rantikuy" },
  "cart.quantity": { es: "Cantidad", en: "Quantity", shi: "Hakia" },
  "cart.remove": { es: "Quitar", en: "Remove", shi: "Raokoi" },
  "cart.viewCart": { es: "Ver carrito", en: "View cart", shi: "Yoi oina" },

  // ── Product / Producto ────────────────────────────────────────────────
  "product.outOfStock": { es: "Agotado", en: "Out of stock", shi: "Yamawe" },
  "product.buyNow": { es: "Comprar ahora", en: "Buy now", shi: "Kunan rantiy" },
  "product.buyOneClick": { es: "Comprar ya en 1 click", en: "Buy now in 1-click", shi: "Rantiy" },
  "product.wishlist": { es: "Guardar en favoritos", en: "Save to favorites", shi: "Noi iki" },
  "product.inWishlist": { es: "En favoritos", en: "In favorites", shi: "Noi kai" },
  "product.share": { es: "Compartir", en: "Share", shi: "Rantinoax" },
  "product.reviews": { es: "Reseñas", en: "Reviews", shi: "Yoia" },
  "product.related": { es: "Productos relacionados", en: "Related products", shi: "Piti noi" },

  // ── Checkout ──────────────────────────────────────────────────────────
  "checkout.address": { es: "Dirección", en: "Address", shi: "Wasi" },
  "checkout.payment": { es: "Método de pago", en: "Payment method", shi: "Qullqi" },
  "checkout.delivery": { es: "Envío", en: "Delivery", shi: "Bewati" },
  "checkout.confirm": { es: "Confirmar compra", en: "Confirm purchase", shi: "Arí nisun" },
  "checkout.deliveryFee": { es: "Costo de envío", en: "Delivery fee", shi: "Bewati qullqi" },
  "checkout.free": { es: "Gratis", en: "Free", shi: "Yama" },
  "checkout.guestCta": { es: "Comprar sin crear cuenta", en: "Buy as guest", shi: "Rantiy kena" },

  // ── Post-Purchase ─────────────────────────────────────────────────────
  "postPurchase.thanks": { es: "Gracias por tu pedido", en: "Thank you for your order", shi: "Sulpayki rantisqayki" },
  "postPurchase.orderNumber": { es: "Número de pedido", en: "Order number", shi: "Payowan numero" },
  "postPurchase.trackOrder": { es: "Ver seguimiento", en: "Track order", shi: "Maypi kachkan" },
  "postPurchase.keepShopping": { es: "Seguir comprando", en: "Keep shopping", shi: "Rantiy kutin" },
  "postPurchase.share": { es: "Compartir", en: "Share", shi: "Rantinoax" },
  "postPurchase.alsoBought": {
    es: "Gente que compró esto también lleva",
    en: "People who bought this also buy",
    shi: "Hawee rantiwoax",
  },
  "postPurchase.addToNext": { es: "Agregar a próximo pedido", en: "Add to next order", shi: "Payowan yoimea" },
  "postPurchase.exploreMore": { es: "Explorar más productos", en: "Explore more products", shi: "Benakoi" },

  // ── Reorder ───────────────────────────────────────────────────────────
  "reorder.cta": { es: "Comprar de nuevo", en: "Buy again", shi: "Rantiy kutin" },
  "reorder.confirm": { es: "Confirmar pedido", en: "Confirm order", shi: "Arí nisun" },
  "reorder.title": { es: "Volver a comprar", en: "Reorder", shi: "Rantiy kutin" },

  // ── Auth ──────────────────────────────────────────────────────────────
  "auth.welcome": { es: "Bienvenido", en: "Welcome", shi: "Nono bewakoiki" },
  "auth.register": { es: "Registrarse", en: "Sign up", shi: "Qillqakuy" },

  // ── Common ────────────────────────────────────────────────────────────
  "common.loading": { es: "Cargando...", en: "Loading...", shi: "Suyachkani..." },
  "common.start": { es: "Empezar", en: "Start", shi: "Qallariy" },
  "common.see": { es: "Ver", en: "See", shi: "Qaway" },
  "common.month": { es: "mes", en: "month", shi: "killa" },
  "common.year": { es: "año", en: "year", shi: "wata" },
  "common.day": { es: "día", en: "day", shi: "punchaw" },
  "common.firstMonthFree": { es: "Primer mes gratis", en: "First month free", shi: "Ñawpaq killa mana paguspa" },
  "common.noCard": { es: "Sin tarjeta", en: "No card", shi: "Mana tarjeta" },
  "common.cancelAnytime": { es: "Cancelás cuando quieras", en: "Cancel anytime", shi: "Ima horatapas sayachiy" },
  "common.save": { es: "Guardar", en: "Save", shi: "Waqaychay" },
  "common.cancel": { es: "Cancelar", en: "Cancel", shi: "Amakoi" },
  "common.edit": { es: "Editar", en: "Edit", shi: "Ya'kati" },
  "common.close": { es: "Cerrar", en: "Close", shi: "Kenai" },
  "common.back": { es: "Volver", en: "Back", shi: "Kutiy" },
  "common.continue": { es: "Continuar", en: "Continue", shi: "Qatiy" },
  "common.success": { es: "Listo", en: "Success", shi: "Kushika" },
  "common.error": { es: "Ocurrió un error", en: "An error occurred", shi: "Pantasqa" },

  // ── Footer ────────────────────────────────────────────────────────────
  "footer.categories": { es: "Categorías", en: "Categories", shi: "Kirika" },
  "footer.quickLinks": { es: "Enlaces rápidos", en: "Quick links", shi: "Enlaces" },
  "footer.contact": { es: "Contacto", en: "Contact", shi: "Contacto" },
  "footer.copyright": {
    es: "Todos los derechos reservados",
    en: "All rights reserved",
    shi: "Todos los derechos reservados",
  },

  // ── Landing Header ────────────────────────────────────────────────────
  "landing.nav.howItWorks": { es: "Cómo funciona", en: "How it works", shi: "Akiranki" },
  "landing.nav.plans": { es: "Planes", en: "Plans", shi: "Planes" },
  "landing.nav.faq": { es: "FAQ", en: "FAQ", shi: "FAQ" },
  "landing.nav.openStore": { es: "Abre tu Tienda", en: "Open your Store", shi: "Mi xobo kichay" },
  "landing.nav.inicio": { es: "Inicio", en: "Home", shi: "Yoba" },
  "landing.nav.tiendas": { es: "Tiendas", en: "Stores", shi: "Xobokoni" },
  "landing.nav.negocios": { es: "Negocios", en: "Business", shi: "Tsain" },
  "landing.nav.conoceBuleje": { es: "Conocé Buleje", en: "Learn more", shi: "Onan Buleje" },
  "landing.nav.signin": { es: "Ingresar", en: "Sign in", shi: "Ichinon" },
  "landing.nav.startStore": { es: "Empezar mi tienda", en: "Start my store", shi: "Mi xobo kichay" },

  // ── Landing Hero ──────────────────────────────────────────────────────
  "landing.hero.kicker": { es: "Plataforma todo-en-uno", en: "All-in-one platform", shi: "Plataforma" },
  "landing.hero.title1": { es: "Más clientes.", en: "More customers.", shi: "Más" },
  "landing.hero.title2": { es: "Más pedidos.", en: "More orders.", shi: "Más" },
  "landing.hero.titleAccent": { es: "Cero tecnología.", en: "Zero tech.", shi: "Cero" },
  "landing.hero.description": {
    es: "Catálogo, pagos Yape, delivery y reportes — todo listo en 5 minutos. Tú te enfocás en vender.",
    en: "Catalog, Yape payments, delivery and reports — all ready in 5 minutes. You focus on selling.",
    shi: "Catalogo, pagos, delivery, todo listo.",
  },
  "landing.hero.ctaPrimary": { es: "Prueba el primer mes sin pagar", en: "Try the first month free", shi: "Prueba" },
  "landing.hero.ctaSecondary": { es: "Ver demo", en: "See demo", shi: "Ver demo" },

  // ── Landing — Stats Marquee ──────────────────────────────────────────
  "landing.stats.kicker": { es: "Buleje en números", en: "Buleje in numbers", shi: "Buleje" },
  "landing.stats.headline1": { es: "Un marketplace,", en: "One marketplace,", shi: "Un marketplace," },
  "landing.stats.headline2": { es: "miles de historias.", en: "thousands of stories.", shi: "miles de historias." },
  "landing.stats.description": {
    es: "Cada bodega es una familia, cada pedido un paso adelante. Estos son los números que ya construimos juntos en Pucallpa y Ciudad Constitución.",
    en: "Every store is a family, every order a step forward. These are the numbers we already built together in Pucallpa and Ciudad Constitución.",
    shi: "Cada bodega es una familia. Pucallpa.",
  },
  "landing.stats.activeStores": { es: "Tiendas activas", en: "Active stores", shi: "Xobo" },
  "landing.stats.products": { es: "Productos", en: "Products", shi: "Piti" },
  "landing.stats.rating": { es: "Rating promedio", en: "Average rating", shi: "Rating" },
  "landing.stats.coverage": { es: "Cobertura local", en: "Local coverage", shi: "Cobertura" },

  // ── Landing — Categorías populares ────────────────────────────────────
  "landing.categories.kicker": { es: "Categorías populares", en: "Popular categories", shi: "Kirika" },
  "landing.categories.title": { es: "Pide lo que", en: "Order what you", shi: "Pide" },
  "landing.categories.titleAccent": { es: "necesitas.", en: "need.", shi: "necesitas." },
  "landing.categories.description": {
    es: "Productos de todas las bodegas, organizados para que los encuentres al toque.",
    en: "Products from every store, organized so you find them in a tap.",
    shi: "Piti.",
  },

  // ── Landing — Final CTA ────────────────────────────────────────────────
  "landing.finalCta.kicker": { es: "Empieza hoy", en: "Start today", shi: "Empieza hoy" },
  "landing.finalCta.title1": { es: "Tu negocio merece", en: "Your business deserves", shi: "Tu negocio" },
  "landing.finalCta.titleAccent": { es: "algo más grande.", en: "something bigger.", shi: "algo más grande." },
  "landing.finalCta.description": {
    es: "Activa tu tienda online en 5 minutos y empieza a recibir pedidos hoy mismo. Sin tarjeta, sin compromiso.",
    en: "Activate your online store in 5 minutes and start receiving orders today. No card, no commitment.",
    shi: "Activa tu tienda.",
  },
  "landing.finalCta.tryFree": { es: "Prueba gratis 90 días", en: "Try free for 90 days", shi: "Prueba 90 días" },
  "landing.finalCta.openStore": { es: "Abre tu tienda", en: "Open your store", shi: "Abre tu tienda" },

  // ── Landing — Métodos de pago ────────────────────────────────────────
  "landing.payment.kicker": { es: "Formas de pago", en: "Payment methods", shi: "Pago" },
  "landing.payment.title": { es: "Pagas como", en: "Pay how", shi: "Pago" },
  "landing.payment.titleAccent": { es: "tú quieras.", en: "you want.", shi: "tú quieras." },
  "landing.payment.description": {
    es: "Cuatro maneras de pagar sin complicaciones. Eliges al momento del checkout — no hay cargos ocultos.",
    en: "Four ways to pay with no fuss. Choose at checkout — no hidden charges.",
    shi: "Pago.",
  },
  "landing.payment.yape": { es: "Yape", en: "Yape", shi: "Yape" },
  "landing.payment.yapeDesc": { es: "Transferencia al instante", en: "Instant transfer", shi: "Yape" },
  "landing.payment.plin": { es: "Plin", en: "Plin", shi: "Plin" },
  "landing.payment.plinDesc": { es: "Desde tu app del banco", en: "From your bank app", shi: "Plin" },
  "landing.payment.cash": { es: "Efectivo", en: "Cash", shi: "Qullqi" },
  "landing.payment.cashDesc": { es: "Contra entrega", en: "On delivery", shi: "Qullqi" },
  "landing.payment.card": { es: "Tarjeta", en: "Card", shi: "Tarjeta" },
  "landing.payment.cardDesc": { es: "Débito y crédito", en: "Debit and credit", shi: "Tarjeta" },

  // ── Cómo funciona section ───────────────────────────────────────────
  "landing.how.kicker": { es: "Cómo funciona", en: "How it works", shi: "Akiranki" },
  "landing.how.title": { es: "Cuatro pasos.", en: "Four steps.", shi: "Tawa thaski." },
  "landing.how.titleAccent": { es: "Cero fricción.", en: "Zero friction.", shi: "Mana sasa." },
  "landing.how.description": {
    es: "De abrir tu negocio online a cobrar el primer pedido — todo en una tarde.",
    en: "From opening your online business to collecting the first order — all in one afternoon.",
    shi: "Una tarde.",
  },
  "landing.how.step": { es: "Paso", en: "Step", shi: "Thaski" },
  "landing.how.step1.title": { es: "Activás tu negocio", en: "Activate your business", shi: "Negocioyki kichay" },
  "landing.how.step1.desc": { es: "Logo, catálogo y horarios. Listo en 5 minutos.", en: "Logo, catalog and hours. Ready in 5 minutes.", shi: "Logo. 5 minutos." },
  "landing.how.step1.tag": { es: "Setup", en: "Setup", shi: "Setup" },
  "landing.how.step2.title": { es: "Atraés clientes", en: "Attract customers", shi: "Rantiqkuna" },
  "landing.how.step2.desc": { es: "Aparecés en buscadores, mapa y app sin pagar publicidad.", en: "You show up in searches, map and app — no paid ads.", shi: "Buscadores." },
  "landing.how.step2.tag": { es: "Crecimiento", en: "Growth", shi: "Wiñay" },
  "landing.how.step3.title": { es: "Cobrás al instante", en: "Get paid instantly", shi: "Pagay utqay" },
  "landing.how.step3.desc": { es: "Yape, Plin, tarjeta o efectivo. Cero comisiones por 90 días.", en: "Yape, Plin, card or cash. Zero fees for 90 days.", shi: "Yape." },
  "landing.how.step3.tag": { es: "Pagos", en: "Payments", shi: "Pago" },
  "landing.how.step4.title": { es: "Entregás sin estrés", en: "Deliver stress-free", shi: "Apachiy" },
  "landing.how.step4.desc": { es: "Tus repartidores, los nuestros, o ambos. Tracking en vivo.", en: "Your couriers, ours, or both. Live tracking.", shi: "Apachiy." },
  "landing.how.step4.tag": { es: "Delivery", en: "Delivery", shi: "Delivery" },
  "landing.how.stat1.value": { es: "5 min", en: "5 min", shi: "5 min" },
  "landing.how.stat1.label": { es: "Tiempo de setup", en: "Setup time", shi: "Setup" },
  "landing.how.stat2.value": { es: "S/ 0", en: "S/ 0", shi: "S/ 0" },
  "landing.how.stat2.label": { es: "Comisión 90 días", en: "Fees 90 days", shi: "Mana pagana 90" },
  "landing.how.stat3.value": { es: "24/7", en: "24/7", shi: "24/7" },
  "landing.how.stat3.label": { es: "Soporte por WhatsApp", en: "WhatsApp support", shi: "Soporte" },
  "landing.how.cta": { es: "Prueba el primer mes sin pagar", en: "Try the first month free", shi: "Prueba" },

  // ── Promo Banners (Sumate a Buleje) ─────────────────────────────────
  "landing.promo.business.kicker": { es: "Para dueños", en: "For owners", shi: "Dueños" },
  "landing.promo.business.title1": { es: "Vendé sin comisión", en: "Sell with no fees", shi: "Rantichiy" },
  "landing.promo.business.titleAccent": { es: "los primeros 90 días.", en: "the first 90 days.", shi: "ñawpaq 90." },
  "landing.promo.business.desc": {
    es: "Tu bodega online en 5 minutos. Yape, efectivo, delivery propio. Cero costo fijo.",
    en: "Your online store in 5 minutes. Yape, cash, your own delivery. Zero fixed cost.",
    shi: "Tu bodega online.",
  },
  "landing.promo.business.stat": { es: "S/ 0", en: "S/ 0", shi: "S/ 0" },
  "landing.promo.business.statLabel": { es: "comisión 90 días", en: "fees 90 days", shi: "90 días" },
  "landing.promo.business.cta": { es: "Abrir mi tienda gratis", en: "Open my store free", shi: "Abrir gratis" },
  "landing.promo.business.cta2": { es: "Ver planes", en: "See plans", shi: "Plankuna" },
  "landing.promo.driver.kicker": { es: "Para repartidores", en: "For couriers", shi: "Repartidores" },
  "landing.promo.driver.title1": { es: "Tu moto, tu horario,", en: "Your bike, your hours,", shi: "Mi moto" },
  "landing.promo.driver.titleAccent": { es: "tu ingreso extra.", en: "your extra income.", shi: "qullqi" },
  "landing.promo.driver.desc": {
    es: "Recibí pedidos cerca tuyo. Cobrás cada viaje + propinas. Sin jefe, sin esperas.",
    en: "Receive orders near you. Earn per trip + tips. No boss, no waiting.",
    shi: "Pedidos cerca tuyo.",
  },
  "landing.promo.driver.stat": { es: "S/ 6", en: "S/ 6", shi: "S/ 6" },
  "landing.promo.driver.statLabel": { es: "tarifa base por viaje", en: "base fare per trip", shi: "tarifa" },
  "landing.promo.driver.cta": { es: "Quiero ser repartidor", en: "I want to be a courier", shi: "Repartidor kayta munani" },

  // ── Planes section ──────────────────────────────────────────────────
  "landing.plans.kicker": { es: "Planes", en: "Plans", shi: "Plankuna" },
  "landing.plans.title": { es: "Prueba un mes,", en: "Try one month,", shi: "Killata probay" },
  "landing.plans.titleAccent": { es: "pagá solo si te conviene.", en: "pay only if it fits.", shi: "pagay" },
  "landing.plans.description": {
    es: "Cambiás de plan cuando quieras. Sin contratos, sin permanencia, sin sorpresas en la factura.",
    en: "Change your plan anytime. No contracts, no lock-in, no billing surprises.",
    shi: "Cambia plan.",
  },
  "landing.plans.compare": { es: "Ver comparativa completa", en: "See full comparison", shi: "Comparativa" },

  // ── FAQ section ──────────────────────────────────────────────────────
  "landing.faq.kicker": { es: "Preguntas frecuentes", en: "Frequently asked", shi: "Tapuykuna" },
  "landing.faq.title": { es: "Lo que más", en: "What people", shi: "Tapuykuna" },
  "landing.faq.titleAccent": { es: "nos preguntan.", en: "ask us most.", shi: "tapuwanku." },

  // ── Nosotros section ────────────────────────────────────────────────
  "landing.about.kicker": { es: "Nosotros", en: "About us", shi: "Ñuqayku" },
  "landing.about.title": { es: "Hecho desde", en: "Made from", shi: "Pucallpamanta" },
  "landing.about.titleAccent": { es: "Pucallpa.", en: "Pucallpa.", shi: "Pucallpa." },

  // ── Plans (PlansToggle component) ───────────────────────────────────
  "plans.kicker": { es: "Planes hechos para crecer", en: "Plans built to grow", shi: "Plankuna" },
  "plans.monthly": { es: "Mensual", en: "Monthly", shi: "Killa" },
  "plans.annual": { es: "Anual", en: "Annual", shi: "Wata" },
  "plans.upTo25off": { es: "Hasta -25%", en: "Up to -25%", shi: "Hasta -25%" },
  "plans.allInclude": {
    es: "Todos los planes incluyen actualizaciones, soporte y backups diarios · Cancelás en 1 click sin preguntas.",
    en: "All plans include updates, support and daily backups · Cancel in 1 click, no questions asked.",
    shi: "Tukuy plankuna incluyen actualizaciones.",
  },
  "plans.mostChosen": { es: "Más elegido", en: "Most chosen", shi: "Más" },
  "plans.firstMonthFree": { es: "1er mes gratis", en: "1st month free", shi: "1 killa mana paguy" },
  "plans.firstMonth": { es: "1er mes", en: "1st month", shi: "1 killa" },
  "plans.idealFor": { es: "Ideal para", en: "Ideal for", shi: "Allinmi" },
  "plans.tagline.basico": {
    es: "El que recién arranca y quiere probar sin arriesgar un sol",
    en: "Just starting out and want to try without risking a cent",
    shi: "Buleje qhaway",
  },
  "plans.tagline.pro": {
    es: "La bodega que ya vende a diario y quiere dejar el cuaderno",
    en: "The shop that already sells daily and wants to ditch the notebook",
    shi: "Bodega punchaw",
  },
  "plans.tagline.enterprise": {
    es: "El negocio establecido que quiere facturar y vender más",
    en: "An established business that wants to invoice and sell more",
    shi: "Bodega seguro",
  },
  "plans.tagline.max": {
    es: "Cadenas, mayoristas y productores con varios locales",
    en: "Chains, wholesalers and producers with several locations",
    shi: "Cadena · mana límite",
  },
  "plans.afterMonthly": {
    es: "Después · cancelás cuando quieras",
    en: "Then · cancel anytime",
    shi: "Qhipaman · sayachiy",
  },
  "plans.noCardAfter": {
    es: "Sin tarjeta · después si te gusta",
    en: "No card · then if you like it",
    shi: "Mana tarjeta",
  },
  "plans.savings": {
    es: "Ahorrás al año",
    en: "You save per year",
    shi: "Waqaychay",
  },
  "plans.cta.basico": { es: "Empezar gratis", en: "Start free", shi: "Qallariy" },
  "plans.cta.pro": { es: "Empezar con Starter", en: "Start with Starter", shi: "Starter qallariy" },
  "plans.cta.enterprise": { es: "Elegir Pro", en: "Choose Pro", shi: "Pro akllay" },
  "plans.cta.max": { es: "Hablar con un experto", en: "Talk to an expert", shi: "Expertowan rimay" },

  // ── Nosotros section ────────────────────────────────────────────────
  "about.kicker": { es: "Nosotros", en: "About us", shi: "Ñuqayku" },
  "about.headline1": { es: "El sistema que pone", en: "The system that gets", shi: "Sistema" },
  "about.headlineAccent": { es: "a vender tu negocio.", en: "your business selling.", shi: "rantichiy negocioyki." },
  "about.subheadline": {
    es: "Catálogo, pagos, delivery, repartidores y reportes — en una sola plataforma. Tú vendes, nosotros nos ocupamos de la tecnología.",
    en: "Catalog, payments, delivery, couriers and reports — all on one platform. You sell, we handle the tech.",
    shi: "Catalogu, pago, delivery, willaykuna — huk plataformapi.",
  },
  "about.noCode.bold": {
    es: "No te pedimos que aprendas a programar.",
    en: "We don't ask you to learn to code.",
    shi: "Mana programaqta yachachisqayki.",
  },
  "about.noCode.middle": {
    es: "Te damos la plataforma lista para que",
    en: "We give you the ready platform so you can",
    shi: "Plataforma listo qosayki",
  },
  "about.noCode.benefits": {
    es: "vendes más, gastas menos y atiendes mejor",
    en: "sell more, spend less and serve better",
    shi: "astawan rantichiy, pisi gastay, allin atender",
  },
  "about.tools": {
    es: "Cada herramienta — catálogo, Yape, delivery, reportes, fiados — pensada para que tu negocio crezca sin contratar técnicos ni pagar mensualidad. Si quieres probarla, son 5 minutos.",
    en: "Every tool — catalog, Yape, delivery, reports, store credit — designed so your business grows without hiring techs or paying monthly fees. Try it: 5 minutes.",
    shi: "Sapa herramienta. 5 minutos.",
  },
  "about.value1.title": { es: "Tus clientes, tus reglas", en: "Your customers, your rules", shi: "Rantiqniyki, kamachiyniyki" },
  "about.value1.desc": {
    es: "Vendés directo, sin intermediarios. Nosotros ponemos la tecnología; tú decidís precios, promociones y delivery.",
    en: "Sell direct, no middlemen. We provide the tech; you decide prices, promos and delivery.",
    shi: "Mana intermediario.",
  },
  "about.value2.title": { es: "Llegás a más vecinos", en: "Reach more neighbors", shi: "Astawan vecinokuna" },
  "about.value2.desc": {
    es: "Tu negocio aparece en el mapa, en buscadores y en el celular de quien necesita lo que vendes.",
    en: "Your business shows up on the map, in searches and on the phone of who needs what you sell.",
    shi: "Mapapi, buscador-pipas.",
  },
  "about.value3.title": { es: "Conocés a quien te compra", en: "Know who buys from you", shi: "Riqsiy rantiqkunata" },
  "about.value3.desc": {
    es: "Historial, reseñas y notas por cliente. Recordás cumpleaños, productos favoritos y los recompensás.",
    en: "History, reviews and notes per customer. Remember birthdays, favorite products and reward them.",
    shi: "Historial. Cumpleaños.",
  },
  "about.value4.title": { es: "Sin burocracia", en: "No bureaucracy", shi: "Mana burocracia" },
  "about.value4.desc": {
    es: "Registro en 5 minutos. Sin contratos, sin mínimos, sin letra chica.",
    en: "Sign up in 5 minutes. No contracts, no minimums, no fine print.",
    shi: "5 minutos. Mana contrato.",
  },

  // ── FAQ section ──────────────────────────────────────────────────────
  "faq.kicker": { es: "Preguntas", en: "Questions", shi: "Tapuykuna" },
  "faq.title": { es: "Todo lo que", en: "Everything you", shi: "Tukuy" },
  "faq.titleAccent": { es: "quieres saber.", en: "want to know.", shi: "yachayta munanki." },
  "faq.subhead": {
    es: "Si no encontrás tu respuesta, escríbenos — somos humanos, no bots.",
    en: "If you don't find your answer, write to us — we're humans, not bots.",
    shi: "Qillqamuwayku.",
  },
  "faq.writeWhatsapp": { es: "Escríbenos por WhatsApp", en: "Write us on WhatsApp", shi: "WhatsApp qillqay" },
  "faq.moreQuestions": { es: "¿Más preguntas?", en: "More questions?", shi: "Astawan tapuykuna?" },
  "faq.dontDoubt": { es: "No te quedes con la duda.", en: "Don't be left with doubts.", shi: "Mana iskayrayanki." },
  "faq.teamResponds": {
    es: "Nuestro equipo responde personalmente en menos de 2 horas. Sin bots, sin formularios largos.",
    en: "Our team responds personally in less than 2 hours. No bots, no long forms.",
    shi: "Equipo respond.",
  },
  "faq.directWhatsapp": { es: "WhatsApp directo", en: "Direct WhatsApp", shi: "WhatsApp" },
  "faq.cat1.label": { es: "Vendé más", en: "Sell more", shi: "Astawan rantichiy" },
  "faq.cat1.q1": { es: "¿Cómo me ayuda Buleje a atraer clientes?", en: "How does Buleje help me attract customers?", shi: "Imayna Buleje rantiqkunata?" },
  "faq.cat1.a1": {
    es: "Tu negocio aparece en buscadores, mapa local y app. Cupones, ofertas del día y notificaciones push automáticas. Tus clientes te encuentran sin que pagues publicidad.",
    en: "Your business shows in searches, local map and app. Coupons, daily offers and automatic push notifications. Customers find you without paying for ads.",
    shi: "Mapapi rikhurinki.",
  },
  "faq.cat1.q2": { es: "¿Qué pasa si ya tengo clientes fieles?", en: "What if I already have loyal customers?", shi: "Achka rantiqkuna kapuwantin?" },
  "faq.cat1.a2": {
    es: "Buleje los retiene mejor: historial de compras, recordatorios, cumpleaños y promociones personalizadas. Convertís compradores ocasionales en habituales.",
    en: "Buleje retains them better: purchase history, reminders, birthdays and personalized promos. Turn occasional buyers into regulars.",
    shi: "Astawan retención.",
  },
  "faq.cat1.q3": { es: "¿Qué herramientas vienen incluidas?", en: "What tools come included?", shi: "Ima herramientas incluyen?" },
  "faq.cat1.a3": {
    es: "Catálogo, inventario, caja, cobros Yape/Plin/tarjeta, repartidores, reportes, reseñas, fiados, cupones, multi-sucursal. Todo en una sola app.",
    en: "Catalog, inventory, cash register, Yape/Plin/card payments, couriers, reports, reviews, store credit, coupons, multi-branch. All in one app.",
    shi: "Tukuy huk app-pi.",
  },
  "faq.cat1.q4": { es: "¿Funciona en cualquier ciudad del Perú?", en: "Does it work in any Peruvian city?", shi: "Tukuy llaqtapi?" },
  "faq.cat1.a4": {
    es: "Sí. Cualquier negocio del Perú puede activar su tienda en 5 minutos y empezar a recibir pedidos hoy.",
    en: "Yes. Any business in Peru can activate its store in 5 minutes and start receiving orders today.",
    shi: "Arí. 5 minutos.",
  },
  "faq.cat2.label": { es: "Precios y planes", en: "Prices and plans", shi: "Chanin, plankuna" },
  "faq.cat2.q1": { es: "¿Cuánto cuesta usar Buleje?", en: "How much does Buleje cost?", shi: "Hayk'ataq?" },
  "faq.cat2.a1": {
    es: "Plan Gratis con 0% de comisión por 90 días. Plan Pro S/ 49/mes con herramientas avanzadas. Plan Enterprise a medida. Sin contratos, cancelás cuando quieras.",
    en: "Free plan with 0% commission for 90 days. Pro plan S/ 49/month with advanced tools. Enterprise tailored. No contracts, cancel anytime.",
    shi: "Mana paguy 90.",
  },
  "faq.cat2.q2": { es: "¿Hay comisión por venta?", en: "Is there a sales commission?", shi: "Comision kanchu?" },
  "faq.cat2.a2": {
    es: "No durante los primeros 90 días. Después depende del plan que elijas — siempre transparente y sin sorpresas en la factura.",
    en: "Not during the first 90 days. After that depends on your plan — always transparent, no billing surprises.",
    shi: "Mana 90 punchaw.",
  },
  "faq.cat2.q3": { es: "¿Qué pasa si dejo de usarlo?", en: "What if I stop using it?", shi: "Sayachiyta munaspa?" },
  "faq.cat2.a3": {
    es: "Cancelás con un click. Te llevás todos tus datos exportados (clientes, pedidos, productos) en CSV. No hay permanencia.",
    en: "Cancel with one click. Take all your exported data (customers, orders, products) in CSV. No lock-in.",
    shi: "Huk click sayachiy.",
  },
  "faq.cat2.q4": { es: "¿Necesito tarjeta de crédito para registrarme?", en: "Do I need a credit card to sign up?", shi: "Tarjeta necesitan?" },
  "faq.cat2.a4": {
    es: "No. Empezás con Yape o efectivo y migras a tarjeta cuando quieras.",
    en: "No. Start with Yape or cash and switch to card whenever.",
    shi: "Mana. Yape kayniyki.",
  },
  "faq.cat3.label": { es: "Setup y soporte", en: "Setup and support", shi: "Setup, yanapay" },
  "faq.cat3.q1": { es: "¿Cuánto demora el setup?", en: "How long does setup take?", shi: "Hayk'a setup?" },
  "faq.cat3.a1": {
    es: "5 minutos. Subís logo, catálogo y horarios. Te ayudamos por WhatsApp si quieres.",
    en: "5 minutes. Upload logo, catalog and hours. We help via WhatsApp if you want.",
    shi: "5 minutos.",
  },
  "faq.cat3.q2": { es: "¿Necesito saber de tecnología?", en: "Do I need tech knowledge?", shi: "Tecnología yachayta?" },
  "faq.cat3.a2": {
    es: "Cero. La app está hecha para que la maneje cualquier persona. Si ya usas WhatsApp, puedes usar Buleje.",
    en: "Zero. The app is made for anyone. If you already use WhatsApp, you can use Buleje.",
    shi: "Mana. WhatsApp yachayniyki.",
  },
  "faq.cat3.q3": { es: "¿Tienen soporte humano?", en: "Do you have human support?", shi: "Runa yanapay?" },
  "faq.cat3.a3": {
    es: "Sí. Respondemos en menos de 2 horas por WhatsApp. Sin bots, sin formularios largos. Personas reales.",
    en: "Yes. We reply within 2 hours on WhatsApp. No bots, no long forms. Real people.",
    shi: "Arí. 2 horaspi.",
  },
  "faq.cat3.q4": { es: "¿Puedo conectar mi sistema actual?", en: "Can I connect my current system?", shi: "Sistemay tinkay?" },
  "faq.cat3.a4": {
    es: "Sí. Tenemos API y webhooks abiertos para sincronizar con tu ERP, contabilidad o e-commerce existente.",
    en: "Yes. We have open API and webhooks to sync with your existing ERP, accounting or e-commerce.",
    shi: "Arí. API webhooks.",
  },

  // ── Footer ──────────────────────────────────────────────────────────
  "footer.tagline": {
    es: "Marketplace de bodegas y tiendas del Perú",
    en: "Peruvian marketplace of stores",
    shi: "Marketplace",
  },
  "footer.product": { es: "Producto", en: "Product", shi: "Producto" },
  "footer.company": { es: "Compañía", en: "Company", shi: "Compañía" },
  "footer.help": { es: "Ayuda", en: "Help", shi: "Yanapay" },
  "footer.legal": { es: "Legal", en: "Legal", shi: "Legal" },
  "footer.terms": { es: "Términos y condiciones", en: "Terms and conditions", shi: "Términos" },
  "footer.privacy": { es: "Privacidad", en: "Privacy", shi: "Privacidad" },
  "footer.cookies": { es: "Cookies", en: "Cookies", shi: "Cookies" },
  "footer.marketplace": { es: "Marketplace", en: "Marketplace", shi: "Marketplace" },
  "footer.myAccount": { es: "Mi cuenta", en: "My account", shi: "Cuentay" },
  "footer.sellOnBuleje": { es: "Vendé en Buleje", en: "Sell on Buleje", shi: "Buleje-pi rantichiy" },
  "footer.openYourStore": { es: "Abrí tu tienda", en: "Open your store", shi: "Qhatuyki kichay" },
};

/**
 * Traduce una clave al locale solicitado.
 * Fallback: español → clave cruda.
 */
export function translate(key: string, locale: Locale): string {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  if (locale === "qu") {
    // Overlay: si hay traducción quechua usar; si no, fallback español.
    return QU_OVERRIDES[key] ?? entry.es ?? key;
  }
  return entry[locale] ?? entry.es ?? key;
}

export type TranslationKey = keyof typeof TRANSLATIONS;
