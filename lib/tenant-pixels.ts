/**
 * lib/tenant-pixels.ts — dispara eventos de conversión a los pixels del tenant
 * (Meta / TikTok / GA4) que inyecta `components/store/TenantAnalytics` en el
 * storefront `/t/<slug>`.
 *
 * Solo cliente y best-effort: si el pixel no está cargado (dueño sin config, o
 * página fuera del storefront), no hace nada. Dedup por `orderId` vía
 * sessionStorage para no doble-contar una compra al re-montar la pantalla.
 *
 * `window.gtag` ya está tipado globalmente (lib/analytics.ts). Para `fbq`/`ttq`
 * usamos un cast local en vez de augmentar `Window` (evita conflicto de tipos).
 */

type Fbq = (action: string, event: string, params?: Record<string, unknown>) => void;
type Ttq = { track: (event: string, params?: Record<string, unknown>) => void };

export function fireTenantPurchase(opts: {
  orderId: string;
  value: number;
  currency?: string;
}): void {
  const { orderId, value, currency = "PEN" } = opts;
  if (typeof window === "undefined" || !orderId) return;

  // Dedup: un mismo pedido no debe contar dos veces (re-mount, back/forward).
  const key = `bsm-purchase-tracked-${orderId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage bloqueado (modo privado): seguimos; el riesgo de doble
    // conteo es mínimo frente a perder la conversión.
  }

  const val = Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : undefined;
  const w = window as Window & { fbq?: Fbq; ttq?: Ttq };

  try {
    // Meta: evento estándar Purchase (optimización de anuncios + remarketing).
    w.fbq?.("track", "Purchase", { value: val, currency, order_id: orderId });
    // TikTok: CompletePayment es el evento de conversión de compra.
    w.ttq?.track("CompletePayment", { value: val, currency, content_type: "product" });
    // GA4: evento estándar `purchase` con transaction_id para deduplicar server-side.
    window.gtag?.("event", "purchase", { transaction_id: orderId, value: val, currency });
  } catch {
    // Telemetría best-effort: un pixel roto jamás debe romper la confirmación.
  }
}
