/**
 * @buleje/design-system/typography — Primitivos tipográficos canónicos.
 *
 * Fuente de verdad de textos estructurales del admin/store/tenant.
 * Cada primitivo aplica la escala tipográfica (ADR-070) sobre el elemento
 * semántico correcto y respeta los tokens de texto (--text-primary/secondary/tertiary).
 *
 * Todos los componentes aceptan:
 *   - `as` prop → override semántico (ej: <PageTitle as="h2"> en modales).
 *   - `className` → merge vía tailwind-merge para extensiones legítimas.
 *
 * REGLA: NO se permite crear h1/h2/h3 con className local en admin/**.
 * Usar estos primitivos o proponer una extensión aquí.
 *
 * @example
 * import { PageTitle, SectionTitle, BodyText } from "@buleje/design-system";
 * <PageTitle>Dashboard</PageTitle>
 * <SectionTitle>Ventas</SectionTitle>
 * <BodyText>Total del mes...</BodyText>
 */
"use client";

import { forwardRef } from "react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type TypographyProps<E extends ElementType = ElementType> = HTMLAttributes<HTMLElement> & {
  as?: E;
  className?: string;
  children: ReactNode;
};

// ── PageTitle (h1) ────────────────────────────────────────────────────────────
/**
 * Título principal de una página admin. Render por defecto `<h1>`.
 *
 * Escala: text-2xl → 3xl (responsive). Peso extrabold, tracking tight.
 * Uso único por página (regla de accesibilidad).
 */
export const PageTitle = forwardRef<HTMLHeadingElement, TypographyProps>(
  function PageTitle({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "h1") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold",
          "text-[var(--text-primary)] leading-[var(--lh-tight)] tracking-[var(--ls-tight)]",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

// ── SectionTitle (h2) ─────────────────────────────────────────────────────────
/**
 * Título de sección dentro de un AdminPage. Render por defecto `<h2>`.
 *
 * Escala: text-xl. Peso bold.
 */
export const SectionTitle = forwardRef<HTMLHeadingElement, TypographyProps>(
  function SectionTitle({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "h2") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-xl)] font-bold",
          "text-[var(--text-primary)] leading-[var(--lh-tight)]",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

// ── CardTitle (h3) ────────────────────────────────────────────────────────────
/**
 * Título de tarjeta / bloque. Render por defecto `<h3>`.
 *
 * Escala: text-base. Peso medium/semibold.
 */
export const CardTitle = forwardRef<HTMLHeadingElement, TypographyProps>(
  function CardTitle({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "h3") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-base)] font-semibold",
          "text-[var(--text-primary)] leading-[var(--lh-snug)]",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

// ── BodyText (p) ──────────────────────────────────────────────────────────────
/**
 * Texto de cuerpo — párrafos, descripciones. Render por defecto `<p>`.
 *
 * Escala: text-sm. Color primary. Leading relaxed.
 */
export const BodyText = forwardRef<HTMLParagraphElement, TypographyProps>(
  function BodyText({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "p") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-sm)] text-[var(--text-primary)] leading-[var(--lh-normal)]",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

// ── Caption (span) ────────────────────────────────────────────────────────────
/**
 * Texto pequeño secundario — timestamps, notas al pie. Render por defecto `<span>`.
 *
 * Escala: text-xs. Color secondary.
 */
export const Caption = forwardRef<HTMLSpanElement, TypographyProps>(
  function Caption({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "span") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-xs)] text-[var(--text-secondary)]",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

// ── Label (label) ─────────────────────────────────────────────────────────────
/**
 * Etiqueta de campo o métrica. Render por defecto `<label>`.
 *
 * Escala: text-xs uppercase tracking-wider. Peso medium. Color tertiary.
 */
export const Label = forwardRef<HTMLLabelElement, TypographyProps>(
  function Label({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "label") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-xs)] uppercase tracking-[var(--ls-wider)]",
          "text-[var(--text-tertiary)] font-medium",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

// ── Kicker (span) ─────────────────────────────────────────────────────────────
/**
 * Kicker sobre un título — mini-label de categoría. Render por defecto `<span>`.
 *
 * Escala: text-2xs (10px). Peso semibold. Color tertiary. Uppercase.
 */
export const Kicker = forwardRef<HTMLSpanElement, TypographyProps>(
  function Kicker({ as, className, children, ...rest }, ref) {
    const Comp = (as ?? "span") as ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)]",
          "text-[var(--text-tertiary)] font-semibold",
          className,
        )}
        {...rest}
      >
        {children}
      </Comp>
    );
  },
);

export type { TypographyProps };
