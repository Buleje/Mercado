/**
 * Hero copy estratégico — frameworks PAS + FAB aplicados.
 *
 * Cada hero sigue estructura:
 *   - eyebrow (kicker contextual)
 *   - headline (PAS problem o FAB benefit)
 *   - subhead (explicación 1 frase)
 *   - ctaPrimary (acción clara con beneficio)
 *   - ctaSecondary (alternativa menor compromiso)
 *   - socialProof (dato real desde DB si aplica)
 *
 * Los headlines evitan:
 *   - "Encuentra lo que buscas"
 *   - "Tu solución integral"
 *   - "Potenciamos tu negocio"
 *   - Cualquier cliché SaaS genérico
 */

export const HERO = {
  // ── Marketplace (B2C — compradores) ───────────────────────
  marketplace: {
    eyebrow: "Marketplace · Pucallpa",
    headline: "Tu bodega del barrio,",
    headlineAccent: "en tu celular",
    subhead:
      "Pide a cualquier bodega cerca tuyo. Delivery en 25 min. Pagás con Yape o efectivo al recibir.",
    ctaPrimary: "Ver tiendas cerca",
    ctaSecondary: "Ofertas del día",
    socialProofTemplate: (bodegas: number, ordersToday: number) =>
      `${bodegas} bodegas · ${ordersToday} pedidos hoy en Pucallpa`,
  },

  // ── Landing negocios (B2B — dueños de bodega) ─────────────
  // Framework: PAS — problema específico → agitación → solución
  negocios: {
    eyebrow: "Software para bodegas",
    headline: "Cerrás cada noche",
    headlineAccent: "sin saber cuánto ganaste",
    subhead:
      "Buleje automatiza inventario, ventas y delivery. Ves todo desde tu celular — sin instalar nada, sin anotar en cuaderno.",
    ctaPrimary: "Empezar gratis — sin tarjeta",
    ctaSecondary: "Ver demo de 15 minutos",
    socialProofTemplate: (activeStores: number) =>
      `${activeStores} bodegas en todo el Perú ya usan Buleje`,
    // Fallback hero alternativo para A/B test
    alternativeHeadline: "Vende el doble",
    alternativeAccent: "sin contratar a nadie",
    alternativeSubhead:
      "Automatizá pedidos por WhatsApp, inventario y facturación SUNAT. Ahorrá 2 horas cada día.",
  },

  // ── Tienda (store owner's storefront) ─────────────────────
  tienda: {
    eyebrow: "Tienda online",
    headline: "Tu despensa completa",
    headlineAccent: "en 25 minutos",
    subhead:
      "Abarrotes, frescos, bebidas y limpieza. Con delivery a tu puerta. Pagás como prefieras.",
    ctaPrimary: "Ver catálogo",
    ctaSecondary: "Ofertas del día",
    trustRow: [
      "Delivery en 25 min",
      "Pago con Yape · Plin · Efectivo",
      "Sin monto mínimo",
    ],
  },

  // ── About (historia bodega) ───────────────────────────────
  about: {
    eyebrow: "Nuestra historia",
    headline: "Buleje",
    headlineAccent: "tu vecino digital",
    subhead:
      "Desde 2021 sirviendo a nuestros vecinos con productos frescos, precios justos y el cariño del barrio.",
    ctaPrimary: "Ver tienda",
    ctaSecondary: "Escríbenos por WhatsApp",
  },

  // ── Ayuda ──────────────────────────────────────────────────
  ayuda: {
    eyebrow: "Centro de ayuda",
    headline: "Tenemos respuesta",
    headlineAccent: "para todo",
    subhead:
      "Respuestas rápidas a las preguntas más comunes. Si no encontrás lo tuyo, escríbenos por WhatsApp.",
    ctaPrimary: "Chatear por WhatsApp",
  },

  // ── Apply wizard (vendor onboarding) ──────────────────────
  apply: {
    eyebrow: "Abre tu tienda",
    headline: "4 pasos,",
    headlineAccent: "5 minutos",
    subhead:
      "Contanos quién sos, qué vendes y dónde. Tu tienda queda lista hoy mismo — empiezas a vender mañana.",
    ctaPrimary: "Empezar configuración",
  },

  // ── Planes ─────────────────────────────────────────────────
  planes: {
    eyebrow: "Planes y precios",
    headline: "Empiezas gratis,",
    headlineAccent: "crecés a tu ritmo",
    subhead:
      "Prueba Buleje 14 días sin pagar un sol. Subes de plan solo cuando te ayude a vender más.",
    ctaPrimary: "Empezar plan gratis",
    ctaSecondary: "Ver planes pagos",
  },

  // ── Puntos / fidelidad ────────────────────────────────────
  puntos: {
    eyebrow: "Programa fidelidad",
    headline: "Por cada sol,",
    headlineAccent: "más valor",
    subhead:
      "Ganás 1 punto por cada S/10 de pedido. 100 puntos = S/5 de descuento. Subes de nivel automático.",
    ctaPrimary: "Ver mi nivel",
  },

  // ── Zona Pucallpa (SEO hyperlocal) ────────────────────────
  zonaPucallpa: {
    eyebrow: "Pucallpa · Ucayali",
    headline: "Buleje nació aquí,",
    headlineAccent: "en Pucallpa",
    subhead:
      "Cobertura en los 11 distritos de Ucayali. Delivery en 25 min, bodegas verificadas, pagos con Yape.",
    ctaPrimary: "Ver tiendas de Pucallpa",
    ctaSecondary: "Buscar mi distrito",
  },
} as const;

/**
 * Helper para renderear social proof desde datos live.
 * Devuelve string o null si no hay datos suficientes.
 */
export function renderSocialProof(
  template: (n: number, m: number) => string,
  n: number,
  m: number,
): string | null {
  if (n < 5 && m < 5) return null; // evitar "2 bodegas · 0 pedidos hoy"
  return template(n, m);
}
