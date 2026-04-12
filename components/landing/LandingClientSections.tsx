"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";

/* ── Geolocation prompt ── */
export function GeolocationPrompt() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeo = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta ubicación");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        router.push(
          `/marketplace?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
        );
      },
      () => {
        setLoading(false);
        setError("No pudimos obtener tu ubicación");
      },
      { timeout: 8000 }
    );
  }, [router]);

  return (
    <div className="flex items-center gap-3 mt-4">
      <button
        type="button"
        onClick={handleGeo}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold px-5 py-2.5 rounded-xl border border-white/20 backdrop-blur-sm transition-all text-sm disabled:opacity-50"
      >
        {loading ? (
          <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Navigation className="h-4 w-4" />
        )}
        {loading ? "Buscando..." : "Tiendas cerca de mí"}
      </button>
      {error && (
        <span className="text-xs text-white/70">{error}</span>
      )}
    </div>
  );
}

/* ── Animated Search Bar with typing effect ── */
const SEARCH_PLACEHOLDERS = [
  "Busca arroz, leche, cerveza...",
  "¿Qué necesitas? Pan, huevos, aceite...",
  "Frutas frescas, verduras, carnes...",
  "Busca tu bodega favorita...",
  "Snacks, galletas, dulces...",
];

export function AnimatedSearchBar() {
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isFocused) return;

    const target = SEARCH_PLACEHOLDERS[placeholderIdx];
    let charIdx = 0;

    if (isTyping) {
      intervalRef.current = setInterval(() => {
        charIdx++;
        setDisplayText(target.slice(0, charIdx));
        if (charIdx >= target.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Pause before erasing
          setTimeout(() => setIsTyping(false), 2000);
        }
      }, 50);
    } else {
      let len = target.length;
      intervalRef.current = setInterval(() => {
        len--;
        setDisplayText(target.slice(0, len));
        if (len <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPlaceholderIdx((prev) => (prev + 1) % SEARCH_PLACEHOLDERS.length);
          setIsTyping(true);
        }
      }, 30);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [placeholderIdx, isTyping, isFocused]);

  return (
    <form action="/marketplace" method="GET" className="mt-8 max-w-xl mx-auto">
      <div className="relative group">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none transition-colors group-focus-within:text-teal-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          name="buscar"
          placeholder={isFocused ? "¿Qué necesitas?" : displayText || "¿Qué necesitas?"}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full rounded-2xl bg-white pl-12 pr-28 py-4 text-base text-gray-900 placeholder-gray-400 outline-none shadow-xl shadow-black/10 focus:ring-4 focus:ring-white/30 focus:scale-[1.02] transition-all duration-300"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Buscar
        </button>
        {/* Pulsing dot indicator */}
        {!isFocused && (
          <span className="absolute right-24 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
        )}
      </div>
    </form>
  );
}

/* ── Category cards with analytics tracking + hover animations ── */
interface CategoryDef {
  emoji: string;
  label: string;
  slug: string;
  color: string;
  desc: string;
}

export function CategoriesGridClient({ categories }: { categories: CategoryDef[] }) {
  const handleClick = useCallback((slug: string, label: string) => {
    try {
      navigator.sendBeacon(
        "/api/analytics/track",
        JSON.stringify({
          event: "category_click",
          properties: { slug, label, source: "landing_page" },
        })
      );
    } catch {
      /* silent */
    }
  }, []);

  return (
    <section className="py-12 sm:py-16 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            ¿Qué estás buscando?
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Explora por categoría y encuentra todo lo que necesitas cerca de ti
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/marketplace?categoria=${cat.slug}`}
              onClick={() => handleClick(cat.slug, cat.label)}
              className="group relative overflow-hidden rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:scale-[1.03]"
            >
              <div className={`absolute inset-0 bg-linear-to-br ${cat.color} opacity-90 group-hover:opacity-100 transition-opacity duration-300`} />
              {/* Shine effect on hover */}
              <div className="absolute inset-0 bg-linear-to-br from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-full transition-all duration-700 ease-out" />
              <div className="relative z-10">
                <span className="text-4xl sm:text-5xl block mb-3 group-hover:scale-125 group-hover:rotate-[-8deg] transition-transform duration-300">
                  {cat.emoji}
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  {cat.label}
                </h3>
                <p className="text-sm text-white/75 mt-1 group-hover:text-white/95 transition-colors">
                  {cat.desc}
                </p>
                {/* Hover CTA */}
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-white/0 group-hover:text-white transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                  Ir a comprar <ChevronRightIcon className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── First-purchase discount banner ── */
export function DiscountBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("discount-banner-dismissed") === "1";
  });

  if (dismissed) return null;

  return (
    <section className="bg-linear-to-r from-orange-500 via-amber-500 to-yellow-500">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-white min-w-0">
          <span className="text-2xl shrink-0">🎉</span>
          <p className="text-sm sm:text-base font-bold truncate">
            ¡Primera compra con <span className="underline underline-offset-2">10% de descuento</span>!
            Usa el código <code className="bg-white/20 px-2 py-0.5 rounded text-white font-mono">BIENVENIDO</code>
          </p>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            try { localStorage.setItem("discount-banner-dismissed", "1"); } catch { /* silent */ }
          }}
          className="shrink-0 text-white/80 hover:text-white text-lg font-bold px-2"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    </section>
  );
}

/* ── Reviews carousel with auto-scroll + animations ── */
interface ReviewData {
  id: string;
  name: string;
  text: string;
  rating: number;
  date: Date | string;
}

export function ReviewsCarousel({ reviews }: { reviews: ReviewData[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    // Calculate active index
    const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 20 : 340;
    setActiveIdx(Math.round(el.scrollLeft / cardWidth));
  }, []);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    updateScrollButtons();
    return () => el.removeEventListener("scroll", updateScrollButtons);
  }, [updateScrollButtons]);

  // Auto-scroll every 5s
  useEffect(() => {
    const timer = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 10) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: el.clientWidth * 0.8, behavior: "smooth" });
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  if (reviews.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            Lo que dicen nuestros <span className="text-teal-600">clientes</span>
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Miles de personas ya compran en Buleje
          </p>
        </div>

        {/* Carousel container */}
        <div className="relative group/carousel">
          {/* Left arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 h-10 w-10 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all opacity-0 group-hover/carousel:opacity-100"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Scrollable row */}
          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pb-4"
          >
            {reviews.map((r, idx) => (
              <div
                key={r.id}
                className="shrink-0 w-[320px] sm:w-90 snap-start"
              >
                <div
                  className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 h-full hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                  style={{
                    animationDelay: `${idx * 100}ms`,
                  }}
                >
                  {/* Stars */}
                  <div className="flex items-center gap-0.5 text-yellow-400 mb-3">
                    {Array.from({ length: r.rating }, (_, i) => (
                      <span key={i} className="text-lg">★</span>
                    ))}
                    {Array.from({ length: 5 - r.rating }, (_, i) => (
                      <span key={i} className="text-lg text-gray-300 dark:text-gray-600">★</span>
                    ))}
                  </div>
                  {/* Quote */}
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4 line-clamp-4">
                    &ldquo;{r.text}&rdquo;
                  </p>
                  {/* Author */}
                  <div className="flex items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="h-9 w-9 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-700 dark:text-teal-300 font-bold text-sm">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{r.name}</p>
                      <p className="text-xs text-gray-400">Cliente verificado</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right arrow */}
          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 h-10 w-10 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all opacity-0 group-hover/carousel:opacity-100"
              aria-label="Siguiente"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {reviews.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                const el = scrollRef.current;
                if (!el) return;
                const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 20 : 340;
                el.scrollTo({ left: cardWidth * idx, behavior: "smooth" });
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === activeIdx ? "w-6 bg-teal-600" : "w-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
              }`}
              aria-label={`Ir a opinión ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
