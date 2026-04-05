"use client";

import { useState, useEffect, useCallback, startTransition, useRef } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviews } from "@/contexts/reviews-context";
import { useInView } from "@/hooks/use-in-view";

const STATIC_TESTIMONIALS = [
  {
    name: "María López",
    location: "Yarinacocha",
    text: "Excelente servicio, los productos llegan frescos y a buen precio. Ya no necesito ir al mercado.",
    rating: 5,
  },
  {
    name: "Carlos Ramírez",
    location: "Manantay",
    text: "Pedir por WhatsApp es súper fácil. En menos de una hora ya tenía todo en mi casa. ¡Recomendado!",
    rating: 5,
  },
  {
    name: "Ana Gutiérrez",
    location: "Callería",
    text: "La calidad de las frutas y verduras es increíble. Se nota que seleccionan lo mejor. Cliente fija.",
    rating: 5,
  },
];

const INTERVAL = 4500;



type TItem = {
  name: string;
  location: string;
  text: string;
  rating: number;
  isUser: boolean;
};

function locationLabel(loc: string) {
  if (loc.startsWith("GPS:")) return "Zona local";
  const short = loc.split(",")[0].trim();
  return short.length > 30 ? short.slice(0, 28) + "…" : short;
}

function TestiCard({ item, position }: { item: TItem; position: "left" | "center" | "right" }) {
  const isCenter = position === "center";
  return (
    <div
      style={{
        transform: isCenter ? "scale(1) translateY(0)" : "scale(0.86) translateY(10px)",
        opacity: isCenter ? 1 : 0.48,
        transition: "transform 0.38s ease-out, opacity 0.38s ease-out",
      }}
      className={cn(
        "relative bg-white dark:bg-card rounded-2xl border dark:border-card-border flex flex-col h-full",
        isCenter
          ? cn(
              "p-7 shadow-xl",
              item.isUser
                ? "border-primary/30 ring-1 ring-primary/15"
                : "border-gray-200"
            )
          : "p-5 shadow-sm border-gray-100 pointer-events-none select-none"
      )}
    >
      {item.isUser && isCenter && (
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/8 px-2 py-0.5 rounded-full">
          Cliente verificado
        </span>
      )}
      <Quote
        className={cn(
          "mb-3",
          isCenter ? "h-7 w-7 text-primary/18" : "h-5 w-5 text-gray-200"
        )}
      />
      <p
        className={cn(
          "leading-relaxed mb-5 flex-1",
          isCenter
            ? "text-base text-foreground line-clamp-5"
            : "text-sm text-gray-500 line-clamp-3"
        )}
      >
        {item.text}
      </p>
      <div className="flex items-center gap-0.5 mb-3">
        {[...Array(5)].map((_, j) => (
          <Star
            key={j}
            className={cn(
              "h-4 w-4",
              j < item.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"
            )}
          />
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "shrink-0 rounded-full flex items-center justify-center font-bold text-white",
            isCenter ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"
          )}
          style={{
            background: `hsl(${item.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 55%, 45%)`,
          }}
        >
          {item.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p
            className={cn(
              "font-bold",
              isCenter ? "text-foreground text-sm" : "text-gray-600 text-xs"
            )}
          >
            {item.name}
          </p>
          <p className="text-xs text-muted">{item.location}</p>
        </div>
      </div>
    </div>
  );
}

// The entire 3-card row slides as one unit
const trackVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? "32%" : "-32%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? "-32%" : "32%",
    opacity: 0,
  }),
};

export default function Testimonials() {
  const { reviews } = useReviews();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => { startTransition(() => setMounted(true)); }, []);

  // Only include user reviews after mount to prevent hydration mismatch
  // (reviews load async from API/localStorage, so SSR always has [])
  const allTestimonials: TItem[] = [
    ...(mounted
      ? reviews.map((r) => ({
          name: r.name,
          location: locationLabel(r.location),
          text: r.text,
          rating: r.rating,
          isUser: true,
        }))
      : []),
    ...STATIC_TESTIMONIALS.map((t) => ({ ...t, isUser: false })),
  ];

  const n = allTestimonials.length;
  // Clamp current to valid range when item count changes (e.g. reviews load)
  const safeCurrent = n > 0 ? current % n : 0;

  const advance = useCallback(
    (dir: 1 | -1) => {
      setDirection(dir);
      setCurrent((p) => (p + dir + n) % n);
    },
    [n]
  );

  useEffect(() => {
    if (isPaused || n === 0) return;
    const t = setInterval(() => advance(1), INTERVAL);
    return () => clearInterval(t);
  }, [isPaused, n, advance]);

  const handleNav = (dir: 1 | -1) => {
    advance(dir);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 8000);
  };

  const goTo = (i: number) => {
    setDirection(i > safeCurrent ? 1 : -1);
    setCurrent(i);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 8000);
  };

  const [sectionRef, sectionInView] = useInView<HTMLElement>({ threshold: 0.1 });
  void sectionInView; // ref still needed for lazy-load trigger

  if (n === 0) return null;

  const prevIdx = (safeCurrent - 1 + n) % n;
  const nextIdx = (safeCurrent + 1) % n;

  // Review schema for static testimonials (SSR-safe, not dependent on dynamic reviews)
  const reviewSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://www.buleje.pe/#grocery-store",
    review: STATIC_TESTIMONIALS.map((t, i) => ({
      "@type": "Review",
      author: { "@type": "Person", name: t.name },
      datePublished: ["2025-09-15", "2025-10-02", "2025-11-20"][i],
      reviewBody: t.text,
      reviewRating: { "@type": "Rating", ratingValue: String(t.rating), bestRating: "5" },
    })),
  };

  return (
    <section ref={sectionRef} id="nuestros-clientes" className="py-20 sm:py-28 bg-primary/5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Star className="w-3.5 h-3.5 fill-primary" />
            Reseñas verificadas
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            Lo que dicen nuestros{" "}
            <span className="relative inline-block text-primary">
              clientes
              <svg className="absolute -bottom-1.5 left-0 w-full h-2.5" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M2 8 Q30 2 60 6 Q90 10 98 3" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-base text-muted max-w-xl mx-auto">
            Miles de familias confían en nuestra bodega cada semana.
          </p>
          {/* Rating summary */}
          <div className="mt-6 inline-flex items-center gap-3 bg-surface rounded-2xl border border-gray-100 px-5 py-3">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <span className="font-extrabold text-foreground text-lg">4.8</span>
            <span className="text-muted text-sm">·</span>
            <span className="text-muted text-sm font-medium">+800 reseñas</span>
          </div>
        </div>

        {/* Carousel */}
        <div
          className="relative"
          role="region"
          aria-roledescription="carrusel"
          aria-label="Testimonios de clientes"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; setIsPaused(true); }}
          onTouchMove={(e) => { touchEndX.current = e.touches[0].clientX; }}
          onTouchEnd={() => {
            const diff = touchStartX.current - touchEndX.current;
            if (Math.abs(diff) > 50) {
              handleNav(diff > 0 ? 1 : -1);
            }
            setTimeout(() => setIsPaused(false), 5000);
          }}
        >
          {/* Nav arrows */}
          <button
            onClick={() => handleNav(-1)}
            className="absolute left-0 sm:-left-1 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 sm:bg-white shadow-md border border-gray-100 hover:border-primary/30 hover:text-primary text-gray-400 transition-all"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            onClick={() => handleNav(1)}
            className="absolute right-0 sm:-right-1 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 sm:bg-white shadow-md border border-gray-100 hover:border-primary/30 hover:text-primary text-gray-400 transition-all"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          {/* Card track: 1 card on mobile, 3 on desktop */}
          <div className="overflow-hidden px-10 sm:px-14">
            <div className="relative" style={{ minHeight: 310 }} aria-live="polite">
              {mounted ? (
                <AnimatePresence custom={direction}>
                  <m.div
                    key={safeCurrent}
                    custom={direction}
                    variants={trackVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: "spring", stiffness: 220, damping: 26 },
                      opacity: { duration: 0.18 },
                    }}
                    style={{ position: "absolute", width: "100%", top: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch"
                    role="group"
                    aria-roledescription="diapositiva"
                    aria-label={`Testimonio ${safeCurrent + 1} de ${n}`}
                  >
                    <div className="hidden md:flex flex-col">
                      <TestiCard item={allTestimonials[prevIdx]} position="left" />
                    </div>
                    <TestiCard item={allTestimonials[safeCurrent]} position="center" />
                    <div className="hidden md:flex flex-col">
                      <TestiCard item={allTestimonials[nextIdx]} position="right" />
                    </div>
                  </m.div>
                </AnimatePresence>
              ) : (
                <div
                  className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch"
                  role="group"
                  aria-roledescription="diapositiva"
                  aria-label={`Testimonio ${safeCurrent + 1} de ${n}`}
                >
                  <div className="hidden md:flex flex-col">
                    <TestiCard item={allTestimonials[prevIdx]} position="left" />
                  </div>
                  <TestiCard item={allTestimonials[safeCurrent]} position="center" />
                  <div className="hidden md:flex flex-col">
                    <TestiCard item={allTestimonials[nextIdx]} position="right" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="max-w-xs mx-auto mt-6 h-0.5 bg-primary/12 rounded-full overflow-hidden">
            {mounted && !isPaused && (
              <m.div
                key={`bar-${safeCurrent}`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: INTERVAL / 1000, ease: "linear" }}
                className="h-full bg-primary/60 origin-left"
              />
            )}
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {allTestimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === safeCurrent ? "w-6 bg-primary" : "w-2 bg-primary/30 hover:bg-primary/50"
                )}
                aria-label={`Testimonio ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
