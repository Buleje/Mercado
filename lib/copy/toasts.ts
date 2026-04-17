/**
 * Toasts — confirmaciones, advertencias, informacion.
 *
 * Regla: cada toast debe responder "que paso" + "que hago ahora".
 * No decir solo "Guardado" sino "Producto guardado · ver en catalogo".
 */

export const TOAST = {
  // ── Success ───────────────────────────────────────────────
  saved: (what: string) => ({
    title: `${what} guardado`,
    description: "Los cambios ya están visibles en la tienda.",
  }),
  created: (what: string) => ({
    title: `${what} creado`,
    description: "Listo para usar.",
  }),
  deleted: (what: string) => ({
    title: `${what} eliminado`,
    description: "Podés deshacer en los próximos 5 segundos.",
  }),
  orderPlaced: (orderId: string) => ({
    title: "Pedido confirmado",
    description: `#${orderId.slice(-6).toUpperCase()} · Llega en ~25 min.`,
  }),
  paymentReceived: {
    title: "Pago recibido",
    description: "Ya podés preparar el pedido.",
  },
  subscriberAdded: {
    title: "Suscrito correctamente",
    description: "Recibirás ofertas exclusivas. Cancelás cuando quieras.",
  },
  couponApplied: (discount: string) => ({
    title: "Cupón aplicado",
    description: `Descuento de ${discount} sumado al total.`,
  }),
  copied: (what = "Texto") => ({
    title: `${what} copiado al portapapeles`,
    description: "Ya lo podés pegar donde quieras.",
  }),

  // ── Info ──────────────────────────────────────────────────
  draftSaved: {
    title: "Borrador guardado automáticamente",
    description: "Podés cerrar esta ventana — no perdés nada.",
  },
  offlineSyncing: {
    title: "Trabajando sin conexión",
    description: "Tus cambios se guardarán cuando vuelva el internet.",
  },
  updateAvailable: {
    title: "Nueva versión disponible",
    description: "Recargá la página para activar las mejoras.",
  },

  // ── Warning ───────────────────────────────────────────────
  stockLow: (product: string, qty: number) => ({
    title: "Stock bajo",
    description: `Solo quedan ${qty} de "${product}". Reponé pronto.`,
  }),
  unsavedChanges: {
    title: "Cambios sin guardar",
    description: "Guardá antes de salir o vas a perder tu trabajo.",
  },
  slowConnection: {
    title: "Conexión lenta detectada",
    description: "Estamos cargando — esperá unos segundos.",
  },

  // ── Error ─────────────────────────────────────────────────
  saveFailed: {
    title: "No pudimos guardar",
    description: "Revisá tu conexión y volvé a intentar.",
  },
  paymentFailed: {
    title: "Pago no procesado",
    description: "No te cobramos nada. Probá otra vez o elegí otro método.",
  },
  uploadFailed: {
    title: "Archivo no subido",
    description: "Intentá con una imagen más liviana (máx 5MB).",
  },
} as const;
