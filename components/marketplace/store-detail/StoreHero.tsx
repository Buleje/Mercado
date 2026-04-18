"use client";

/**
 * StoreHero — hero editorial de la Store Detail Page.
 *
 * Left: Kicker + H1 + subtitle + stats strip + CTAs.
 * Right: ilustración DS en card canvas (BodegaAbriendo o DoniaElena).
 *
 * Diseño: Buleje/Holded — cero emojis, cero saturación, dark-mode completo.
 * Grid: 1 col mobile → 2 col lg (60/40).
 */

import Link from "next/link";
import { MapPin, Clock, Star, Truck, Phone, Heart } from "lucide-react";
import {
  DoniaElena,
  BodegaAbriendo,
} from "@/components/ui-system/illustrations";
import { cn } from "@/lib/utils";

interface StoreHeroProps {
  name: string;
  category: string;
  zone: string | null;
  description: string | null;
  rating: number;
  reviewCount: number;
  /** Minutos promedio de entrega */
  deliveryMin?: number;
  /** Distancia en km formateada (ej: "0.8 km") */
  distanceLabel?: string;
  /** Horario legible (ej: "Abierto hasta 11pm") */
  scheduleLabel?: string;
  /** Ilustración a usar: "donia-elena" | "bodega-abriendo" */
  illustration?: "donia-elena" | "bodega-abriendo";
  whatsappNumber?: string | null;
}

const TRUST_CHIPS = [
  { label: "Verificada", icon: Star },
  { label: "Delivery incluido", icon: Truck },
  { label: "Atención WhatsApp", icon: Phone },
  { label: "Pago en casa", icon: Heart },
] as const;

export default function StoreHero({
  name,
  category,
  zone,
  description,
  rating,
  reviewCount,
  deliveryMin = 25,
  distanceLabel = "Callería",
  scheduleLabel = "Abierto",
  illustration = "donia-elena",
  whatsappNumber,
}: StoreHeroProps) {
  const Illustration =
    illustration === "donia-elena" ? DoniaElena : BodegaAbriendo;

  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;

  return (
    <section
      aria-labelledby="store-hero-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 lg:gap-12 items-center">
        {/* ── Left: editorial copy ─────────────────────────────────────────── */}
        <div className="max-w-2xl">
          {/* Kicker */}
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-3">
            Bodega &middot; {category}
          </span>

          {/* H1 */}
          <h1
            id="store-hero-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]"
          >
            {name}
          </h1>

          {/* Subtitle */}
          <p className="mt-3 text-base sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
            {description ??
              `Tu bodega de confianza en ${zone ?? "el barrio"} — atendemos con los mejores precios y productos frescos.`}
          </p>

          {/* Stats strip */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-gray-600 dark:text-gray-400">
            {ratingLabel && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-gray-700 text-gray-700 dark:fill-gray-200 dark:text-gray-200" aria-hidden />
                <span className="text-gray-900 dark:text-white font-semibold">
                  {ratingLabel}
                </span>
                <span className="text-gray-400">
                  ({reviewCount} reseñas)
                </span>
              </span>
            )}
            <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
            <span className="flex items-center gap-1">
              <Truck className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {deliveryMin} min promedio
            </span>
            <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {distanceLabel}
            </span>
            <span className="text-gray-300 dark:text-gray-700 select-none">·</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {scheduleLabel}
            </span>
          </div>

          {/* CTAs */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#catalogo"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              Ver catálogo
            </a>
            {whatsappNumber && (
              <a
                href={`https://wa.me/51${whatsappNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
              >
                WhatsApp
              </a>
            )}
            <button
              type="button"
              aria-label="Agregar a favoritos"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
            >
              <Heart className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Trust strip */}
          <div className="mt-8 flex flex-wrap gap-2" role="list" aria-label="Sellos de confianza">
            {TRUST_CHIPS.map(({ label }) => (
              <span
                key={label}
                role="listitem"
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Right: illustration card ─────────────────────────────────────── */}
        <div
          className={cn(
            "hidden lg:flex items-center justify-center",
            "rounded-2xl border border-gray-200 dark:border-gray-800",
            "bg-gray-50 dark:bg-gray-900",
            "p-10 text-gray-700 dark:text-gray-200"
          )}
          aria-hidden
        >
          <Illustration size={200} strokeWidth={1.5} />
        </div>
      </div>
    </section>
  );
}
