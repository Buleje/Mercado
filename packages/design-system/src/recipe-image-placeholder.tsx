/**
 * RecipeImagePlaceholder — placeholder canonical para recetas sin foto (ADR-075 Fase 5).
 *
 * Rota deterministicamente entre 4 ilustraciones culinarias Buleje segun `recipeId`,
 * garantizando que la misma receta siempre muestre la misma ilustracion.
 *
 * Pool de ilustraciones: OllaVacia, CanastaVacia, PaicheEnOlla, CorazonLatiendo.
 * Las SVGs estan inlineadas para mantener el package framework-agnostic (sin
 * dependencias de `components/ui-system/`).
 *
 * Reglas visuales:
 * - Container fluid: se adapta al contenedor padre. Aspect ratio `aspect-[4/3]`.
 * - Background: `var(--surface-sunken)` (nunca hardcoded).
 * - Ilustracion centrada: 60% ancho max en mobile, 50% en desktop.
 * - Label "Sin foto" abajo: pequeno, `var(--text-tertiary)`.
 * - Cero sombras, cero emojis. Estilo Holded minimalista.
 *
 * @example
 *   <RecipeImagePlaceholder recipeId="abc123" name="Arroz con Pollo" />
 *   <RecipeImagePlaceholder recipeId="xyz" label="Sin imagen" className="rounded-t-lg" />
 */
"use client";

import { cn } from "./utils";

// ── Ilustraciones inline ──────────────────────────────────────────────────────
// Inlineadas para mantener el DS framework-agnostic (no importa de components/).
// Fuente: components/ui-system/illustrations/empty-states.tsx y pucallpa-locals.tsx
// Mismo estilo stroke 1.5 + currentColor que el sistema de ilustraciones Buleje.

interface IluProps {
  className?: string;
}

/** Olla vacia — olla con cuchara sin ingredientes. */
function OllaVacia({ className }: IluProps) {
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
      {/* Olla */}
      <path d="M40 85h120l-10 80q-1 6 -7 6h-86q-6 0 -7 -6z" />
      {/* Tapa levantada a un lado */}
      <path d="M35 85h130" />
      <path d="M130 55q4 0 4 6v20" opacity="0.5" />
      <ellipse cx="130" cy="52" rx="18" ry="5" opacity="0.5" />
      <path d="M130 45v4" opacity="0.5" />
      {/* Asas */}
      <path d="M30 95c-6 0-10-5-10-10" />
      <path d="M170 95c6 0 10-5 10-10" />
      {/* Cuchara dentro */}
      <path d="M90 95v50" />
      <ellipse cx="90" cy="150" rx="8" ry="4" />
      {/* Vapor (vacio, solo 2 lineas suaves) */}
      <path d="M75 70q-3-8 0-16M95 65q-3-8 0-14" opacity="0.3" />
    </svg>
  );
}

/** Canasta vacia — mujer con canasta curioseando. */
function CanastaVacia({ className }: IluProps) {
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
      {/* Cabeza */}
      <circle cx="75" cy="55" r="14" />
      <path d="M73 51c-.5 1 .5 2 2 2s2.5-1 2-2" />
      <circle cx="70" cy="53" r=".5" fill="currentColor" />
      <circle cx="80" cy="53" r=".5" fill="currentColor" />
      {/* Cuerpo */}
      <path d="M65 68c-2 4-4 14-3 28" />
      <path d="M85 68c2 4 4 14 3 28" />
      {/* Brazo sosteniendo asa canasta */}
      <path d="M87 90c8 2 14 8 18 14" />
      {/* Canasta vacia */}
      <path d="M100 108c2-6 12-8 20-6" />
      <ellipse cx="130" cy="135" rx="28" ry="8" />
      <path d="M102 135v25c0 4 3 7 7 7h42c4 0 7-3 7-7v-25" />
      {/* Asa */}
      <path d="M110 135c0-8 4-14 10-14M150 135c0-8-4-14-10-14" />
      {/* Lineas vacio (hollow) */}
      <path d="M118 145v10M130 145v10M142 145v10" opacity="0.3" />
      {/* Piernas */}
      <path d="M70 100v35" />
      <path d="M80 100v35" />
    </svg>
  );
}

/** PaicheEnOlla — paiche (pescado amazonico) en olla con humo. */
function PaicheEnOlla({ className }: IluProps) {
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
      {/* Humo irregular (wobble real) */}
      <path d="M80 55q-4-8-1-16q5-6 4-12" opacity="0.35" />
      <path d="M100 50q-3-9 0-17q4-5 2-11" opacity="0.4" />
      <path d="M120 53q-5-7-2-15q5-7 3-13" opacity="0.3" />
      {/* Olla cuerpo — forma ligeramente trapezoidal (no perfecta) */}
      <path d="M35 100h130l-12 68q-1 5-6 5H53q-5 0-6-5z" />
      {/* Borde superior olla */}
      <path d="M32 100h136" />
      {/* Asas — una mas alta que la otra (imperfeccion deliberada) */}
      <path d="M28 108c-8 0-13-6-12-14" />
      <path d="M172 110c8 0 13-6 12-14" />
      {/* Paiche — cuerpo grande flotando en la olla */}
      <path d="M60 130q40-22 80-2" />
      <path d="M60 130q5 14 20 18q20 6 42 4q10-1 18-10" />
      {/* Cola del paiche */}
      <path d="M140 148q12 2 20-10M140 148q10 8 22 4" />
      {/* Escamas (textura minima) */}
      <path d="M80 128q3 4 2 8M100 124q3 5 2 9M120 124q3 4 2 8" opacity="0.4" />
      {/* Ojo del paiche */}
      <circle cx="65" cy="134" r="3" />
      <circle cx="65" cy="134" r="1" fill="currentColor" />
      {/* Liquido en olla (linea nivel) */}
      <path d="M48 140q52-6 104 0" opacity="0.3" strokeDasharray="3 4" />
      {/* Tapa a un lado, levantada */}
      <ellipse cx="55" cy="97" rx="22" ry="6" opacity="0.5" />
      <path d="M55 88v7" opacity="0.5" />
    </svg>
  );
}

/** CorazonLatiendo — corazon con latido. Uso: favoritos, recetas especiales. */
function CorazonLatiendo({ className }: IluProps) {
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
      {/* Corazon principal */}
      <path d="M100 155q-60-35-62-80q0-28 25-32q18-3 37 22q19-25 37-22q25 4 25 32q-2 45-62 80z" />
      {/* Latido interior */}
      <path d="M60 100h20l8-15 12 30 8-15h32" opacity="0.5" />
      {/* Brillo sutil */}
      <path d="M70 75q5-8 15-9" opacity="0.35" strokeLinecap="round" />
    </svg>
  );
}

// ── Pool + hash deterministico ────────────────────────────────────────────────

const ILUS = [OllaVacia, CanastaVacia, PaicheEnOlla, CorazonLatiendo] as const;

/**
 * Hash deterministico simple — misma entrada siempre devuelve mismo indice.
 * Compatible con SSR (no usa Math.random()).
 * Mismo algoritmo que StoreImagePlaceholder para consistencia.
 */
function hashIndex(recipeId: string): number {
  const sum = [...recipeId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return sum % ILUS.length;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RecipeImagePlaceholderProps {
  /** ID de la receta — determina cual ilustracion se muestra (hash % 4). */
  recipeId: string;
  /** Nombre de la receta para el aria-label (opcional). */
  name?: string;
  /** Texto del label inferior. Default: "Sin foto". */
  label?: string;
  /** Override de clases del contenedor externo. */
  className?: string;
}

// ── Componente ────────────────────────────────────────────────────────────────

/**
 * RecipeImagePlaceholder — canonical placeholder para recipe cards sin imagen.
 *
 * La ilustracion rota deterministicamente por `recipeId`:
 * OllaVacia → CanastaVacia → PaicheEnOlla → CorazonLatiendo → (cycle).
 */
export function RecipeImagePlaceholder({
  recipeId,
  name,
  label = "Sin foto",
  className,
}: RecipeImagePlaceholderProps) {
  const idx = hashIndex(recipeId);
  const Ilu = ILUS[idx];

  return (
    <div
      role="img"
      aria-label={name ? `Receta ${name} sin foto` : "Receta sin foto"}
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
