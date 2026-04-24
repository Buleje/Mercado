"use client";

/**
 * PrefetchLink — Link mejorado que hace prefetch agresivo al hover.
 *
 * Next.js 15+ ya hace prefetch on-viewport por default, pero el usuario
 * percibe un gap cuando el prefetch no terminó aún. Este wrapper fuerza
 * prefetch al primer hover (desktop) o primer touch start (mobile),
 * típicamente 200-400ms ANTES del click real.
 *
 * Resultado: click → navegación casi instantánea (<50ms perceived).
 *
 * Props idénticas a next/link + `warmOn` opcional:
 *   "hover" (default): prefetch al mouseenter
 *   "viewport": prefetch al entrar en viewport (ya default de Next)
 *   "both": los dos
 */

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useCallback, type AnchorHTMLAttributes, type ReactNode } from "react";

interface Props
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>,
    LinkProps {
  children: ReactNode;
  warmOn?: "hover" | "viewport" | "both";
}

export default function PrefetchLink({
  href,
  children,
  warmOn = "hover",
  onMouseEnter,
  onTouchStart,
  ...rest
}: Props) {
  const router = useRouter();
  const prefetchedRef = useRef(false);

  const handleWarm = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    try {
      if (typeof href === "string") {
        router.prefetch(href);
      }
    } catch {
      /* silent */
    }
  }, [href, router]);

  return (
    <Link
      href={href}
      onMouseEnter={(e) => {
        if (warmOn === "hover" || warmOn === "both") handleWarm();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        if (warmOn === "hover" || warmOn === "both") handleWarm();
        onTouchStart?.(e);
      }}
      prefetch={warmOn === "viewport" || warmOn === "both"}
      {...rest}
    >
      {children}
    </Link>
  );
}
