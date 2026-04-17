"use client";

import { forwardRef } from "react";

/**
 * VisuallyHidden — contenido oculto visualmente pero accesible a screen readers.
 *
 * Usar para:
 *   - Botones con solo iconos (label oculto)
 *   - Headings necesarios para estructura semantica pero no visibles
 *   - Contexto adicional para screen readers
 *
 * @example
 * <button>
 *   <TrashIcon aria-hidden />
 *   <VisuallyHidden>Eliminar producto</VisuallyHidden>
 * </button>
 */

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  /** Si true, elemento se vuelve visible cuando recibe focus (skip-links) */
  showOnFocus?: boolean;
}

const baseStyle: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export const VisuallyHidden = forwardRef<HTMLSpanElement, Props>(
  function VisuallyHidden({ showOnFocus = false, className, ...rest }, ref) {
    if (showOnFocus) {
      return (
        <span
          ref={ref}
          className={className}
          style={baseStyle}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, {
              position: "fixed",
              width: "auto",
              height: "auto",
              padding: "16px 24px",
              margin: 0,
              overflow: "visible",
              clip: "auto",
              whiteSpace: "normal",
              zIndex: 9999,
              top: "16px",
              left: "16px",
              background: "var(--text-primary)",
              color: "var(--surface-canvas)",
              borderRadius: "9999px",
              fontWeight: 700,
              fontSize: "14px",
            });
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            Object.assign(e.currentTarget.style, baseStyle);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      );
    }

    return <span ref={ref} className={className} style={baseStyle} {...rest} />;
  },
);
