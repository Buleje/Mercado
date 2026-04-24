/**
 * CTAs — cada boton muestra monto/beneficio tangible.
 *
 * Regla Presta Checkout Playbook 2026: reemplazar "Continuar" por
 * "Pagar S/X ahora" aumenta conversion consistentemente. Cada CTA
 * debe responder la pregunta "¿que pasa cuando hago click?".
 */

import { formatSoles } from "@/lib/chart-helpers";

export const BTN = {
  // ── Auth ────────────────────────────────────────────────────
  loginSubmit: "Ingresar",
  loginOtp: "Enviar código al WhatsApp",
  verifyOtp: "Verificar código",
  signupSubmit: "Crear cuenta gratis — 2 min",
  forgotPassword: "Enviar link de recuperación",

  // ── Compra (store) ─────────────────────────────────────────
  addToCart: "Agregar",
  addToCartLoading: "Agregando…",
  addToCartDone: "Agregado",
  buyNow: "Comprar ahora",
  viewCart: "Ver mi pedido",
  continueShopping: "Seguir comprando",
  applyCoupon: "Aplicar cupón",
  openCheckout: "Ir a pagar",
  backToCart: "Volver al pedido",

  // ── Checkout ────────────────────────────────────────────────
  payNow: (amount: number) => `Pagar ${formatSoles(amount)} ahora`,
  confirmOrder: (amount: number) => `Confirmar pedido · ${formatSoles(amount)}`,
  payWithYape: "Pagar con Yape",
  payWithPlin: "Pagar con Plin",
  payWithCash: "Pagar en efectivo al recibir",
  scanYapeQR: "Escanear QR de Yape",
  uploadCapture: "Sube la captura del pago",
  verifyPayment: "Verificar pago",

  // ── Delivery / Tracking ────────────────────────────────────
  trackOrder: "Seguir mi pedido",
  callDriver: "Llamar al repartidor",
  whatsappDriver: "WhatsApp al repartidor",
  confirmReceived: "Ya recibe mi pedido",

  // ── Admin — acción primaria ────────────────────────────────
  createProduct: "+ Nuevo producto",
  createOrder: "+ Registrar venta",
  createCustomer: "+ Nuevo cliente",
  createCredit: "+ Dar fiado",
  saveChanges: "Guardar cambios",
  saveAndNew: "Guardar y crear otro",
  saveAsDraft: "Guardar como borrador",
  publish: "Publicar en la tienda",
  unpublish: "Quitar de la tienda",

  // ── Admin — destructivas (con confirmación) ────────────────
  deleteConfirm: "Sí, eliminar",
  cancelAction: "Cancelar",
  undo: "Deshacer",

  // ── Marketing / vendor pitch ───────────────────────────────
  startFreeTrial: "Empezar gratis — sin tarjeta",
  requestDemo: "Ver demo de 15 minutos",
  contactSales: "Hablar con ventas",
  openMyStore: "Abre tu tienda gratis",
  seePricing: "Ver planes desde S/0",

  // ── Newsletter / CRM ───────────────────────────────────────
  subscribe: "Recibir ofertas — cancelás cuando quieras",
  subscribeSending: "Suscribiendo…",
  unsubscribe: "Dejar de recibir",

  // ── Recetas ────────────────────────────────────────────────
  seeRecipe: "Ver receta",
  addRecipeIngredients: "Agregar todos los ingredientes",
  startCooking: "Empezar a cocinar",

  // ── Soporte ────────────────────────────────────────────────
  chatWhatsApp: "Chatear por WhatsApp — respondemos hoy",
  openTicket: "Abrir ticket",
  reportIssue: "Reportar un problema",
} as const;

/**
 * Variantes contextuales comunes — mantenemos una sola fuente de verdad.
 */
export const BTN_VARIANTS = {
  /** Para quick-add en grid: solo icono + "Agregar" en hover */
  quickAdd: { idle: "Agregar", loading: "…", done: "✓" } as const,
  /** Confirmación destructiva con contador de 5s */
  undoableDelete: { action: "Eliminar", undo: "Deshacer", seconds: 5 } as const,
};
