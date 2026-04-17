/**
 * Error messages — framework "Acknowledge → Explain → Instruct".
 *
 * Patron Shopify Microcopy 2026:
 *   1. Acknowledge: admitir que algo falló sin culpar al usuario
 *   2. Explain: por qué pasó (si es útil saber)
 *   3. Instruct: qué hacer AHORA para resolverlo
 *
 * MAL: "Error: invalid input"
 * BIEN: "No pudimos validar tu número. Debe empezar con 9. Probá de nuevo."
 */

export const ERROR = {
  // ── Red / conexión ────────────────────────────────────────
  networkOffline:
    "Estás sin internet. Revisá tu WiFi o datos y volvé a intentar.",
  networkSlow:
    "La conexión está lenta. Esperá un momento — no cierres la página.",
  serverDown:
    "Nuestros servidores tienen un problema. Ya lo estamos arreglando — intentá en 2 minutos.",

  // ── Auth ──────────────────────────────────────────────────
  loginWrongCode:
    "El código no coincide. Revisá el SMS o pedí uno nuevo.",
  loginExpiredCode:
    "Tu código venció. Pedí uno nuevo — llega en 30 segundos.",
  loginBlocked:
    "Muchos intentos fallidos. Esperá 5 minutos antes de volver a probar.",
  phoneInvalid:
    "El número debe tener 9 dígitos y empezar con 9. Revisalo.",
  emailInvalid:
    "Ese email no parece válido. Revisá que tenga @ y punto.",

  // ── Formularios ───────────────────────────────────────────
  required: "Este campo es obligatorio.",
  minLength: (min: number) => `Mínimo ${min} caracteres.`,
  maxLength: (max: number) => `Máximo ${max} caracteres.`,
  numericOnly: "Solo números — sin letras ni símbolos.",

  // ── Yape / pagos ──────────────────────────────────────────
  yapeNumberInvalid:
    "Tu número de Yape debe empezar con 9 y tener 9 dígitos. Revisalo.",
  yapeCaptureUnreadable:
    "No pudimos leer la captura. Tomá otra más clara o ingresá el código manual.",
  yapeAmountMismatch: (expected: string, got: string) =>
    `El monto de tu Yape (${got}) no coincide con el pedido (${expected}). Contactá a la tienda.`,
  paymentFailed:
    "Tu pago no se procesó. No te cobramos — intentá de nuevo o elegí otro método.",
  paymentTimeout:
    "Tardamos demasiado en confirmar el pago. Tu dinero está seguro — contactá a soporte si no lo ves en 5 min.",

  // ── Checkout ──────────────────────────────────────────────
  cartEmpty:
    "Tu carrito está vacío. Agregá productos antes de ir a pagar.",
  stockInsufficient: (productName: string, available: number) =>
    `Solo quedan ${available} de "${productName}". Ajustá la cantidad.`,
  addressIncomplete:
    "Falta tu dirección. Escribila para que llegue tu pedido.",
  deliveryZoneOutside:
    "Tu dirección queda fuera de nuestra zona. Contactanos por WhatsApp para ver opciones.",

  // ── Admin ─────────────────────────────────────────────────
  notAuthorized:
    "No tenés permiso para esta acción. Hablá con el dueño de la tienda.",
  notFound:
    "Ese elemento ya no existe. Puede que alguien lo haya borrado.",
  duplicateEntry: (what: string) =>
    `Ya existe ${what} con esos datos. Revisá los registros.`,
  cannotDelete: (what: string, reason: string) =>
    `No podemos borrar ${what}: ${reason}.`,

  // ── SUNAT / facturación ───────────────────────────────────
  sunatRucInvalid:
    "El RUC debe tener 11 dígitos. Revisalo y volvé a intentar.",
  sunatDniInvalid:
    "El DNI debe tener 8 dígitos. Revisalo.",
  sunatServiceDown:
    "SUNAT está caído. Tu boleta quedó guardada — se enviará automáticamente cuando vuelva.",

  // ── Uploads ───────────────────────────────────────────────
  fileTooBig: (maxMb: number) =>
    `El archivo pesa más de ${maxMb}MB. Usá una imagen más liviana.`,
  fileWrongType:
    "Solo aceptamos imágenes JPG o PNG. Convertí tu archivo.",

  // ── Genéricos (evitar usar — preferir específicos) ────────
  unknown:
    "Nos pasó algo inesperado. Ya lo estamos revisando — volvé a intentar.",
  unsaved:
    "Tu trabajo no se guardó. Revisá tu conexión y volvé a intentar.",
} as const;

/**
 * Helper: convierte un error de fetch/Zod en mensaje amigable.
 * Uso: `ERROR.fromUnknown(error, "crear producto")`.
 */
export function errorFromUnknown(error: unknown, context?: string): string {
  if (error instanceof Error) {
    // TypeError o NetworkError
    if (error.message.toLowerCase().includes("fetch")) return ERROR.networkOffline;
    if (error.message.toLowerCase().includes("timeout")) return ERROR.networkSlow;
    return error.message;
  }
  if (context) return `No pudimos ${context}. Intentá de nuevo.`;
  return ERROR.unknown;
}
