// ═══════════════════════════════════════════════════════
// HERO BLOCK - Editable Hero Section
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import Link from "next/link";
import { ShoppingCart, ArrowRight, Truck, Star } from "lucide-react";

// ─── Schema & Types ─────────────────────────────────────
export const HeroBlockSchema = z.object({
  title: z.string().min(1).default("Bienvenido a Bodega San Martín"),
  subtitle: z.string().default("Productos frescos, precios justos"),
  description: z.string().optional(),
  ctaText: z.string().default("Ver productos"),
  ctaLink: z.string().default("/productos"),
  secondaryCTAText: z.string().optional().default("Hacer pedido"),
  secondaryCTALink: z.string().optional(),
  showBadge: z.boolean().default(true),
  badgeText: z.string().default("🚚 Envío gratis desde S/ 50"),
  showStats: z.boolean().default(true),
  backgroundColor: z.string().default("#312e81"),
  textColor: z.string().default("#ffffff"),
  accentColor: z.string().default("#3b82f6"),
  backgroundImage: z.string().url().optional(),
  showAnimations: z.boolean().default(true),
});

export type HeroBlockProps = z.infer<typeof HeroBlockSchema>;

// ─── Component ──────────────────────────────────────────
export default function HeroBlock(props: Partial<HeroBlockProps>) {
  const {
    title = "Bienvenido a Bodega San Martín",
    subtitle = "Productos frescos, precios justos",
    description,
    ctaText = "Ver productos",
    ctaLink = "/productos",
    secondaryCTAText = "Hacer pedido",
    secondaryCTALink,
    showBadge = true,
    badgeText = "🚚 Envío gratis desde S/ 50",
    showStats = true,
    backgroundColor = "#312e81",
    textColor = "#ffffff",
    accentColor = "#3b82f6",
    backgroundImage,
    showAnimations = true,
  } = props;

  return (
    <section 
      id="inicio" 
      className="relative overflow-hidden" 
      style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}
    >
      {/* Animations */}
      {showAnimations && (
        <style>{`
          @keyframes floatA {
            0%,100% { transform: translateY(0px) rotate(0deg); }
            33%      { transform: translateY(-12px) rotate(0.3deg); }
            66%      { transform: translateY(-6px) rotate(-0.3deg); }
          }
          @keyframes auroraA {
            0%,100% { opacity: 1;   transform: scale(1) translate(0,0); }
            50%      { opacity: 0.5; transform: scale(1.2) translate(3%, -4%); }
          }
          @keyframes auroraB {
            0%,100% { opacity: 0.7; transform: scale(1) translate(0,0); }
            50%      { opacity: 1;   transform: scale(0.85) translate(-5%, 5%); }
          }
          @keyframes floatBadge {
            0%,100% { transform: translateY(0) rotate(-2deg); }
            50%     { transform: translateY(-8px) rotate(2deg); }
          }
        `}</style>
      )}

      {/* Background */}
      {backgroundImage ? (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{ backgroundImage: `url(${backgroundImage})` }}
          aria-hidden="true"
        />
      ) : (
        <div 
          className="absolute inset-0" 
          style={{ background: backgroundColor }}
          aria-hidden="true"
        />
      )}

      {/* Aurora effects (only if animations enabled) */}
      {showAnimations && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div style={{
            position: "absolute", top: "-30%", right: "-20%",
            width: "75vw", height: "75vw",
            background: `radial-gradient(ellipse, ${accentColor}40 0%, ${accentColor}15 40%, transparent 65%)`,
            filter: "blur(80px)",
            animation: "auroraA 14s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", bottom: "-25%", left: "-10%",
            width: "60vw", height: "60vw",
            background: "radial-gradient(ellipse, rgba(251,191,36,0.16) 0%, rgba(245,158,11,0.05) 40%, transparent 65%)",
            filter: "blur(100px)",
            animation: "auroraB 18s ease-in-out infinite",
          }} />
        </div>
      )}

      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 0.5px, transparent 0.5px)",
        backgroundSize: "32px 32px",
        opacity: 0.12,
      }} aria-hidden="true" />

      {/* Floating badge */}
      {showBadge && (
        <div
          className="absolute z-30 hidden lg:block"
          style={{
            top: "15%",
            right: "8%",
            animation: showAnimations ? "floatBadge 4s ease-in-out infinite" : "none",
          }}
        >
          <div className="relative">
            <div className="absolute -inset-4 bg-linear-to-r from-green-500/30 to-emerald-400/30 blur-xl rounded-full" />
            <div 
              className="relative px-6 py-3 backdrop-blur-sm border border-white/20 rounded-full shadow-2xl"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <p className="text-sm font-semibold text-white tracking-wide">
                {badgeText}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight"
          style={{ color: textColor }}
        >
          {title}
        </h1>

        <p 
          className="text-lg sm:text-xl md:text-2xl mb-4 max-w-3xl mx-auto"
          style={{ color: textColor, opacity: 0.9 }}
        >
          {subtitle}
        </p>

        {description && (
          <p 
            className="text-base sm:text-lg mb-8 max-w-2xl mx-auto"
            style={{ color: textColor, opacity: 0.75 }}
          >
            {description}
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Link
            href={ctaLink}
            className="group px-8 py-4 rounded-xl font-bold text-white shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            <ShoppingCart className="w-5 h-5" />
            {ctaText}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>

          {secondaryCTAText && secondaryCTALink &&  (
            <Link
              href={secondaryCTALink}
              className="px-8 py-4 rounded-xl font-bold border-2 backdrop-blur-sm hover:backdrop-blur-md transform hover:-translate-y-1 transition-all duration-300"
              style={{ 
                borderColor: textColor,
                color: textColor,
                backgroundColor: `${backgroundColor}40`
              }}
            >
              {secondaryCTAText}
            </Link>
          )}
        </div>

        {/* Stats */}
        {showStats && (
          <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
            <div className="flex items-center gap-2">
              <Truck className="w-6 h-6" style={{ color: accentColor }} />
              <span className="font-semibold" style={{ color: textColor }}>
                Entrega rápida
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-6 h-6" style={{ color: accentColor }} />
              <span className="font-semibold" style={{ color: textColor }}>
                Productos frescos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-6 h-6" style={{ color: accentColor }} />
              <span className="font-semibold" style={{ color: textColor }}>
                Pedidos online
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const HeroBlockMetadata = {
  type: "hero",
  name: "Hero Principal",
  description: "Sección hero con título, CTAs y animaciones",
  category: "landing" as const,
  icon: "Sparkles",
  defaultProps: HeroBlockSchema.parse({}),
  propsSchema: HeroBlockSchema,
};
