"use client";

/**
 * components/store/PromoBannerRotator.tsx
 *
 * Platform-wide rotary promo banners displayed above the catalog on the home page.
 * Auto-rotates every 5 seconds. Data source: hardcoded array (can be migrated to DB later).
 *
 * Accessibility: pause on hover, keyboard navigation, ARIA live region.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Truck, Smartphone, Star, CreditCard, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Banner Data ─────────────────────────────────────────────────────────────

export interface PromoBanner {
  id: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  bgColor: string; // Tailwind gradient or solid color class
  textColor?: string;
  icon?: LucideIcon;
}

/** Renderer explicito de iconos por banner.id — cumple react-hooks/static-components. */
function BannerIcon({ id }: { id: string }) {
  const common = { className: "h-4 w-4 shrink-0", strokeWidth: 1.75, "aria-hidden": true } as const;
  if (id === "envio-gratis") return <Truck {...common} />;
  if (id === "yape-descuento") return <Smartphone {...common} />;
  if (id === "puntos-lealtad") return <Star {...common} />;
  if (id === "fiado-digital") return <CreditCard {...common} />;
  return null;
}

const DEFAULT_BANNERS: PromoBanner[] = [
  {
    id: "envio-gratis",
    title: "Envio GRATIS en pedidos mayores a S/50",
    subtitle: "Delivery rápido a toda la zona",
    ctaText: "Comprar ahora",
    ctaLink: "/tienda",
    bgColor: "bg-[var(--accent)]",
    icon: Truck,
  },
  {
    id: "yape-descuento",
    title: "Paga con Yape y obtiene 5% de descuento",
    subtitle: "Valido en todas tus compras",
    ctaText: "Ver productos",
    ctaLink: "/tienda",
    bgColor: "bg-[var(--accent)]",
    icon: Smartphone,
  },
  {
    id: "puntos-lealtad",
    title: "Gana puntos en cada compra",
    subtitle: "Acumula y canjea por productos gratis",
    ctaText: "Mis puntos",
    ctaLink: "/puntos",
    bgColor: "bg-[var(--brand-ink)]",
    icon: Star,
  },
  {
    id: "fiado-digital",
    title: "Fiado Digital: compra ahora, paga despues",
    subtitle: "Sin intereses en 2 cuotas",
    ctaText: "Saber mas",
    ctaLink: "/mi-credito",
    bgColor: "bg-[var(--brand-ink)]",
    icon: CreditCard,
  },
];

// ── Auto-rotation interval ──────────────────────────────────────────────────

const ROTATION_INTERVAL_MS = 5000;

// ── Component ───────────────────────────────────────────────────────────────

interface PromoBannerRotatorProps {
  banners?: PromoBanner[];
  className?: string;
}

export default function PromoBannerRotator({
  banners = DEFAULT_BANNERS,
  className,
}: PromoBannerRotatorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalBanners = banners.length;

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalBanners);
  }, [totalBanners]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalBanners) % totalBanners);
  }, [totalBanners]);

  // Auto-rotation
  useEffect(() => {
    if (isPaused || totalBanners <= 1) return;

    timerRef.current = setInterval(goToNext, ROTATION_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, goToNext, totalBanners]);

  if (totalBanners === 0) return null;

  const banner = banners[currentIndex];

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Promociones"
      aria-live="polite"
    >
      <div
        className={cn(
          "relative py-3 sm:py-4 px-4 sm:px-6 transition-all duration-[var(--dur-slow)] ease-in-out",
          banner.bgColor,
          banner.textColor ?? "text-white",
        )}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left arrow */}
          {totalBanners > 1 && (
            <button
              onClick={goToPrev}
              className="flex-shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}

          {/* Content */}
          <div className="flex-1 text-center min-w-0">
            <p className="inline-flex items-center gap-2 text-sm sm:text-base font-bold truncate">
              <BannerIcon id={banner.id} />
              <span className="truncate">{banner.title}</span>
            </p>
            {banner.subtitle && (
              <p className="text-xs sm:text-sm opacity-90 mt-0.5 truncate">
                {banner.subtitle}
              </p>
            )}
          </div>

          {/* CTA + Right arrow */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {banner.ctaText && banner.ctaLink && (
              <Link
                href={banner.ctaLink}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-full transition-colors whitespace-nowrap backdrop-blur-sm"
              >
                {banner.ctaText}
              </Link>
            )}
            {totalBanners > 1 && (
              <button
                onClick={goToNext}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
                aria-label="Siguiente banner"
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Dot indicators */}
        {totalBanners > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {banners.map((b, idx) => (
              <button
                key={b.id}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-[var(--dur-base)]",
                  idx === currentIndex
                    ? "w-4 bg-white"
                    : "w-1.5 bg-white/40 hover:bg-white/60",
                )}
                aria-label={`Ir a banner ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
