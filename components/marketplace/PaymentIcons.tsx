"use client";

/**
 * PaymentIcons — íconos de métodos de pago para el marketplace peruano.
 *
 * Logos OFICIALES (Brandon 2026-07-06): si existe el archivo oficial en
 * `public/payment-logos/{método}.svg` (los que subís del brand kit), se usa ese
 * logo real. Si el archivo no está (o falla la carga) cae al ARTE CUSTOM —
 * badge de color + glifo — vía `onError`, así nunca hay imágenes rotas.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

// Medios con archivo de logo oficial en public/payment-logos/. Sumá acá la clave
// + el archivo para habilitar otro (ej. "tarjeta").
const OFFICIAL_LOGOS = new Set(["yape", "plin"]);

export type PaymentMethod =
  | "yape"
  | "plin"
  | "efectivo"
  | "cash"
  | "card"
  | "tarjeta"
  | "transfer"
  | "transferencia";

const SIZE_MAP = { sm: 20, md: 28, lg: 40 } as const;

function normalize(m: string): PaymentMethod {
  const s = m.toLowerCase().trim();
  if (s.includes("yape")) return "yape";
  if (s.includes("plin")) return "plin";
  if (s.includes("efect") || s.includes("cash")) return "efectivo";
  if (s.includes("transfer")) return "transfer";
  return "card";
}

interface Props {
  method: string;
  /** Tamaño en px (número) o preset. Default "md" (28px). */
  size?: number | keyof typeof SIZE_MAP;
  className?: string;
  title?: string;
}

/**
 * Ícono cuadrado redondeado de un método de pago. `rx` = esquinas redondeadas.
 */
export function PaymentMethodIcon({ method, size = "md", className, title }: Props) {
  const px = typeof size === "number" ? size : SIZE_MAP[size];
  const m = normalize(method);
  const label = title ?? m.charAt(0).toUpperCase() + m.slice(1);
  const [logoFailed, setLogoFailed] = useState(false);

  // Logo OFICIAL si el archivo existe en public/payment-logos/; si falla la
  // carga (archivo aún no subido), onError cae al arte custom de abajo.
  if (OFFICIAL_LOGOS.has(m) && !logoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/payment-logos/${m}.svg`}
        width={px}
        height={px}
        alt={label}
        title={label}
        loading="lazy"
        decoding="async"
        className={cn("inline-block shrink-0 object-contain", className)}
        onError={() => setLogoFailed(true)}
      />
    );
  }

  const common = {
    width: px,
    height: px,
    viewBox: "0 0 40 40",
    role: "img" as const,
    "aria-label": label,
    className,
  };

  // Fondo redondeado por marca + glifo blanco original.
  switch (m) {
    case "yape":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="9" fill="#7A26C1" />
          {/* Glifo original: móvil con "check" de pago */}
          <rect x="14" y="9" width="12" height="22" rx="3" fill="#fff" />
          <rect x="16" y="12" width="8" height="12" rx="1.5" fill="#7A26C1" />
          <circle cx="20" cy="27.5" r="1.6" fill="#7A26C1" />
          <path d="M17.5 17.8l1.6 1.7 3.4-3.7" stroke="#7A26C1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "plin":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="9" fill="#0AB4B4" />
          {/* Glifo original: flechas de transferencia */}
          <path d="M12 16h13l-3.5-3.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M28 24H15l3.5 3.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "efectivo":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="9" fill="#16A34A" />
          {/* Glifo original: billetes */}
          <rect x="9" y="13" width="22" height="14" rx="2" fill="#fff" />
          <circle cx="20" cy="20" r="3.4" fill="#16A34A" />
          <circle cx="12.5" cy="20" r="1.1" fill="#16A34A" />
          <circle cx="27.5" cy="20" r="1.1" fill="#16A34A" />
        </svg>
      );
    case "transfer":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="9" fill="#334155" />
          <rect x="10" y="14" width="20" height="12" rx="2" fill="#fff" />
          <path d="M14 20h9m0 0l-2.5-2.5M23 20l-2.5 2.5" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    default: // card / tarjeta
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="9" fill="#475569" />
          <rect x="9" y="13" width="22" height="15" rx="2.5" fill="#fff" />
          <rect x="9" y="17" width="22" height="3" fill="#475569" />
          <rect x="12" y="23" width="7" height="2.2" rx="1" fill="#475569" />
        </svg>
      );
  }
}

/**
 * Chip "ícono + wordmark" del método de pago (para listas de "Medios de pago").
 */
export function PaymentMethodChip({
  method,
  className = "",
}: {
  method: string;
  className?: string;
}) {
  const label = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 ${className}`}
    >
      <PaymentMethodIcon method={method} size="sm" />
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
    </span>
  );
}
