/**
 * Tracking de banners promocionales (impresión y clic), fire-and-forget.
 *
 * Una sola fuente para el hero viejo (`HomeHeroBanner`, que sigue en recetas)
 * y los tickets de la home «Dosel» (`HomePromoTickets`). Usa `sendBeacon`
 * para no bloquear la navegación del clic; si no existe, cae a `fetch`
 * con `keepalive`. Nunca lanza.
 */
import { logger } from "@/lib/logger";

export function trackBanner(event: "impression" | "click", ids: string[]): void {
  if (typeof navigator === "undefined" || ids.length === 0) return;
  const body = JSON.stringify(
    event === "impression" ? { event, bannerIds: ids } : { event, bannerId: ids[0] },
  );
  try {
    const url = "/api/marketplace/promo-banners/track";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch((err: unknown) =>
        logger.warn("[banners] tracking falló", { event, error: String(err) }),
      );
    }
  } catch {
    /* fire-and-forget: el tracking nunca rompe la UI */
  }
}
