"use client";

/**
 * MainWithBackKey — wrapper del <main> que garantiza que la página de
 * listado se rehidrata completa al volver desde un detail.
 *
 * Estrategia:
 *
 * 1) Cross-layout (de /marketplace/[slug] a /tiendas o viceversa):
 *    HARD RELOAD via window.location.reload(). Es la única forma de
 *    garantizar que TODOS los strips, banners, recomendaciones, categorías
 *    y demás estado client-side se refresquen. Bumpear el key del <main>
 *    no llegaba a algunos componentes con su propio fetch + estado stale
 *    (TiendasHeroAds, RecommendationsStrip, MisTiendasFavoritasStrip, etc).
 *
 * 2) Same-layout (/marketplace/[slug] → /marketplace):
 *    Bumpeamos `key` del <main> + router.refresh(). Más liviano porque
 *    el layout shell no se reflota.
 *
 * El marker `__bsm_from_detail` se setea al entrar a un detail; se lee
 * (y consume) al primer mount del list path. Se prefija con "navigate:"
 * para asegurar que NO se re-trigger un reload en F5 o navegación directa.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const FROM_DETAIL_KEY = "__bsm_from_detail";
const RELOADED_KEY = "__bsm_back_reloaded_at";
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

    // Si llegamos a un list path Y existe marker FRESCO (<30s) → veníamos
    // de un detail (back-nav). Hard reload garantiza que banners,
    // recomendaciones, categorías y strips se rehidraten todos.
    if (isListPath(pathname)) {
      const raw = sessionStorage.getItem(FROM_DETAIL_KEY);
      if (raw) {
        let stamped: { path?: string; ts?: number } = {};
        try { stamped = JSON.parse(raw); } catch { /* legacy plain string */ }
        const ts = typeof stamped.ts === "number" ? stamped.ts : 0;
        const now = Date.now();
        const isFresh = now - ts < 30_000; // 30s ventana válida
        if (isFresh) {
          sessionStorage.removeItem(FROM_DETAIL_KEY);
          const lastReload = Number(sessionStorage.getItem(RELOADED_KEY) || "0");
          // Guard anti-loop: si recargamos hace <2s, saltamos.
          if (now - lastReload > 2000) {
            sessionStorage.setItem(RELOADED_KEY, String(now));
            window.location.reload();
            return;
          }
        } else {
          // Marker stale (sesión vieja) → limpiar sin reload.
          sessionStorage.removeItem(FROM_DETAIL_KEY);
        }
      }
      // Same-layout sin marker fresco: bump key + refresh.
      if (isStoreDetailPath(prevPath)) {
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
      {children}
    </main>
  );
}
