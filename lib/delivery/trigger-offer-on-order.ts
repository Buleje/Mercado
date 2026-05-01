/**
 * lib/delivery/trigger-offer-on-order.ts
 *
 * Conecta el flujo de "pedido confirmado en checkout" → "primera oferta al
 * repartidor más cercano". Antes el cron `delivery-offer-cascade` solo corría
 * cada 30s y solo manejaba expiraciones; los orders nuevos quedaban sin offer
 * hasta el primer tick (lag de hasta 30s) o nunca si el cron no estaba
 * configurado.
 *
 * Esta función se llama fire-and-forget desde `/api/marketplace/orders` POST.
 * Si falla (geocoding caído, sin partners, error temporal), el cron sigue
 * actuando como fallback porque mira orders sin assignment.
 */
import { logger } from "@/lib/logger";
import { createNextOffer } from "./offer-cascade";

interface OrderInput {
  orderId: string;
  tenantId: string;
  customerLocation: string | null;
}

const PUCALLPA_FALLBACK = { lat: -8.3791, lng: -74.5539 } as const;

/**
 * Geocoding via Nominatim (OpenStreetMap). Best-effort, 4s timeout.
 * Devuelve null si falla — el caller decide qué hacer con el fallback.
 */
async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address || address.trim().length < 4) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const query = encodeURIComponent(`${address}, Pucallpa, Perú`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=pe`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Nominatim requiere User-Agent (rate-limit por uso libre).
        "User-Agent": "Buleje-Marketplace/1.0 (delivery-matching)",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (err) {
    logger.warn("[trigger-offer] geocoding failed", { error: String(err) });
    return null;
  }
}

/**
 * Dispara la primera DeliveryOffer para el order recién creado.
 *
 * Sin throws — pensado para fire-and-forget desde el endpoint POST. Cualquier
 * error queda registrado pero no rompe la respuesta al cliente. El cron
 * actúa como red de seguridad si esto falla.
 */
export async function triggerDeliveryOfferOnOrder(
  order: OrderInput,
): Promise<void> {
  try {
    // 1. Geocoding del address. Si falla, usamos centro de Pucallpa como
    //    fallback — el repartidor más cercano al centro recibe la offer.
    //    Mejor que dejar el order sin asignar.
    let coords = order.customerLocation
      ? await geocodeAddress(order.customerLocation)
      : null;
    if (!coords) {
      logger.info("[trigger-offer] geocoding sin resultado, usando fallback Pucallpa", {
        orderId: order.orderId,
      });
      coords = PUCALLPA_FALLBACK;
    }

    // 2. (skip persist coords — Order no tiene customerLat/Lng en schema actual.
    //    Si se agregan en el futuro, descomentamos. La cascada usa coords del
    //    momento; el partner mismo guarda su lat/lng vía heartbeat).

    // 3. Crear primera offer al partner más cercano.
    const result = await createNextOffer(
      {
        id: order.orderId,
        tenantId: order.tenantId,
        customerLocation: order.customerLocation,
      },
      coords.lat,
      coords.lng,
    );

    if (result) {
      logger.info("[trigger-offer] primera offer creada", {
        orderId: order.orderId,
        partnerId: result.partnerId,
        offerId: result.offerId,
      });
    } else {
      logger.warn("[trigger-offer] sin partners disponibles ahora", {
        orderId: order.orderId,
      });
    }
  } catch (err) {
    logger.error("[trigger-offer] failed (cron actuará como fallback)", {
      orderId: order.orderId,
      error: String(err),
    });
  }
}
