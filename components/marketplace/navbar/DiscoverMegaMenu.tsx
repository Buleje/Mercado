"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Compass,
  Gift,
  HeartHandshake,
  Package,
  Flashlight,
  Sparkles,
  GitCompareArrows,
  BadgePercent,
  ChefHat,
  Store,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type MegaMenuItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

/**
 * Items del mega-menu "Descubrí". Orden = jerarquía de descubrimiento.
 * Cada feature refleja una entry del registry (lib/navigation/feature-registry.ts)
 * pero con icon ya resuelto al componente para render directo.
 */
const MEGA_ITEMS: MegaMenuItem[] = [
  {
    icon: Flashlight,
    title: "Buleje en Vivo",
    description: "Transmisiones desde las bodegas del barrio.",
    href: "/marketplace/en-vivo",
  },
  {
    icon: Sparkles,
    title: "Asistente IA",
    description: "Preguntale al bot sobre frescura y usos.",
    href: "/asistente",
  },
  {
    icon: GitCompareArrows,
    title: "Comparar productos",
    description: "Hasta 4 productos lado a lado.",
    href: "/marketplace/comparar",
  },
  {
    icon: Gift,
    title: "Gift Cards",
    description: "Regalos desde S/ 20, sin vencimiento.",
    href: "/marketplace/gift-cards",
  },
  {
    icon: Package,
    title: "Bodega al Mes",
    description: "Suscripción recurrente con 5% off.",
    href: "/cuenta/suscripciones",
  },
  {
    icon: HeartHandshake,
    title: "Socio Buleje",
    description: "Delivery gratis y cashback todos los meses.",
    href: "/socio-buleje",
  },
  {
    icon: BadgePercent,
    title: "Ofertas flash",
    description: "Descuentos por tiempo limitado.",
    href: "/marketplace/ofertas",
  },
  {
    icon: ChefHat,
    title: "Recetas",
    description: "Cocina pucallpina paso a paso.",
    href: "/recetas",
  },
];

type Props = {
  /** Variante visual. `desktop` abre dropdown, `mobile` renderiza lista vertical. */
  variant?: "desktop" | "mobile";
  /** Callback cuando se hace click en un item (útil para cerrar el drawer mobile). */
  onNavigate?: () => void;
};

/**
 * <DiscoverMegaMenu> — mega-dropdown "Descubrí" de features Buleje.
 *
 * Variantes:
 *  - desktop: botón con ChevronDown. Hover/click abre panel en 2 columnas.
 *  - mobile: render inline dentro del sheet del navbar mobile.
 */
export default function DiscoverMegaMenu({
  variant = "desktop",
  onNavigate,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (variant === "mobile") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          <Compass className="h-3 w-3" strokeWidth={1.75} aria-hidden />
          Descubrí
        </div>
        {MEGA_ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => {
                onNavigate?.();
              }}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block">{it.title}</span>
                <span className="mt-0.5 block text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
                  {it.description}
                </span>
              </span>
            </Link>
          );
        })}
        <Link
          href="/descubri"
          onClick={() => onNavigate?.()}
          className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-bold text-primary hover:border-primary/60 hover:bg-primary/10 transition-colors"
        >
          <span>¿Nuevo en Buleje? Conocé todas las novedades</span>
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
          open
            ? "text-gray-900 dark:text-white"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
        )}
      >
        <Compass className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        Descubrí
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Descubrí más en Buleje"
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[min(640px,92vw)] rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950 overflow-hidden z-50"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 p-2">
            {MEGA_ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  role="menuitem"
                  onClick={() => {
                    close();
                    onNavigate?.();
                  }}
                  className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 group-hover:border-primary/40 group-hover:text-primary dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 transition-colors">
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                      {it.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-gray-500 dark:text-gray-400">
                      {it.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 p-3">
            <Link
              href="/descubri"
              onClick={() => {
                close();
                onNavigate?.();
              }}
              className="flex items-center justify-between gap-3 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10 hover:border-primary/40"
            >
              <span className="inline-flex items-center gap-2">
                <Store className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                ¿Nuevo en Buleje? Conocé todas las novedades
              </span>
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
