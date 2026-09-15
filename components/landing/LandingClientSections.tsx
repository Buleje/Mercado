"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navigation, ChevronLeft, ChevronRight as ChevronRightIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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
        className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-sm disabled:opacity-50"
      >
        {loading ? (
          <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Navigation className="h-4 w-4" />
        )}
        {loading ? "Buscando..." : "Tiendas cerca de mí"}
      </button>
      {error && (
        <span className="text-xs text-gray-400">{error}</span>
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
          className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none transition-colors group-focus-within:text-primary"
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
          className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 pl-12 pr-28 py-4 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all duration-300"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary-dark text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Buscar
        </button>
        {/* Pulsing dot indicator */}
        {!isFocused && (
          <span className="absolute right-24 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
      </div>
    </form>
  );
}

/* ── Category cards with analytics tracking + hover animations ── */
import {
  Store,
  UtensilsCrossed,
  Wine,
  Pill,
  Apple,
  CroissantIcon,
  Sparkles,
  Dog,
  Beef,
  Snowflake,
  Cookie,
  Droplets,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bodegas: Store,
  restaurantes: UtensilsCrossed,
  licoreria: Wine,
  farmacia: Pill,
  "frutas-verduras": Apple,
  panaderia: CroissantIcon,
  limpieza: Sparkles,
  mascotas: Dog,
  carniceria: Beef,
  congelados: Snowflake,
  snacks: Cookie,
  higiene: Droplets,
};

interface CategoryDef {
  slug: string;
  label: string;
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? Store;
            return (
              <Link
                key={cat.slug}
                href={`/marketplace?categoria=${cat.slug}`}
                onClick={() => handleClick(cat.slug, cat.label)}
                className={cn(
                  "group relative flex flex-col bg-white dark:bg-gray-900",
                  "border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6",
                  "transition-all duration-300",
                  "hover:border-gray-900 dark:hover:border-gray-500",
                )}
              >
                <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 transition-colors group-hover:bg-gray-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-gray-900 group-hover:border-transparent">
                  <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </div>

                <h3 className="mt-4 text-sm sm:text-base font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {cat.label}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed line-clamp-2 min-h-[2rem]">
                  {cat.desc}
                </p>

                <span className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 inline-flex items-center justify-between text-[length:var(--ts-2xs)] font-bold text-gray-500 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  <span>Explorar</span>
                  <ChevronRightIcon
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={1.75}
                  />
                </span>
              </Link>
            );
          })}
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
    <section className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-b border-gray-900 dark:border-gray-200">
      <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 dark:text-gray-500 shrink-0 hidden sm:inline">
            Nuevo cliente
          </span>
          <span className="h-3.5 w-px bg-white/20 dark:bg-gray-300 shrink-0 hidden sm:inline-block" />
          <p className="text-xs sm:text-sm font-semibold truncate">
            Primera compra con <span className="font-extrabold">10% de descuento</span>
            <span className="mx-2 text-white/40 dark:text-gray-400">·</span>
            Código{" "}
            <code className="font-mono text-[length:var(--ts-2xs)] sm:text-xs px-1.5 py-0.5 rounded bg-white/10 dark:bg-gray-100 text-white dark:text-gray-900 tracking-wider">
              BIENVENIDO
            </code>
          </p>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            try { localStorage.setItem("discount-banner-dismissed", "1"); } catch { /* silent */ }
          }}
          className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white/60 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 hover:bg-white/10 dark:hover:bg-gray-100 transition-colors"
          aria-label="Cerrar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
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
            Lo que dicen nuestros <span className="text-primary">clientes</span>
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
                  className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 h-full hover:shadow-md hover:-translate-y-1 transition-all duration-300"
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
                    <div className="h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
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
                idx === activeIdx ? "w-6 bg-primary" : "w-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
              }`}
              aria-label={`Ir a opinión ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
