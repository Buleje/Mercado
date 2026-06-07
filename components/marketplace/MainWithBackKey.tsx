"use client";

/**
 * MainWithBackKey — wrapper del <main> que refresca la página de listado al
 * volver desde un detail, SIN recargar el navbar ni el resto del shell.
 *
 * Estrategia (Brandon 2026-06-07 — post unificación del shell):
 *
 *   Al volver de /marketplace/[slug] a /marketplace o /tiendas, hacemos un
 *   REFRESH SUAVE: bump del `key` del <main> + `router.refresh()`. Eso
 *   re-ejecuta los Server Components (re-fetch de strips/banners/recos) y
 *   re-monta el subárbol del listado para que los useEffect/fetch vuelvan a
 *   correr, todo SIN desmontar el navbar ni los providers.
 *
 *   Antes acá había un `window.location.reload()` (recarga DURA del navegador)
 *   para el caso "cross-layout": cuando /marketplace y /tiendas eran árboles de
 *   layout DISTINTOS, volver de un detail remontaba todo y algunos strips con
 *   fetch propio quedaban stale, así que se forzaba el reload. Tras mover
 *   marketplace+tiendas bajo el mismo (store) layout persistente YA NO hay
 *   cross-layout → el refresh suave basta y la navegación es fluida.
 *
 * El marker `__bsm_from_detail` se setea al entrar a un detail; se lee (y
 * consume) al primer mount del list path, con ventana de frescura de 30s para
 * no refrescar en F5 / navegación directa vieja.
 *
 * Además envuelve el contenido en un crossfade (.bsm-route-fade, keyed por
 * pathname) para que el cambio de página sea un fundido suave, no un corte seco.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const FROM_DETAIL_KEY = "__bsm_from_detail";
const EVENT_NAME = "buleje:back-nav-key-bump";

const LIST_PATHS = new Set<string>(["/tiendas", "/marketplace"]);

const MARKETPLACE_RESERVED = new Set([
  "explorar","buscar","ofertas","en-vivo","como-pagar","carrito","comparar",
  "favoritos","mi-cuenta","para-vos","recetas","gift-cards","negocios",
  "registrar","apply","calificar-entrega","payment-result","repartidor",
]);

function isStoreDetailPath(p: string | null): boolean {
  if (!p) return false;
  const mkt = p.match(/^\/marketplace\/([^/]+)\/?$/);
  if (mkt && !MARKETPLACE_RESERVED.has(mkt[1])) return true;
  const tdz = p.match(/^\/tiendas\/([^/]+)\/?$/);
  return Boolean(tdz);
}

function isListPath(p: string | null): boolean {
  return p ? LIST_PATHS.has(p) : false;
}

export function triggerMainKeyBump(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export default function MainWithBackKey({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [bumpKey, setBumpKey] = useState(0);
  const prevPathRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;
    mountedRef.current = true;

    // Si entramos a un detail, guardamos marker {path, timestamp} para que
    // el próximo mount del list path sepa que veníamos de un detail recién.
    if (isStoreDetailPath(pathname)) {
      sessionStorage.setItem(
        FROM_DETAIL_KEY,
        JSON.stringify({ path: pathname, ts: Date.now() }),
      );
      return;
    }

    // Si llegamos a un list path → ¿veníamos de un detail (back-nav)?
    // Lo detectamos por el marker fresco (<30s) O porque el path anterior en
    // esta misma sesión cliente era un detail. En cualquier caso hacemos un
    // REFRESH SUAVE (bump key + router.refresh) — re-stream del RSC + re-run de
    // effects, SIN recarga dura del navegador.
    if (isListPath(pathname)) {
      let cameFromDetailMarker = false;
      const raw = sessionStorage.getItem(FROM_DETAIL_KEY);
      if (raw) {
        let stamped: { path?: string; ts?: number } = {};
        try { stamped = JSON.parse(raw); } catch { /* legacy plain string */ }
        const ts = typeof stamped.ts === "number" ? stamped.ts : 0;
        const isFresh = Date.now() - ts < 30_000; // 30s ventana válida
        // Consumimos el marker siempre (fresco o stale) para no re-disparar.
        sessionStorage.removeItem(FROM_DETAIL_KEY);
        cameFromDetailMarker = isFresh;
      }
      if (cameFromDetailMarker || isStoreDetailPath(prevPath)) {
        setBumpKey((k) => k + 1);
        try { router.refresh(); } catch {}
      }
    }
  }, [pathname, router]);

  // Listener para bumps externos (por si otro código necesita disparar).
  useEffect(() => {
    const onBump = () => setBumpKey((k) => k + 1);
    window.addEventListener(EVENT_NAME, onBump);
    return () => window.removeEventListener(EVENT_NAME, onBump);
  }, []);

  return (
    // Audit 2026-05-17 02-P2-5: pb-safe-area + spacing del BottomNav fijo.
    // BottomNav tiene altura ~64px + su propio pb-[env(safe-area-inset-bottom)].
    // El main debe reservar ese espacio para que el último item no quede
    // tapado en iPhone con home bar / Android con gesture bar. En desktop
    // el BottomNav está oculto (sm:hidden) → padding extra es inocuo.
    <main
      id="main-content"
      key={bumpKey}
      className="pb-[calc(72px+env(safe-area-inset-bottom))] sm:pb-0"
    >
      {/* Crossfade: keyed por pathname → al cambiar de ruta el contenido hace
          un fundido suave en vez de un corte seco. CSS puro (.bsm-route-fade en
          globals.css) con guard prefers-reduced-motion. NO afecta los refs de
          este componente (van en la instancia, no en este div). */}
      <div key={pathname} className="bsm-route-fade">
        {children}
      </div>
    </main>
  );
}
