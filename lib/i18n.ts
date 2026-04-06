// lib/i18n.ts — Implementación propia y ligera de internacionalización
// Soporta: español (es) y quechua (qu)
// NO depende de ninguna librería externa

export type Locale = "es" | "qu";

const translations: Record<Locale, Record<string, string>> = {
  es: {
    "nav.home": "Inicio",
    "nav.store": "Tienda",
    "nav.cart": "Carrito",
    "nav.orders": "Mis Pedidos",
    "nav.account": "Mi Cuenta",
    "cart.empty": "Tu carrito está vacío",
    "cart.checkout": "Hacer pedido",
    "cart.total": "Total",
    "product.add": "Agregar",
    "product.outOfStock": "Agotado",
    "delivery.tracking": "Seguimiento",
    "delivery.assigned": "Asignado",
    "delivery.pickedUp": "Recogido",
    "delivery.inTransit": "En camino",
    "delivery.delivered": "Entregado",
    "auth.login": "Iniciar sesión",
    "auth.logout": "Cerrar sesión",
    "auth.register": "Registrarse",
    "common.search": "Buscar",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.loading": "Cargando...",
    "common.error": "Ocurrió un error",
  },
  qu: {
    "nav.home": "Qallariy",
    "nav.store": "Rantikuy Wasi",
    "nav.cart": "Rantisqa",
    "nav.orders": "Rantikuykunay",
    "nav.account": "Ñuqa",
    "cart.empty": "Rantisqayki ch'usaqmi",
    "cart.checkout": "Rantikuy",
    "cart.total": "Tukuy",
    "product.add": "Yapay",
    "product.outOfStock": "Tukukusqa",
    "delivery.tracking": "Qatipay",
    "delivery.assigned": "Churasqa",
    "delivery.pickedUp": "Hap'isqa",
    "delivery.inTransit": "Ñanpi",
    "delivery.delivered": "Chayachisqa",
    "auth.login": "Yaykuy",
    "auth.logout": "Lluqsiy",
    "auth.register": "Qillqakuy",
    "common.search": "Maskay",
    "common.save": "Waqaychay",
    "common.cancel": "Ama",
    "common.loading": "Suyachkani...",
    "common.error": "Pantasqa",
  },
};

/**
 * Traduce una clave al idioma solicitado.
 * Fallback: español → clave cruda.
 */
export function t(key: string, locale: Locale = "es"): string {
  return translations[locale]?.[key] ?? translations.es[key] ?? key;
}

/**
 * Obtiene el locale actual desde localStorage.
 * Solo disponible en el cliente. En servidor devuelve "es".
 */
export function getLocale(): Locale {
  if (typeof window === "undefined") return "es";
  return (localStorage.getItem("buleje-locale") as Locale) ?? "es";
}

/**
 * Persiste el locale elegido en localStorage.
 */
export function setLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("buleje-locale", locale);
}
