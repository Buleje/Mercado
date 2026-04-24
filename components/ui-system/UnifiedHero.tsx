"use client";

/**
 * UnifiedHero — Hero pattern unificado para landings del marketplace.
 *
 * Reemplaza los heroes ad-hoc de /vender, /socio-buleje, /asistente,
 * /marketplace/gift-cards, /marketplace/en-vivo, /marketplace/comparar.
 *
 * 3 variantes visuales:
 *   - "2col-right" (default): texto izquierda, ilustracion derecha
 *   - "2col-left":            ilustracion izquierda, texto derecha (alternante)
 *   - "1col-center":          texto centrado, ilustracion detras con opacity
 *
 * 3 themes (surface):
 *   - "canvas" (default) -> --surface-canvas
 *   - "sunken"           -> --surface-sunken (gris ambient)
 *   - "accent-soft"      -> radial soft del accent (ver SocioHero)
 *
 * Rules de armonia:
 *   - Kicker primero (text-tertiary, uppercase)
 *   - PageTitle tono extrabold tracking-tight
 *   - BodyText tono secondary leading-relaxed
 *   - Trust chips inline (flex-wrap gap-2)
 *   - CTAs tamaño lg con iconos
 *   - Ilustracion dentro de un card raised con border rule-base
 *
 * @example
 * <UnifiedHero
 *   kicker="Seller Central"
 *   title="Vende en Buleje, llegá a todo Pucallpa"
 *   description="Abre tu tienda online..."
 *   trustChips={["Gratis el primer mes", "Soporte en español"]}
 *   ctaPrimary={{ label: "Empezar gratis", href: "/vender/registro" }}
 *   illustration={DoniaElena}
 * />
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  PageTitle,
  BodyText,
  Kicker,
  Chip,
  PrimaryButton,
  cn,
} from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";

export type UnifiedHeroVariant = "2col-right" | "2col-left" | "1col-center";
export type UnifiedHeroTheme = "canvas" | "sunken" | "accent-soft";

export type UnifiedHeroCTA = {
  label: string;
  href: string;
};

export type UnifiedHeroProps = {
  /** Eyebrow — mini-label antes del titulo. */
  kicker?: string;
  /** H1 de la landing. */
  title: string;
  /** Subtitle opcional (aparece bajo el h1 con peso semibold). */
  subtitle?: string;
  /** Lede — descripcion breve. */
  description: string;
  /** Trust chips (max 4) — "Gratis", "Sin tarjeta", etc. */
  trustChips?: string[];
  /** CTA principal — boton oscuro. */
  ctaPrimary?: UnifiedHeroCTA;
  /** CTA secundario — boton outline. */
  ctaSecondary?: UnifiedHeroCTA;
  /** Ilustracion opcional (componente react). */
  illustration?: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  /** Tamaño de la ilustracion. Default 280. */
  illustrationSize?: number;
  /** Nota al pie del CTA (e.g. "Sin tarjeta para el trial."). */
  footnote?: string;
  /** Slot extra debajo de los CTAs (para calculadoras, selectors, etc.). */
  children?: ReactNode;
  /** Variante layout. Default "2col-right". */
  variant?: UnifiedHeroVariant;
  /** Tono del background. Default "canvas". */
  theme?: UnifiedHeroTheme;
  /** Floating chips decorativos sobre la ilustracion. Max 2. */
  floatingChips?: Array<{
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    label: string;
    sublabel?: string;
    dotIntent?: "success" | "warning" | "danger" | "accent";
  }>;
  className?: string;
};

const THEME_CLASSES: Record<UnifiedHeroTheme, string> = {
  canvas: "bg-[var(--surface-canvas)]",
  sunken: "bg-[var(--surface-sunken)]",
  "accent-soft": "bg-[var(--surface-canvas)]",
};

const DOT_INTENT_CLASSES = {
  success: "bg-[var(--data-success)]",
  warning: "bg-[var(--data-warning)]",
  danger: "bg-[var(--data-error)]",
  accent: "bg-[var(--accent)]",
} as const;

const POSITION_CLASSES = {
  "top-left": "-left-4 top-6",
  "top-right": "-right-4 top-6",
  "bottom-left": "-left-4 bottom-8",
  "bottom-right": "-right-4 bottom-8",
} as const;

export function UnifiedHero({
  kicker,
  title,
  subtitle,
  description,
  trustChips,
  ctaPrimary,
  ctaSecondary,
  illustration: Illustration,
  illustrationSize = 280,
  footnote,
  children,
  variant = "2col-right",
  theme = "canvas",
  floatingChips,
  className,
}: UnifiedHeroProps) {
  const textBlock = (
    <div
      className={cn(
        "space-y-6",
        variant === "1col-center" && "text-center items-center flex flex-col",
      )}
    >
      {kicker ? (
        <Kicker className="inline-flex">{kicker}</Kicker>
      ) : null}

      <PageTitle className="text-[length:var(--ts-3xl)] sm:text-[length:var(--ts-4xl)] lg:text-[length:var(--ts-5xl)]">
        {title}
        {subtitle ? (
          <span className="block text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-semibold text-[var(--text-secondary)] mt-2">
            {subtitle}
          </span>
        ) : null}
      </PageTitle>

      <BodyText
        className={cn(
          "text-[length:var(--ts-base)] text-[var(--text-secondary)] leading-relaxed",
          variant === "1col-center" ? "max-w-2xl mx-auto" : "max-w-xl",
        )}
      >
        {description}
      </BodyText>

      {trustChips && trustChips.length > 0 ? (
        <ul
          className={cn(
            "flex flex-wrap gap-2",
            variant === "1col-center" && "justify-center",
          )}
        >
          {trustChips.map((label) => (
            <li key={label}>
              <Chip>{label}</Chip>
            </li>
          ))}
        </ul>
      ) : null}

      {children}

      {(ctaPrimary || ctaSecondary) && (
        <div
          className={cn(
            "flex flex-wrap gap-3 pt-2",
            variant === "1col-center" && "justify-center",
          )}
        >
          {ctaPrimary ? (
            <PrimaryButton
              size="lg"
              asChild
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
            >
              <Link href={ctaPrimary.href}>{ctaPrimary.label}</Link>
            </PrimaryButton>
          ) : null}
          {ctaSecondary ? (
            <PrimaryButton size="lg" variant="secondary" asChild>
              <Link href={ctaSecondary.href}>{ctaSecondary.label}</Link>
            </PrimaryButton>
          ) : null}
        </div>
      )}

      {footnote ? (
        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          {footnote}
        </p>
      ) : null}
    </div>
  );

  const illustrationBlock = Illustration ? (
    <div
      className={cn(
        "flex items-center justify-center",
        variant === "1col-center" && "absolute inset-0 pointer-events-none opacity-5 sm:opacity-10",
      )}
    >
      <div
        className={cn(
          "relative rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8",
          variant === "1col-center" && "border-transparent bg-transparent p-0",
        )}
        style={
          variant !== "1col-center"
            ? {
                boxShadow:
                  "0 1px 2px color-mix(in oklch, var(--text-primary) 8%, transparent)",
              }
            : undefined
        }
      >
        <Illustration
          size={illustrationSize}
          strokeWidth={1.4}
          className="text-[var(--text-primary)]"
        />

        {/* Floating chips (solo en variants 2col) */}
        {variant !== "1col-center" && floatingChips
          ? floatingChips.slice(0, 2).map((chip) => (
              <div
                key={chip.position}
                className={cn(
                  "absolute flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 elev-1",
                  POSITION_CLASSES[chip.position],
                )}
              >
                {chip.dotIntent ? (
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      DOT_INTENT_CLASSES[chip.dotIntent],
                    )}
                    aria-hidden
                  />
                ) : null}
                <div className="flex flex-col">
                  {chip.sublabel ? (
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {chip.sublabel}
                    </span>
                  ) : null}
                  <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                    {chip.label}
                  </span>
                </div>
              </div>
            ))
          : null}
      </div>
    </div>
  ) : null;

  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-[var(--rule-base)]",
        THEME_CLASSES[theme],
        "py-16 sm:py-24",
        className,
      )}
    >
      {/* Accent soft radial background */}
      {theme === "accent-soft" ? (
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background:
              "radial-gradient(60% 40% at 75% 30%, color-mix(in oklch, var(--accent) 18%, transparent) 0%, transparent 70%)",
          }}
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8",
          variant === "1col-center" && "text-center",
        )}
      >
        {variant === "2col-right" ? (
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            {textBlock}
            <div className="hidden lg:flex">{illustrationBlock}</div>
          </div>
        ) : null}

        {variant === "2col-left" ? (
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
            <div className="hidden lg:flex">{illustrationBlock}</div>
            {textBlock}
          </div>
        ) : null}

        {variant === "1col-center" ? (
          <div className="relative mx-auto max-w-3xl">
            {illustrationBlock}
            <div className="relative z-10">{textBlock}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default UnifiedHero;
