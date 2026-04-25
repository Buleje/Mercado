"use client";

/**
 * AdminButton — boton canonico del panel admin.
 *
 * Variants:
 * - primary: neutro pro (bg-text-primary, accent en hover) — la accion principal
 * - secondary: outline neutro
 * - ghost: link discreto sin borde
 * - danger: rojo suave para acciones destructivas
 *
 * Soporta icono leading, estado loading (spinner + disabled), y se comporta
 * como `<button>` o `<a>` segun el prop `as`.
 */

import { Loader2 } from "@buleje/design-system/icons";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  ReactNode,
} from "react";
import { ADMIN_TOKENS } from "./admin-tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type LucideIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

interface BaseProps {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  children: ReactNode;
}

type ButtonProps = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps | "type"> & {
    as?: "button";
    type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  };

type AnchorProps = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & {
    as: "a";
    href: string;
  };

type AdminButtonProps = ButtonProps | AnchorProps;

const VARIANT_CLASS: Record<Variant, string> = {
  primary: ADMIN_TOKENS.btnPrimary,
  secondary: ADMIN_TOKENS.btnSecondary,
  ghost: ADMIN_TOKENS.btnGhost,
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error)] px-4 py-2 text-sm font-bold hover:bg-[var(--data-error-100)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--data-error)]",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "",
};

export default function AdminButton(props: AdminButtonProps) {
  const {
    variant = "primary",
    size = "md",
    icon: Icon,
    loading = false,
    children,
    className = "",
  } = props;

  const sizeClass = size === "sm" ? `${SIZE_CLASS.sm} px-3 py-1.5` : "";
  const cls = `${VARIANT_CLASS[variant]} ${sizeClass} ${className}`.trim();

  const content = (
    <>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden />
      )}
      {children}
    </>
  );

  if (props.as === "a") {
    const { as: _as, variant: _v, size: _s, icon: _i, loading: _l, children: _c, className: _cn, ...rest } = props;
    return (
      <a {...rest} className={cls}>
        {content}
      </a>
    );
  }

  const { as: _as, variant: _v, size: _s, icon: _i, loading: _l, children: _c, className: _cn, type, disabled, ...rest } = props as ButtonProps;
  return (
    <button
      {...rest}
      type={type ?? "button"}
      disabled={loading || disabled}
      className={cls}
    >
      {content}
    </button>
  );
}
