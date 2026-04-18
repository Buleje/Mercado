"use client";

/**
 * ContextualHintBar — Barra flotante contextual que aparece al scrollear.
 *
 * Reglas de aparicion:
 *   - Solo en /marketplace (path exacto).
 *   - Visible si scrollY > 500px.
 *   - Rota un hint cada 8s.
 *   - Dismissible — una vez cerrada, queda oculta por 24h (localStorage).
 *
 * Cada hint es un CTA que conecta al user con un modulo del ecosistema:
 * comparar, bodega-al-mes, socio, asistente, favoritos, recetas.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Crown,
  GitCompareArrows,
  Heart,
  Repeat,
  X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Hint = {
  id: string;
  href: string;
  label: string;
  Icon: typeof Crown;
};

const HINTS: Hint[] = [
  {
    id: "compare",
    href: "/marketplace/comparar",
    label: "Sabias que podes comparar hasta 4 productos de distintas bodegas?",
    Icon: GitCompareArrows,
  },
  {
    id: "sub",
    href: "/marketplace/bodega-al-mes",
    label: "Ahorra 5% cada semana con Bodega al Mes. Pausalo cuando quieras.",
    Icon: Repeat,
  },
  {
    id: "socio",
    href: "/socio-buleje",
    label: "Envio gratis siempre y cashback con Socio Buleje.",
    Icon: Crown,
  },
  {
    id: "asistente",
    href: "/asistente",
    label: "Escribile al asistente si no sabes que cocinar hoy.",
    Icon: Bot,
  },
  {
    id: "recetas",
    href: "/recetas",
    label: "Guarda recetas favoritas y agrega sus ingredientes al carrito.",
    Icon: BookOpen,
  },
  {
    id: "wishlist",
    href: "/marketplace/favoritos",
    label: "Agrega productos a favoritos y te avisamos si bajan de precio.",
    Icon: Heart,
  },
];

const DISMISS_KEY = "marketplace-hint-dismissed-until";
const DISMISS_HOURS = 24;
const SCROLL_THRESHOLD = 500;
const ROTATE_MS = 8000;

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function markDismissed() {
  if (typeof window === "undefined") return;
  try {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    /* silencioso */
  }
}

export default function ContextualHintBar() {
  const pathname = usePathname();
  // Lazy init: en SSR devolvemos true (oculto); en cliente leemos localStorage
  // una sola vez al mount. Esto evita setState-en-effect y re-renders extras.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return isDismissed();
  });
  const [scrolledPast, setScrolledPast] = useState(false);
  const [index, setIndex] = useState(0);

  // Activa solo en /marketplace exacto (no en sub-rutas).
  const isHome = pathname === "/marketplace";

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => {
      setScrolledPast((prev) => {
        const next = window.scrollY > SCROLL_THRESHOLD;
        return prev === next ? prev : next;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  useEffect(() => {
    if (!isHome || dismissed || !scrolledPast) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % HINTS.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [isHome, dismissed, scrolledPast]);

  const hint = useMemo(() => HINTS[index % HINTS.length], [index]);

  if (!isHome || dismissed || !scrolledPast) return null;

  const { Icon } = hint;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 z-40 -translate-x-1/2",
        // Debajo del navbar (~60px).
        "top-[68px]",
        "max-w-xl w-[calc(100%-2rem)]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-full px-4 py-2.5",
          "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
          "elev-2 shadow-lg",
        )}
      >
        <Icon
          className="h-4 w-4 shrink-0 text-[var(--surface-canvas)]/80"
          strokeWidth={1.75}
          aria-hidden
        />
        <Link
          href={hint.href}
          className={cn(
            "flex-1 min-w-0 text-[length:var(--ts-xs)] sm:text-[length:var(--ts-sm)] font-medium",
            "truncate inline-flex items-center gap-1.5",
            "hover:opacity-90 transition-opacity",
          )}
        >
          <span className="truncate">{hint.label}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => {
            markDismissed();
            setDismissed(true);
          }}
          aria-label="Ocultar sugerencias"
          className={cn(
            "shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full",
            "text-[var(--surface-canvas)]/70 hover:text-[var(--surface-canvas)]",
            "hover:bg-white/10 transition-colors",
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
