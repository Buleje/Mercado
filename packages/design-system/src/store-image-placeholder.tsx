/**
 * StoreImagePlaceholder — placeholder canonical para tiendas sin foto (ADR-075).
 *
 * Rota deterministicamente entre 4 ilustraciones Buleje segun `storeId`,
 * garantizando que la misma tienda siempre muestre la misma ilustracion.
 *
 * Pool de ilustraciones: BodegaAbriendo, DoniaElena, MotoRuta, BodegueroCelebrando.
 * Las SVGs estan inlineadas para mantener el package framework-agnostic (sin
 * dependencias de `components/ui-system/`).
 *
 * Reglas visuales:
 * - Container fluid: se adapta al contenedor padre. Aspect ratio `aspect-[4/3]`.
 * - Background: `var(--surface-sunken)` (nunca hardcoded).
 * - Ilustracion centrada: 60% ancho max en mobile, 50% en desktop.
 * - Label "Sin foto" abajo: pequeño, `var(--text-tertiary)`.
 * - Cero sombras, cero emojis. Estilo Holded minimalista.
 *
 * @example
 *   <StoreImagePlaceholder storeId="abc123" name="Bodega El Sol" />
 *   <StoreImagePlaceholder storeId="xyz" label="Sin imagen" className="rounded-t-lg" />
 */
"use client";

import { cn } from "./utils";

// ── Ilustraciones inline ──────────────────────────────────────────────────────
// Inlineadas para mantener el DS framework-agnostic (no importa de components/).
// Mismas ilustraciones que usa MarketplaceStoresView: BodegaAbriendo, DoniaElena,
// MotoRuta, BodegueroCelebrando. Stroke style identico al sistema de ilustraciones.

interface IluProps {
  className?: string;
}

function BodegaAbriendo({ className }: IluProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M35 85v90h130V85" />
      <path d="M30 85h140l-10-20h-120z" />
      <rect x="60" y="68" width="80" height="10" opacity="0.5" />
      <path d="M45 110h110M45 120h110M45 130h110" opacity="0.3" />
      <path d="M50 175v-35h100v35" />
      <path d="M85 175v-35M115 175v-35" opacity="0.4" />
      <path d="M100 175v-30" opacity="0.5" />
      <path d="M85 175q15 -20 30 0" opacity="0.3" />
      <path d="M170 65v45" opacity="0.5" />
      <circle cx="170" cy="112" r="3" fill="currentColor" opacity="0.5" />
      <path d="M30 50q-10 0 -12 -8M160 50q10 0 12 -8" opacity="0.4" />
      <circle cx="30" cy="35" r="10" opacity="0.4" />
      <path d="M30 18v6M30 46v6M10 35h6M44 35h6M17 21l4 4M43 49l-4-4M43 21l-4 4M17 49l4-4" opacity="0.3" />
    </svg>
  );
}

function DoniaElena({ className }: IluProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M85 38q15 -3 31 1q4 12 2 24q-3 10 -16 11q-14 -1 -17 -11q-3 -12 0 -25z" />
      <path d="M83 37q10 -8 33 -1l1 4q-17 -7 -32 1z" fill="currentColor" opacity="0.15" />
      <path d="M83 37q10 -8 33 -1" strokeWidth={1.65} />
      <path d="M118 34l5 -5l2 4l-4 3" />
      <path d="M91 53q2 -1 3 0" strokeLinecap="round" />
      <path d="M107 53q2 -1 3 0" strokeLinecap="round" />
      <path d="M94 64q5 4 13 3" />
      <path d="M95 74v8M107 74v8" />
      <path d="M73 85q-3 22 -4 60q21 6 62 0q-2 -38 -5 -60z" />
      <path d="M78 115q45 -2 48 0" strokeDasharray="1 2" opacity="0.6" />
      <rect x="88" y="125" width="24" height="18" rx="1.5" opacity="0.5" />
      <path d="M92 132h16M92 136h12" opacity="0.5" />
      <path d="M72 95q-10 15 -5 32q5 8 14 5" />
      <path d="M128 95q8 20 -3 42" />
      <circle cx="125" cy="140" r="4" />
      <path d="M128 138l8 4" strokeWidth={1.8} />
      <path d="M82 165q-3 15 -2 30" opacity="0.6" />
      <path d="M118 165q3 15 2 30" opacity="0.6" />
    </svg>
  );
}

function MotoRuta({ className }: IluProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <ellipse cx="54" cy="150" rx="16" ry="15" />
      <ellipse cx="146" cy="150" rx="16" ry="15" />
      <path d="M54 135v-4M54 165v4M40 150h3M66 150h3" opacity="0.5" />
      <path d="M146 135v-4M146 165v4M132 150h3M158 150h3" opacity="0.5" />
      <circle cx="54" cy="150" r="3" fill="currentColor" />
      <circle cx="146" cy="150" r="3" fill="currentColor" />
      <path d="M54 150l20 -30l48 -2l20 30" />
      <path d="M72 120l12 -30" />
      <path d="M122 118l-2 -28" />
      <path d="M82 98q15 -5 30 0q3 6 0 14l-33 1q-2 -8 3 -15z" fill="currentColor" opacity="0.08" />
      <path d="M82 98q15 -5 30 0q3 6 0 14l-33 1q-2 -8 3 -15z" />
      <path d="M72 90q-6 -8 -12 -6M122 88q6 -8 12 -6" />
      <path d="M95 85q-3 -10 4 -18q10 -6 18 0q6 12 -1 22" />
      <ellipse cx="110" cy="68" rx="14" ry="13" fill="currentColor" opacity="0.2" />
      <ellipse cx="110" cy="68" rx="14" ry="13" />
      <path d="M100 65q12 -4 18 0q1 4 0 6q-9 4 -17 0z" fill="currentColor" opacity="0.35" />
      <path d="M120 56l3 -10" strokeWidth={1.125} />
      <circle cx="123" cy="45" r="1.5" />
      <rect x="125" y="92" width="28" height="26" rx="2" />
      <path d="M125 102h28" />
      <path d="M139 92v10" />
      <path d="M122 95l34 0M122 115l34 0" opacity="0.4" strokeDasharray="2 3" />
      <path d="M22 100h20M18 115h18M25 128h16" opacity="0.45" />
      <path d="M15 168q40 -2 90 -3q45 -1 80 0" opacity="0.35" strokeDasharray="2 5" />
    </svg>
  );
}

function BodegueroCelebrando({ className }: IluProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="100" cy="70" r="16" />
      <path d="M92 68q3 -3 6 0M102 68q3 -3 6 0" />
      <path d="M92 76q8 6 16 0" />
      <path d="M85 95q-6 14 -8 50h46q-2-36-8-50" />
      <path d="M90 95l20 0M85 105h30" />
      <path d="M83 95l-22 -30" />
      <path d="M117 95l22 -30" />
      <circle cx="58" cy="62" r="5" />
      <circle cx="142" cy="62" r="5" />
      <path d="M45 40l-8-8M155 40l8-8M35 75l-10-4M165 75l10-4" opacity="0.55" />
      <path d="M30 50l-5-2M170 50l5-2" opacity="0.4" />
      <path d="M92 145v25M108 145v25" />
    </svg>
  );
}

// ── Pool + hash deterministico ────────────────────────────────────────────────

const ILUS = [BodegaAbriendo, DoniaElena, MotoRuta, BodegueroCelebrando] as const;

/**
 * Hash deterministico simple — misma entrada siempre devuelve mismo indice.
 * Compatible con SSR (no usa Math.random()).
 */
function hashIndex(storeId: string): number {
  const sum = [...storeId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return sum % ILUS.length;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StoreImagePlaceholderProps {
  /** ID de la tienda — determina cual ilustracion se muestra (hash % 4). */
  storeId: string;
  /** Nombre de la tienda para el aria-label (opcional). */
  name?: string;
  /** Texto del label inferior. Default: "Sin foto". */
  label?: string;
  /** Override de clases del contenedor externo. */
  className?: string;
}

// ── Componente ────────────────────────────────────────────────────────────────

/**
 * StoreImagePlaceholder — canonical placeholder para store cards sin imagen.
 *
 * La ilustracion rota deterministicamente por `storeId`:
 * BodegaAbriendo → DoniaElena → MotoRuta → BodegueroCelebrando → (cycle).
 */
export function StoreImagePlaceholder({
  storeId,
  name,
  label = "Sin foto",
  className,
}: StoreImagePlaceholderProps) {
  const idx = hashIndex(storeId);
  const Ilu = ILUS[idx];

  return (
    <div
      role="img"
      aria-label={name ? `Tienda ${name} sin foto` : "Tienda sin foto"}
      className={cn(
        "relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2",
        "overflow-hidden rounded-t-lg bg-[var(--surface-sunken)]",
        className,
      )}
    >
      <Ilu
        className={cn(
          "w-[60%] max-w-[110px] sm:w-[50%] sm:max-w-[96px]",
          "text-[var(--text-tertiary)]",
        )}
      />
      <span
        aria-hidden="true"
        className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]"
      >
        {label}
      </span>
    </div>
  );
}
