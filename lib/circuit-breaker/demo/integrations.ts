/**
 * EJEMPLOS de uso — no llama APIs reales.
 *
 * Muestra como wrappear llamadas a servicios externos con getBreaker().
 * En produccion, reemplazar el stub con la llamada real al SDK/HTTP.
 */

import { getBreaker } from "../registry";
import { CircuitOpenError } from "../breaker";

// ── Configuraciones pre-definidas ─────────────────────────────────────────────

/**
 * WhatsApp Business API — mensajes criticos pero tolerantes a retrasos.
 * 3 fallos antes de abrir; 60s cooldown; timeout de 8s por mensaje.
 */
export const whatsappBreaker = getBreaker("whatsapp", {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMaxCalls: 2,
  timeoutMs: 8_000,
});

/**
 * SUNAT — consultas RUC/comprobantes. Servicio lento y a veces caido.
 * 5 fallos antes de abrir; 5min cooldown (suele tener mantenimientos largos).
 */
export const sunatBreaker = getBreaker("sunat", {
  failureThreshold: 5,
  resetTimeoutMs: 5 * 60_000,
  halfOpenMaxCalls: 1,
  timeoutMs: 15_000,
});

/**
 * MercadoPago — pagos. Critico: threshold bajo, recuperacion rapida.
 * 2 fallos antes de abrir; 20s cooldown; timeout de 12s.
 */
export const mercadopagoBreaker = getBreaker("mercadopago", {
  failureThreshold: 2,
  resetTimeoutMs: 20_000,
  halfOpenMaxCalls: 3,
  timeoutMs: 12_000,
});

// ── Stubs de ejemplo ─────────────────────────────────────────────────────────

/** Tipo stub para parametros de notificacion WhatsApp */
interface WhatsAppParams {
  to: string;
  message: string;
}

/**
 * Enviar notificacion WhatsApp protegida por circuit breaker.
 *
 * Uso real:
 *   return await whatsappClient.messages.create({ to, body: message });
 */
export async function sendWhatsAppNotification(params: WhatsAppParams): Promise<{ id: string }> {
  return whatsappBreaker.exec(async () => {
    // STUB — reemplazar con llamada real al SDK de WhatsApp Business
    // Ejemplo: await fetch("https://graph.facebook.com/v20.0/.../messages", {...})
    console.log("[whatsapp-stub] enviando a", params.to);
    return { id: `stub-${Date.now()}` };
  });
}

/** Tipo stub para consulta de RUC SUNAT */
interface SunatRucParams {
  ruc: string;
}

/**
 * Consultar RUC en SUNAT protegido por circuit breaker.
 *
 * Uso real:
 *   return await sunatClient.consultarRuc(ruc);
 */
export async function consultarRucSunat(params: SunatRucParams): Promise<{ razonSocial: string; activo: boolean }> {
  return sunatBreaker.exec(async () => {
    // STUB — reemplazar con llamada real a la API de SUNAT
    console.log("[sunat-stub] consultando RUC", params.ruc);
    return { razonSocial: "EMPRESA EJEMPLO SAC", activo: true };
  });
}

/** Tipo stub para creacion de preferencia de pago */
interface MercadoPagoParams {
  orderId: string;
  amount: number;
  currency: string;
}

/**
 * Crear preferencia de pago en MercadoPago protegido por circuit breaker.
 *
 * Uso real:
 *   return await mpClient.preferences.create({ items: [...] });
 */
export async function createMercadoPagoPreference(
  params: MercadoPagoParams,
): Promise<{ preferenceId: string; initPoint: string }> {
  return mercadopagoBreaker.exec(async () => {
    // STUB — reemplazar con llamada real al SDK de MercadoPago
    console.log("[mercadopago-stub] creando preferencia para orden", params.orderId);
    return {
      preferenceId: `pref-stub-${params.orderId}`,
      initPoint: `https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=stub`,
    };
  });
}

// ── Helper de fallback ───────────────────────────────────────────────────────

/**
 * Ejecutar con fallback cuando el breaker esta abierto.
 * Util para degradacion graceful (mostrar datos cacheados, etc).
 *
 * @example
 *   const ruc = await withFallback(
 *     () => consultarRucSunat({ ruc }),
 *     () => getCachedRuc(ruc),
 *   );
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return fallback();
    }
    throw err;
  }
}
