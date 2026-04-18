/**
 * @buleje/design-system/layout — Primitivos de layout canónicos.
 *
 * Fuente de verdad del esqueleto de páginas admin. Reemplaza docenas de
 * `<div className="space-y-6 p-6">` ad-hoc con wrappers nombrados.
 *
 * @example
 * import { AdminPage, AdminSection, AdminGrid } from "@buleje/design-system";
 * <AdminPage title="Dashboard" subtitle="Resumen del dia" actions={<PrimaryButton>Nuevo</PrimaryButton>}>
 *   <AdminSection title="KPIs">
 *     <AdminGrid cols={4}>...</AdminGrid>
 *   </AdminSection>
 * </AdminPage>
 */
"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { PageTitle, SectionTitle, BodyText } from "./typography";
import { cn } from "./utils";

// ── AdminPage ────────────────────────────────────────────────────────────────
type AdminPageProps = HTMLAttributes<HTMLDivElement> & {
  /** Título principal — renderiza <PageTitle>. Si se omite, no se renderiza header. */
  title?: ReactNode;
  /** Subtítulo opcional debajo del título. */
  subtitle?: ReactNode;
  /** Acciones (botones, filtros) a la derecha del header. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Wrapper canónico para páginas admin.
 * Aplica padding responsivo y stack vertical con gap consistente.
 */
export function AdminPage({
  title,
  subtitle,
  actions,
  className,
  children,
  ...rest
}: AdminPageProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <div className={cn("space-y-6 p-4 sm:p-6", className)} {...rest}>
      {hasHeader && (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {title !== undefined && <PageTitle>{title}</PageTitle>}
            {subtitle !== undefined && (
              <BodyText className="text-[var(--text-secondary)]">{subtitle}</BodyText>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      {children}
    </div>
  );
}

// ── AdminSection ─────────────────────────────────────────────────────────────
type AdminSectionProps = HTMLAttributes<HTMLElement> & {
  /** Título de sección — renderiza <SectionTitle>. */
  title?: ReactNode;
  /** Descripción corta opcional bajo el título. */
  description?: ReactNode;
  /** Acciones a la derecha del header de la sección. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Sección dentro de AdminPage. Agrupa contenido relacionado.
 */
export function AdminSection({
  title,
  description,
  actions,
  className,
  children,
  ...rest
}: AdminSectionProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section className={cn("space-y-4", className)} {...rest}>
      {hasHeader && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            {title !== undefined && <SectionTitle>{title}</SectionTitle>}
            {description !== undefined && (
              <BodyText className="text-[var(--text-secondary)]">{description}</BodyText>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// ── AdminGrid ────────────────────────────────────────────────────────────────
type AdminGridCols = 1 | 2 | 3 | 4 | 5 | 6;

type AdminGridProps = HTMLAttributes<HTMLDivElement> & {
  /** Columnas en desktop. Mobile siempre 1, sm siempre 2 (para cols >= 2). */
  cols?: AdminGridCols;
  /** Gap entre celdas. Default 4 (1rem). */
  gap?: 3 | 4 | 5 | 6;
  children: ReactNode;
};

const COLS_CLASS: Record<AdminGridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-6",
};

const GAP_CLASS: Record<NonNullable<AdminGridProps["gap"]>, string> = {
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
};

/**
 * Grid responsivo con cols 1-6.
 */
export function AdminGrid({
  cols = 3,
  gap = 4,
  className,
  children,
  ...rest
}: AdminGridProps) {
  return (
    <div
      className={cn("grid", COLS_CLASS[cols], GAP_CLASS[gap], className)}
      {...rest}
    >
      {children}
    </div>
  );
}

// ── AdminCenter ──────────────────────────────────────────────────────────────
type AdminCenterProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * Contenedor centrado vertical y horizontal.
 * Uso típico: empty states, loading states, zero-results.
 */
export function AdminCenter({ className, children, ...rest }: AdminCenterProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export type { AdminPageProps, AdminSectionProps, AdminGridProps, AdminGridCols, AdminCenterProps };
