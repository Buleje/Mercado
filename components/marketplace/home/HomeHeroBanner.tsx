"use client";

/**
 * HomeHeroBanner — HERO de la home (Brandon 2026-06-12).
 *
 * Reemplaza el viejo hero "Pedí en {ciudad}" + buscador por un banner rotativo
 * full-width estilo marketplace pro (AliExpress/Temu): una pieza grande que
 * abarca todo el ancho del contenido, se desliza con el dedo (swipe) y rota
 * sola. Usa PromoBannerRenderer para que cada slide se vea IDÉNTICO al preview
 * de superadmin y al resto de slots (image / promo / classic).
 *
 * Datos: slot `tiendas-hero` vía `/api/marketplace/promo-banners` — los MISMOS
 * banners que antes vivían en la columna "Publicidad" del catálogo (ahora
 * promovidos a hero). Si el slot está vacío, cae a un slide de marca para que
 * la home nunca quede sin portada.
 *
 * SEO intacto: el <h1> de la home vive en el server component que monta esto
 * (sr-only). Acá solo va la UI del carrusel.
 *
 * Interacción: swipe (pointer/touch) + flechas (desktop hover) + dots.
 * Autoplay 6s, pausa al hover/arrastre, loop. Tracking impression/click
 * fire-and-forget (sendBeacon, no bloquea navegación) — mismo patrón que
 * TiendasHeroAds (banners v2 F3).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BRAND_GEO } from "@/lib/geo";
import PromoBannerRenderer, { type PromoBanner } from "../PromoBannerRenderer";

const ROTATE_MS = 6000;
const SWIPE_THRESHOLD = 50; // px para confirmar un swipe
const DRAG_GUARD = 10; // px: por encima de esto, un "click" es en realidad arrastre

// Tracking fire-and-forget (sendBeacon) — no bloquea navegación.
function trackBanner(event: "impression" | "click", ids: string[]) {
  if (typeof navigator === "undefined" || ids.length === 0) return;
  const body = JSON.stringify(
    event === "impression" ? { event, bannerIds: ids } : { event, bannerId: ids[0] },
  );
  try {
    const url = "/api/marketplace/promo-banners/track";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {
    /* fire-and-forget */
  }
}

// Slide de marca por si el slot está vacío — la home nunca queda sin portada.
const FALLBACK_BANNERS: PromoBanner[] = [
  {
    id: "home-hero-fallback",
    type: "classic",
    title: `Tu mercado de ${BRAND_GEO.city}, a domicilio`,
    subtitle: "Bodegas, restaurantes y farmacias de tu zona. Paga con Yape, Plin o efectivo.",
    imageUrl: null,
    ctaHref: "/tiendas",
    ctaLabel: "Ver tiendas",
    bgFrom: "#00A0A0",
    bgTo: "#0d3b3b",
    active: true,
    order: 0,
  },
];

interface Props {
  /** Slot de banners. Default "tiendas-hero" (el poblado). */
  slot?: string;
  /** Zona del cliente para segmentación (banners v2 F4). */
  zone?: string | null;
  /** perf audit P1: banners ya resueltos en el SERVER (RSC) — si llegan, se
   *  pintan en el primer byte (sin cascada hidratar→fetch→pintar) y se omite el
   *  fetch client. Si no, cae al fetch client (modo legacy). */
  initialBanners?: PromoBanner[];
}

export default function HomeHeroBanner({ slot = "tiendas-hero", zone = null, initialBanners }: Props) {
  const hasInitial = !!initialBanners && initialBanners.length > 0;
  const [banners, setBanners] = useState<PromoBanner[] | null>(
    hasInitial ? initialBanners! : null,
  );
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Estado de arrastre: ref para no re-render en cada move; dragDx para seguir
  // el dedo en vivo (translate). dragging controla si la transición CSS aplica.
  const drag = useRef({ startX: 0, dx: 0, dragging: false });
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  // ── Banners del slot ────────────────────────────────────────────────────────
  // Con initialBanners del SERVER: ya están pintados, solo registramos la
  // impresión (1 vez). Sin ellos: fetch client (legacy).
  useEffect(() => {
    if (hasInitial) {
      trackBanner("impression", initialBanners!.map((b) => b.id));
      return;
    }
    let cancelled = false;
    const qs = new URLSearchParams({ slot });
    if (zone) qs.set("zone", zone);
    fetch(`/api/marketplace/promo-banners?${qs.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((json) => {
        if (cancelled) return;
        const list = (json?.banners ?? []) as PromoBanner[];
        const filtered = list.filter((b) => b.active).sort((a, b) => a.order - b.order);
        const final = filtered.length > 0 ? filtered : FALLBACK_BANNERS;
        setBanners(final);
        trackBanner("impression", final.map((b) => b.id));
      })
      .catch(() => {
        if (!cancelled) setBanners(FALLBACK_BANNERS);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, zone]);

  const slides = banners ?? [];
  const count = slides.length;

  const go = useCallback(
    (n: number) => {
      if (count === 0) return;
      setIdx(((n % count) + count) % count);
    },
    [count],
  );

  // ── Autoplay (pausa en hover/arrastre, loop) ───────────────────────────────
  useEffect(() => {
    if (paused || dragging || count <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, dragging, count]);

  // ── Gestos de arrastre (swipe) ─────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (count <= 1) return;
    drag.current = { startX: e.clientX, dx: 0, dragging: true };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.dragging) return;
    drag.current.dx = e.clientX - drag.current.startX;
    setDragDx(drag.current.dx);
  };
  const endDrag = () => {
    if (!drag.current.dragging) return;
    const { dx } = drag.current;
    drag.current.dragging = false;
    if (Math.abs(dx) > SWIPE_THRESHOLD) go(idx + (dx < 0 ? 1 : -1));
    setDragDx(0);
    setDragging(false);
  };
  // Si el gesto fue arrastre, cancelamos el click del <Link> interno.
  const onClickCapture = (e: React.MouseEvent) => {
    if (Math.abs(drag.current.dx) > DRAG_GUARD) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Loading: reservamos altura para no saltar (CLS). Mismo aspecto que el slide.
  if (banners === null) {
    return (
      <div className="w-full">
        <div className="w-full">
          <div className="aspect-[16/9] sm:aspect-auto sm:h-[240px] lg:h-[290px] xl:h-[320px] bg-[var(--surface-alt)] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => {
        setPaused(false);
        endDrag();
      }}
    >
      {/* Brandon 2026-06-12: hero FULL-BLEED — ocupa todo el ancho del main
          (sin max-w ni padding lateral, sin esquinas redondeadas) para que no
          queden espacios a los costados, estilo AliExpress/Temu. */}
      <div className="relative w-full">
        <div
          className="group relative overflow-hidden"
          role="region"
          aria-roledescription="carrusel"
          aria-label="Promociones destacadas"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
        >
          {/* Track: todos los slides en fila, translate al índice activo +
              offset del dedo en vivo. Sin transición mientras se arrastra. */}
          <div
            className="flex [&_*]:!rounded-none"
            style={{
              transform: `translateX(calc(-${idx * 100}% + ${dragDx}px))`,
              transition: dragging ? "none" : "transform 500ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {slides.map((b, i) => (
              <div
                key={b.id}
                className={cn("w-full shrink-0 basis-full select-none", i !== idx && "pointer-events-none")}
                aria-hidden={i !== idx}
                onClickCapture={() => {
                  if (Math.abs(drag.current.dx) <= DRAG_GUARD) trackBanner("click", [b.id]);
                }}
              >
                <PromoBannerRenderer banner={b} />
              </div>
            ))}
          </div>

          {/* Flechas — desktop, aparecen al hover del grupo. */}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(idx - 1)}
                aria-label="Banner anterior"
                className="absolute left-3 top-1/2 -translate-y-1/2 hidden md:inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--text-primary)] shadow-md backdrop-blur transition-all hover:bg-white hover:scale-105 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(idx + 1)}
                aria-label="Banner siguiente"
                className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--text-primary)] shadow-md backdrop-blur transition-all hover:bg-white hover:scale-105 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
            </>
          )}
        </div>

        {/* Dots */}
        {count > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {slides.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Ver banner ${i + 1} de ${count}`}
                aria-pressed={i === idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === idx
                    ? "w-8 bg-[var(--text-primary)]"
                    : "w-2 bg-[var(--rule-base)] hover:bg-[var(--rule-mid)]",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
