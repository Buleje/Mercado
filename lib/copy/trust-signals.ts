/**
 * Trust signals — textos cortos que reducen fricción.
 *
 * Posicion clave: cerca de CTAs pagos/signup, footer, checkout.
 * Regla Cialdini Authority: certificaciones reales, no claims vagas.
 */

export const TRUST = {
  // ── Pagos ──────────────────────────────────────────────────
  paymentMethods: "Yape · Plin · Efectivo al recibir",
  paymentSecure: "Pago seguro · Tu data nunca se comparte",
  noHiddenFees: "Sin comisiones ocultas",
  moneyBack: "7 días para cambiar de idea — devolvemos sin preguntas",

  // ── Delivery ──────────────────────────────────────────────
  deliveryTime: "Delivery en 25 minutos promedio",
  deliveryFree: (fromAmount: number) => `Delivery gratis desde S/${fromAmount}`,
  deliveryZones: "Cobertura en los 11 distritos de Ucayali",

  // ── Confianza bodega ──────────────────────────────────────
  verifiedStores: "Tiendas verificadas con SUNAT",
  sunatCompliant: "Boletas y facturas electrónicas SUNAT",
  localBusiness: "Hecho en Pucallpa, por peruanos, para peruanos",

  // ── Vendor pitch ──────────────────────────────────────────
  freeTrial: "14 días gratis — sin tarjeta de crédito",
  noContract: "Sin contratos ni permanencia — salís cuando quieras",
  setupTime: "Configurás tu tienda en 5 minutos",
  supportIncluded: "Soporte por WhatsApp incluido en todos los planes",

  // ── Social proof real desde DB (usar con fallback) ────────
  testimonialTemplate: (name: string, city: string, years: number) =>
    `"${name}, ${city} · Buleje me cambió el negocio en ${years} ${years === 1 ? "año" : "años"}."`,
} as const;

/**
 * Array de trust chips para CTAs clave.
 * Uso: <TrustChips items={TRUST_CHIPS.checkout} />
 */
export const TRUST_CHIPS = {
  checkout: [
    "Pago seguro",
    "Delivery 25 min",
    "Yape · Plin · Efectivo",
  ],
  signup: [
    "14 días gratis",
    "Sin tarjeta",
    "Cancelás cuando quieras",
  ],
  marketplace: [
    "Bodegas verificadas",
    "Delivery en 25 min",
    "Pago al recibir",
  ],
  vendor: [
    "Sin comisiones ocultas",
    "SUNAT integrado",
    "Soporte WhatsApp",
  ],
} as const;
