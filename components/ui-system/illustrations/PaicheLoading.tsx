"use client";

/**
 * PaicheLoading — pantalla/skeleton de carga con el paiche imponente.
 * Reemplaza los `<div className="animate-pulse" />` genéricos de las páginas
 * de carga por la mascota animada con burbujas, ondas y un pulso de luz.
 *
 * Variantes:
 *   - "page"    → loader full-screen con headline + paiche grande
 *   - "section" → loader medio (200-300px) para Suspense fallbacks
 *   - "inline"  → loader chico para botones/cards (~80px)
 */

import { PaicheMascot } from "./PaicheMascot";

interface Props {
  variant?: "page" | "section" | "inline";
  /** Texto opcional de loading (default depende del variant). */
  label?: string;
  className?: string;
}

const SIZES: Record<NonNullable<Props["variant"]>, number> = {
  page: 280,
  section: 160,
  inline: 72,
};

export function PaicheLoading({
  variant = "section",
  label,
  className = "",
}: Props) {
  const size = SIZES[variant];
  // Brandon mayo 15 v4: copy más comercial + atractivo, menos técnico.
  // "Preparando tu Buleje" sonaba a software; ahora habla en lenguaje cliente.
  const defaultLabel =
    variant === "page"
      ? "Ya casi…"
      : variant === "section"
        ? "Un toque…"
        : "";

  if (variant === "inline") {
    return (
      <div
        className={`inline-flex items-center justify-center text-[var(--accent)] ${className}`}
        role="status"
        aria-label={label ?? "Cargando"}
      >
        <div className="relative">
          <PaicheMascot size={size} animated />
        </div>
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div
        className={`relative min-h-[80vh] flex flex-col items-center justify-center bg-[var(--surface-canvas)] overflow-hidden ${className}`}
        role="status"
        aria-label={label ?? defaultLabel}
      >
        {/* Aura radial detrás del paiche */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 12%, transparent) 0%, transparent 60%)",
          }}
        />
        {/* Ondas decorativas */}
        <div aria-hidden className="paiche-loader-waves absolute inset-0 pointer-events-none">
          <div className="paiche-wave paiche-wave-1" />
          <div className="paiche-wave paiche-wave-2" />
          <div className="paiche-wave paiche-wave-3" />
          <div className="paiche-wave paiche-wave-4" />
        </div>
        {/* Particulas flotantes ambientales (10 burbujas dispersas) */}
        <div aria-hidden className="absolute inset-0 pointer-events-none paiche-particles">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <span
              key={i}
              className="paiche-particle"
              style={{
                left: `${(i * 11.3 + 7) % 100}%`,
                animationDelay: `${(i * 0.7) % 5}s`,
                animationDuration: `${5 + (i % 4)}s`,
                width: `${4 + (i % 3) * 2}px`,
                height: `${4 + (i % 3) * 2}px`,
              }}
            />
          ))}
        </div>
        {/* Paiche grande */}
        <div className="relative text-[var(--accent)] paiche-loader-mascot">
          <PaicheMascot size={size} animated strokeWidth={1.75} />
        </div>
        {/* Texto — copy comercial con serif italic accent + dots animados.
            Brandon mayo 15 v4: jerarquía tipográfica más expresiva y cálida. */}
        <div className="relative mt-8 text-center px-4 paiche-loader-text">
          <p
            className="font-black text-[var(--text-primary)] leading-[0.95]"
            style={{ fontSize: "clamp(2rem,4.5vw,3rem)", letterSpacing: "-0.035em" }}
          >
            {label ?? defaultLabel}
            <span
              aria-hidden
              className="inline-block ml-2 italic font-serif text-[var(--accent)]"
              style={{ letterSpacing: "-0.02em" }}
            >
              ya viene
            </span>
          </p>
          <p className="mt-4 inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <span className="paiche-loader-dot" />
            <span className="paiche-loader-dot" style={{ animationDelay: "0.18s" }} />
            <span className="paiche-loader-dot" style={{ animationDelay: "0.36s" }} />
          </p>
        </div>
        <PaicheLoaderStyles />
      </div>
    );
  }

  // section
  return (
    <div
      className={`relative flex flex-col items-center justify-center py-12 sm:py-16 ${className}`}
      role="status"
      aria-label={label ?? defaultLabel}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 6%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="relative text-[var(--accent)] paiche-loader-mascot">
        <PaicheMascot size={size} animated strokeWidth={1.75} />
      </div>
      {(label || defaultLabel) && (
        <div className="relative mt-5 text-center paiche-loader-text">
          <p
            className="font-black text-[var(--text-primary)] leading-tight"
            style={{ fontSize: "clamp(1.25rem,2.4vw,1.75rem)", letterSpacing: "-0.025em" }}
          >
            {label ?? defaultLabel}
            <span
              aria-hidden
              className="inline-block ml-1.5 italic font-serif text-[var(--accent)]"
              style={{ letterSpacing: "-0.02em" }}
            >
              ya viene
            </span>
          </p>
          <p className="mt-2 inline-flex items-center gap-1">
            <span className="paiche-loader-dot" />
            <span className="paiche-loader-dot" style={{ animationDelay: "0.18s" }} />
            <span className="paiche-loader-dot" style={{ animationDelay: "0.36s" }} />
          </p>
        </div>
      )}
      <PaicheLoaderStyles />
    </div>
  );
}

function PaicheLoaderStyles() {
  return (
    <style jsx>{`
      /* Paiche: respiración + leve bobbing horizontal (como si nadara) */
      .paiche-loader-mascot {
        animation: paiche-swim 3.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        will-change: transform, filter;
      }
      @keyframes paiche-swim {
        0%, 100% {
          filter: drop-shadow(0 8px 16px color-mix(in oklab, var(--accent) 15%, transparent));
          transform: translateX(0) translateY(0) scale(1) rotate(0deg);
        }
        25% {
          transform: translateX(4px) translateY(-3px) scale(1.025) rotate(1.5deg);
        }
        50% {
          filter: drop-shadow(0 0 32px color-mix(in oklab, var(--accent) 55%, transparent));
          transform: translateX(0) translateY(-5px) scale(1.05) rotate(0deg);
        }
        75% {
          transform: translateX(-4px) translateY(-3px) scale(1.025) rotate(-1.5deg);
        }
      }
      /* Texto: fade-in suave para que el label aparezca con presencia */
      .paiche-loader-text {
        animation: paiche-text-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @keyframes paiche-text-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .paiche-wave {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 200px;
        height: 200px;
        margin-left: -100px;
        margin-top: -100px;
        border: 2px solid color-mix(in oklab, var(--accent) 35%, transparent);
        border-radius: 50%;
        opacity: 0;
        animation: paiche-wave-expand 3.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
      }
      .paiche-wave-2 {
        animation-delay: 0.9s;
      }
      .paiche-wave-3 {
        animation-delay: 1.8s;
      }
      .paiche-wave-4 {
        animation-delay: 2.7s;
      }
      @keyframes paiche-wave-expand {
        0% {
          transform: scale(0.4);
          opacity: 0.7;
        }
        100% {
          transform: scale(2.6);
          opacity: 0;
        }
      }

      /* Particulas ambientales — burbujas de fondo */
      .paiche-particle {
        position: absolute;
        bottom: -10px;
        border-radius: 9999px;
        background: color-mix(in oklab, var(--accent) 30%, transparent);
        opacity: 0;
        animation: paiche-particle-rise 6s ease-out infinite;
      }
      @keyframes paiche-particle-rise {
        0% {
          transform: translateY(0) translateX(0) scale(0.6);
          opacity: 0;
        }
        15% {
          opacity: 0.5;
        }
        50% {
          transform: translateY(-50vh) translateX(8px) scale(1);
          opacity: 0.4;
        }
        100% {
          transform: translateY(-95vh) translateX(-12px) scale(0.5);
          opacity: 0;
        }
      }

      /* Dots: pelotitas circulares que rebotan en cascada — más legibles
         que los bullets de texto y se ven como un indicador real de carga */
      .paiche-loader-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: var(--accent);
        animation: paiche-dot-bounce 1.1s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        will-change: transform, opacity;
      }
      @keyframes paiche-dot-bounce {
        0%, 80%, 100% {
          opacity: 0.35;
          transform: translateY(0) scale(0.85);
        }
        40% {
          opacity: 1;
          transform: translateY(-6px) scale(1.1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .paiche-loader-mascot,
        .paiche-wave,
        .paiche-particle,
        .paiche-loader-dot {
          animation: none !important;
        }
      }
    `}</style>
  );
}

export default PaicheLoading;
