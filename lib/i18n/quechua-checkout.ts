import "server-only";

/**
 * ROADMAP ITEM #66 — Quechua i18n checkout
 *
 * Diccionario inicial para las pantallas críticas del checkout en Quechua
 * (variante Ayacuchano, la más hablada en la sierra). Cubre solo las
 * cadenas del flujo de compra + notificaciones WhatsApp — no es un i18n
 * completo. Se activa con un toggle en el header (cookie `lang=qu`).
 */

export type Locale = "es" | "qu";

export const QUECHUA_DICT = {
  "checkout.title": "Rantikuy",
  "checkout.step.datos": "Willakuy",
  "checkout.step.direccion": "Wasi suti",
  "checkout.step.pago": "Qullqi",
  "checkout.step.confirmar": "Arí nisun",
  "checkout.total": "Tukuy",
  "checkout.continue": "Qatiy",
  "checkout.back": "Kutiy",
  "checkout.confirm": "Arí",
  "checkout.cancel": "Mana",
  "checkout.phone": "Telefono",
  "checkout.name": "Sutiyki",
  "checkout.address": "Wasiyki",
  "checkout.notes": "Yuyaychay",
  "checkout.payment.yape": "Yape (qullqi telefono)",
  "checkout.payment.cash": "Qullqi makinpi",
  "checkout.delivery.now": "Kunan apamuy",
  "checkout.delivery.schedule": "Huk pachapi",
  "cart.empty": "Manan imapas kanchu",
  "cart.total": "Tukuy qullqi",
  "order.placed": "Rantisqa kachkan",
  "order.tracking": "Maypi kachkan",
  "whatsapp.greeting": "Allillanchu",
  "whatsapp.thanks": "Sulpayki rantiwaqanchiqmanta",
  "whatsapp.on_the_way": "Ñanpi kachkan",
  "whatsapp.delivered": "Apamusqa",
} as const;

export type QuechuaKey = keyof typeof QUECHUA_DICT;

export function t(key: QuechuaKey, locale: Locale, fallback: string): string {
  if (locale === "qu") {
    return QUECHUA_DICT[key] ?? fallback;
  }
  return fallback;
}
