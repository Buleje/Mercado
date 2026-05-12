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
  const defaultLabel =
    variant === "page"
      ? "Preparando tu Buleje…"
      : variant === "section"
        ? "Cargando…"
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
        {/* Texto */}
        <div className="relative mt-8 text-center px-4">
          <p className="text-[clamp(1.5rem,3vw,2.25rem)] font-black tracking-tight text-[var(--text-primary)] leading-tight">
            {label ?? defaultLabel}
          </p>
          <p className="mt-2 text-[length:var(--ts-base)] font-semibold text-[var(--text-secondary)]">
            <span className="paiche-loader-dot">•</span>
            <span className="paiche-loader-dot" style={{ animationDelay: "0.2s" }}>•</span>
            <span className="paiche-loader-dot" style={{ animationDelay: "0.4s" }}>•</span>
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
        <p className="relative mt-4 text-[length:var(--ts-sm)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-secondary)]">
          {label ?? defaultLabel}
        </p>
      )}
      <PaicheLoaderStyles />
    </div>
  );
}

function PaicheLoaderStyles() {
  return (
    <style jsx>{`
      .paiche-loader-mascot {
        animation: paiche-pulse 2.4s ease-in-out infinite;
      }
      @keyframes paiche-pulse {
        0%, 100% {
          filter: drop-shadow(0 0 0 transparent);
          transform: scale(1);
        }
        50% {
          filter: drop-shadow(0 0 28px color-mix(in oklab, var(--accent) 55%, transparent));
          transform: scale(1.04);
        }
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

      .paiche-loader-dot {
        display: inline-block;
        margin: 0 0.15em;
        animation: paiche-dot-bounce 1.4s ease-in-out infinite;
        font-size: 1.5em;
        line-height: 1;
        color: var(--accent);
      }
      @keyframes paiche-dot-bounce {
        0%, 80%, 100% {
          opacity: 0.3;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-4px);
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
