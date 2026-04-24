import "server-only";

/**
 * lib/integrations/whatsapp-delivery-templates.ts
 *
 * Templates de WhatsApp para el flujo de Delivery vivo (Bloque D1 del Marketplace).
 * Se envían al cliente final cuando el estado de su pedido cambia.
 *
 * Principios:
 * - Plantillas en español peruano natural
 * - Saludo con primer nombre del cliente solamente (privacidad)
 * - Un link de tracking por mensaje (el endpoint público /api/track/[orderId])
 * - Mensajes cortos (< 200 chars) — WhatsApp Business API recomienda brevedad
 * - Emojis moderados — la señora de 55 años los entiende, los apprecia
 * - Nunca exponer tenantId, apellido, dirección completa, monto en el texto
 *
 * Los nombres de template deben coincidir con los que se registren en el
 * WhatsApp Business API del tenant (cuando use HSM templates), aunque en
 * esta primera versión enviamos como free-form text (session window).
 */

export type DeliveryTemplateVars = {
  /** Primer nombre del cliente (sin apellidos) */
  firstName: string;
  /** URL completa al endpoint público de tracking */
  trackingUrl: string;
  /** Nombre de la tienda/bodega que entrega */
  storeName: string;
};

export type DeliveryNearbyVars = DeliveryTemplateVars & {
  /** ETA en minutos (número entero) */
  etaMinutes: number;
  /** Nombre del repartidor (primer nombre) */
  driverFirstName: string;
};

export type DeliveryDeliveredVars = DeliveryTemplateVars & {
  /** ID del pedido — se muestra para que el cliente lo tenga de referencia */
  orderId: string;
};

export type DeliveryFailedVars = DeliveryTemplateVars & {
  /** Razón en lenguaje simple (no técnica) */
  reason: string;
  /** Teléfono de contacto de la tienda para que el cliente llame */
  storePhone: string;
};

// ─── Templates ──────────────────────────────────────────────────────────────

/**
 * Evento `nearby` — el repartidor está a menos de 500 m del destino.
 * Se dispara cuando el tracking event marca `status = 'nearby'`.
 */
export function deliveryNearbyMessage(vars: DeliveryNearbyVars): string {
  return [
    `🚴 ¡Hola ${vars.firstName}!`,
    ``,
    `Tu pedido de *${vars.storeName}* está por llegar.`,
    `${vars.driverFirstName} llega en aproximadamente *${vars.etaMinutes} minutos*.`,
    ``,
    `Sigue su ubicación en vivo aquí:`,
    `${vars.trackingUrl}`,
    ``,
    `¡Prepará el cambio! 🙌`,
  ].join("\n");
}

/**
 * Evento `delivered` — el pedido fue entregado.
 * Se dispara cuando DeliveryRouteStopsDB.markStop({ status: 'delivered' })
 * cascadea un evento de tracking del Order.
 */
export function deliveryDeliveredMessage(vars: DeliveryDeliveredVars): string {
  return [
    `✅ ¡Entregado, ${vars.firstName}!`,
    ``,
    `Tu pedido *${vars.orderId}* de *${vars.storeName}* llegó correctamente.`,
    ``,
    `Gracias por comprarnos. Si algo no está bien, respondenos este mensaje.`,
    ``,
    `¿Todo ok? Calificá tu compra:`,
    `${vars.trackingUrl}`,
  ].join("\n");
}

/**
 * Evento `failed` — no se pudo entregar (dirección mal, nadie en casa, etc).
 */
export function deliveryFailedMessage(vars: DeliveryFailedVars): string {
  return [
    `⚠️ Hola ${vars.firstName}`,
    ``,
    `No pudimos entregar tu pedido de *${vars.storeName}*.`,
    `Motivo: ${vars.reason}`,
    ``,
    `Llamanos al ${vars.storePhone} para coordinar una nueva entrega.`,
    ``,
    `Estado del pedido:`,
    `${vars.trackingUrl}`,
  ].join("\n");
}

/**
 * Evento `picked_up` — el repartidor salió de la tienda con el pedido.
 * Opcional (activable por preferencia del tenant).
 */
export function deliveryPickedUpMessage(vars: DeliveryTemplateVars): string {
  return [
    `📦 Tu pedido salió, ${vars.firstName}`,
    ``,
    `${vars.storeName} ya despachó tu compra.`,
    `El repartidor está en camino a tu dirección.`,
    ``,
    `Seguilo en vivo:`,
    `${vars.trackingUrl}`,
  ].join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Construye la URL pública de tracking. Usar con NEXT_PUBLIC_BASE_URL o
 * con el host derivado del request cuando se conoce.
 */
export function buildTrackingUrl(baseUrl: string, orderId: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/api/track/${encodeURIComponent(orderId)}`;
}

/**
 * Extrae el primer nombre de una cadena "Nombre Apellido1 Apellido2".
 * Se usa para NO exponer apellidos en los mensajes de WhatsApp (privacidad).
 */
export function firstNameOnly(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "Cliente";
}
