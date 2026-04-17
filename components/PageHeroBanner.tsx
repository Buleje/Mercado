"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DbPageHero } from "@/lib/db/page-heroes.db";

interface PageHeroBannerProps {
  /** Custom hero from DB (null = use fallback) */
  hero?: DbPageHero | null;
  /** Fallback title when no custom hero */
  fallbackTitle: string;
  /** Fallback subtitle */
  fallbackSubtitle?: string;
  /** Fallback gradient from color */
  fallbackGradientFrom?: string;
  /** Fallback gradient to color */
  fallbackGradientTo?: string;
  /** Children rendered inside the hero (search bars, stats, etc) */
  children?: React.ReactNode;
}

const DEFAULT_FROM = "#1e40af"; // emerald-800
const DEFAULT_TO = "#312e81"; // indigo-900

export default function PageHeroBanner({
  hero,
  fallbackTitle,
  fallbackSubtitle,
  fallbackGradientFrom,
  fallbackGradientTo,
  children,
}: PageHeroBannerProps) {
  const title = hero?.title || fallbackTitle;
  const subtitle = hero?.subtitle || fallbackSubtitle;
  const imageUrl = hero?.imageUrl;
  const ctaText = hero?.ctaText;
  const ctaLink = hero?.ctaLink;
  const from = hero?.gradientFrom || fallbackGradientFrom || DEFAULT_FROM;
  const to = hero?.gradientTo || fallbackGradientTo || DEFAULT_TO;

  return (
    <section className="relative overflow-hidden py-16 sm:py-24 lg:py-32">
      {/* Background: gradient + optional image */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      />
      {imageUrl && (
        <Image
          src={imageUrl}
          alt=""
          fill
          className="object-cover opacity-30 mix-blend-overlay"
          priority
        />
      )}
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/5 blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-white/5 blur-[80px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-base sm:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
        {ctaText && ctaLink && (
          <div className="mt-8">
            <Link
              href={ctaLink}
              className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold text-sm px-6 py-3 rounded-xl hover:bg-white/90 transition-all shadow-lg"
            >
              {ctaText}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
