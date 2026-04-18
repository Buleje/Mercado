/**
 * @buleje/design-system/feedback — Alertas, estados vacíos y loading canónicos.
 *
 * Unifica el patrón bg-{color}-50 + border-{color}-200 + icon que aparece
 * duplicado en 15+ módulos admin.
 *
 * Pattern: semantic tokens (--data-info/warning/error/success) + color-mix
 * para que dark mode funcione sin duplicar clases.
 *
 * @example
 * <WarningAlert title="Stock bajo" description="3 productos bajo umbral" />
 * <ErrorAlert title="Fallo de sincronización" description="Reintentá en 1 min" />
 * <EmptyState title="Sin ventas hoy" description="Aún no hay registros." action={{ label: "Nueva venta", onClick: () => ... }} />
 * <LoadingState message="Cargando KPIs..." />
 */
"use client";

import type { ReactNode } from "react";
import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from "./icons";
import { AdminCenter } from "./layout";
import { CardTitle, BodyText, Caption } from "./typography";
import { cn } from "./utils";

// ── Alert base ────────────────────────────────────────────────────────────────
type AlertVariant = "info" | "warning" | "error" | "success";

const ALERT_TOKENS: Record<AlertVariant, { token: string; Icon: LucideIcon }> = {
  info: { token: "--data-info", Icon: Info },
  warning: { token: "--data-warning", Icon: AlertTriangle },
  error: { token: "--data-error", Icon: XCircle },
  success: { token: "--data-success", Icon: CheckCircle2 },
};

export interface AlertProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Acción opcional (renderizada a la derecha). */
  action?: ReactNode;
  /** Override del ícono default del variant. */
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}

interface AlertInternalProps extends AlertProps {
  variant: AlertVariant;
}

function Alert({
  variant,
  title,
  description,
  action,
  icon,
  className,
  children,
}: AlertInternalProps) {
  const { token, Icon: DefaultIcon } = ALERT_TOKENS[variant];
  const Icon = icon ?? DefaultIcon;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-r-lg border-l-2 p-4",
        className,
      )}
      style={{
        // CSS vars + color-mix son estáticos, no viola regla "style inline"
        // porque son TOKENS, no literales. El linter permite esta excepción
        // específica de primitivos del DS.
        backgroundColor: `color-mix(in oklch, var(${token}) 10%, transparent)`,
        borderColor: `var(${token})`,
      }}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: `var(${token})` }} aria-hidden />
      <div className="flex-1 space-y-1 min-w-0">
        {title !== undefined && (
          <CardTitle className="text-[length:var(--ts-sm)]">{title}</CardTitle>
        )}
        {description !== undefined && (
          <BodyText className="text-[var(--text-secondary)]">{description}</BodyText>
        )}
        {children}
      </div>
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Public alert variants ─────────────────────────────────────────────────────
export function InfoAlert(props: AlertProps) {
  return <Alert variant="info" {...props} />;
}

export function WarningAlert(props: AlertProps) {
  return <Alert variant="warning" {...props} />;
}

export function ErrorAlert(props: AlertProps) {
  return <Alert variant="error" {...props} />;
}

export function SuccessAlert(props: AlertProps) {
  return <Alert variant="success" {...props} />;
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export interface EmptyStateProps {
  /** Ícono grande (por defecto un círculo neutro). */
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  /** CTA opcional. */
  action?: {
    label: string;
    onClick?: () => void;
    /** Cuando se proporciona, se renderiza como link/slot. */
    node?: ReactNode;
  };
  className?: string;
}

/**
 * Estado vacío genérico. Usa AdminCenter + ícono grande + título + descripción + acción.
 */
export function EmptyState({
  icon: Icon,
  title = "Sin datos",
  description = "No hay información para mostrar aún.",
  action,
  className,
}: EmptyStateProps) {
  return (
    <AdminCenter className={className}>
      {Icon && (
        <div
          className={cn(
            "h-14 w-14 rounded-xl flex items-center justify-center mb-4",
            "bg-[var(--surface-sunken)]",
          )}
        >
          <Icon className="h-7 w-7 text-[var(--text-tertiary)]" aria-hidden />
        </div>
      )}
      {title !== undefined && (
        <CardTitle className="text-[var(--text-secondary)] mt-2">{title}</CardTitle>
      )}
      {description !== undefined && (
        <BodyText className="text-[var(--text-tertiary)] mt-1 max-w-xs">
          {description}
        </BodyText>
      )}
      {action && (
        <div className="mt-4">
          {action.node ?? (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-lg transition-opacity",
                "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90",
              )}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </AdminCenter>
  );
}

// ── LoadingState ──────────────────────────────────────────────────────────────
export interface LoadingStateProps {
  message?: ReactNode;
  /** Tamaño del spinner. Default "md". */
  size?: "sm" | "md" | "lg";
  /**
   * Layout del estado de carga.
   * - `block` (default): AdminCenter con padding — para paneles/modales.
   * - `overlay`: absolute inset-0 con backdrop sutil — para imágenes o cards con fetch.
   * - `inline`: solo spinner, sin wrapper — para reemplazar <Loader2> dentro de botones o ternarios.
   * - `fullscreen`: pantalla completa centrada — para pages de primer render.
   *
   * (Sprint D2, ADR-075 addendum.)
   */
  variant?: "block" | "overlay" | "inline" | "fullscreen";
  className?: string;
}

const SPINNER_SIZE: Record<NonNullable<LoadingStateProps["size"]>, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-9 w-9",
};

/**
 * Estado de carga genérico. Por defecto renderiza un AdminCenter con spinner + mensaje.
 *
 * Variants:
 * - `block` — cuadro centrado en layout admin estándar.
 * - `overlay` — absolute inset-0 con backdrop sutil para cubrir contenido que está refetcheando.
 * - `inline` — solo el `<Loader2>` (sin wrapper) para reemplazar spinners inline en botones.
 * - `fullscreen` — pantalla completa para bootstrap / loading de dynamic imports.
 */
export function LoadingState({
  message = "Cargando...",
  size = "md",
  variant = "block",
  className,
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <Loader2
        className={cn("animate-spin text-[var(--text-secondary)]", SPINNER_SIZE[size], className)}
        aria-hidden
      />
    );
  }

  if (variant === "overlay") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2",
          "bg-[color-mix(in_oklch,var(--surface-canvas)_70%,transparent)]",
          "rounded-[inherit]",
          className,
        )}
      >
        <Loader2
          className={cn("animate-spin text-[var(--text-secondary)]", SPINNER_SIZE[size])}
          aria-hidden
        />
        {message !== undefined && message !== "" && (
          <Caption className="text-[var(--text-secondary)]">{message}</Caption>
        )}
      </div>
    );
  }

  if (variant === "fullscreen") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "min-h-screen flex flex-col items-center justify-center gap-3",
          "bg-[var(--surface-canvas)]",
          className,
        )}
      >
        <Loader2
          className={cn("animate-spin text-[var(--text-secondary)]", SPINNER_SIZE[size])}
          aria-hidden
        />
        {message !== undefined && (
          <Caption className="text-[var(--text-secondary)]">{message}</Caption>
        )}
      </div>
    );
  }

  // Default "block" variant.
  return (
    <AdminCenter className={className}>
      <Loader2
        className={cn("animate-spin text-[var(--text-secondary)]", SPINNER_SIZE[size])}
        aria-hidden
      />
      {message !== undefined && (
        <Caption className="mt-3 text-[var(--text-secondary)]">{message}</Caption>
      )}
    </AdminCenter>
  );
}

export type { AlertVariant };
