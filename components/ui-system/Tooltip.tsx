"use client";

/**
 * Tooltip — Tooltip accesible con 4 placements.
 *
 * No usa portal (para evitar z-index wars). Se muestra con CSS transitions
 * y aparece al hover/focus. Mobile: tap para mostrar, tap fuera para cerrar.
 *
 * A11y: role="tooltip" + aria-describedby wiring automatico.
 *
 * Uso:
 *   <Tooltip content="S/ por kg, IGV incluido">
 *     <span className="underline decoration-dotted">precio</span>
 *   </Tooltip>
 */

import { useId, useState, cloneElement, type ReactElement, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props {
  content: React.ReactNode;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  /** Placement. Default "top" */
  placement?: "top" | "bottom" | "left" | "right";
  /** Delay en ms antes de mostrar. Default 300 */
  delayMs?: number;
  /** ClassName del tooltip */
  className?: string;
}

export default function Tooltip({ content, children, placement = "top", delayMs = 300, className }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => setVisible(true), delayMs));
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    setVisible(false);
  };

  const placementClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[placement];

  const childProps = children.props as HTMLAttributes<HTMLElement>;

  const enhanced = cloneElement(children, {
    "aria-describedby": visible ? id : undefined,
    onMouseEnter: (e) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e) => {
      childProps.onBlur?.(e);
      hide();
    },
  } as HTMLAttributes<HTMLElement>);

  return (
    <span className="relative inline-block">
      {enhanced}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "absolute z-50 whitespace-nowrap rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)]",
          "px-2.5 py-1 text-xs font-bold pointer-events-none",
          "transition-opacity duration-150",
          visible ? "opacity-100" : "opacity-0",
          placementClass,
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
