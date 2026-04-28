/**
 * translations.ts — Diccionario multi-idioma ligero (~60 keys).
 *
 * Soporta: español (es), inglés (en), shipibo-konibo (shi).
 * Default: es. Fallback: clave raw si no existe.
 *
 * No depende de i18next ni librería externa — overhead mínimo.
 * Para traducciones de checkout críticas, ver `lib/i18n/quechua-checkout.ts`.
 *
 * ADR-068: 0 emojis, tokens CSS only.
 */

export type Locale = "es" | "en" | "shi";

export const LOCALES: Locale[] = ["es", "en", "shi"];

export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
  shi: "Shipibo-Konibo",
};

export const LOCALE_SHORT: Record<Locale, string> = {
  es: "ES",
  en: "EN",
  shi: "SHI",
};

type TranslationEntry = Record<Locale, string>;

export const TRANSLATIONS: Record<string, TranslationEntry> = {
  // ── Navegación ─────────────────────────────────────────────────────────
  "nav.home": { es: "Inicio", en: "Home", shi: "Nete" },
  "nav.stores": { es: "Bodegas", en: "Stores", shi: "Xobo" },
  "nav.shopDirectory": { es: "Tiendas", en: "Shops", shi: "Xobo" },
  "nav.explore": { es: "Explorar", en: "Explore", shi: "Benakoi" },
  "nav.discover": { es: "Descubrí", en: "Discover", shi: "Ikai" },
  "nav.recipes": { es: "Recetas", en: "Recipes", shi: "Piti kirika" },
  "nav.about": { es: "Nosotros", en: "About us", shi: "Noa" },
  "nav.account": { es: "Mi cuenta", en: "My account", shi: "Noa kirika" },
  "nav.cart": { es: "Carrito", en: "Cart", shi: "Yoi" },
  "nav.orders": { es: "Mis pedidos", en: "My orders", shi: "Payowan" },
  "nav.favorites": { es: "Favoritos", en: "Favorites", shi: "Noi" },
  "nav.openStore": { es: "Abre tu tienda", en: "Open your store", shi: "Mi xobo" },
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
};

/**
 * Traduce una clave al locale solicitado.
 * Fallback: español → clave cruda.
 */
export function translate(key: string, locale: Locale): string {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  return entry[locale] ?? entry.es ?? key;
}

export type TranslationKey = keyof typeof TRANSLATIONS;
