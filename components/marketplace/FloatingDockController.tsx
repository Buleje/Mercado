"use client";

/**
 * FloatingDockController — botón flotante "Recientes" + drawer de historial.
 *
 * Brandon 2026-06-06 (rediseño): antes era un QuickActionsDock genérico
 * (círculo con reloj + badge). Ahora es un pill rico estilo dock de iOS:
 *   - Stack de mini-thumbnails de los últimos productos vistos (solapadas)
 *   - Label "Seguí viendo" + count
 *   - Aparece tras scrollear (no invade el primer viewport)
 *   - Abre el RecentlyViewedDrawer (rediseñado como side-panel)
 *
 * Vive dentro de MarketplaceFloatingWidgets (post-FCP).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Clock, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import RecentlyViewedDrawer from "@/components/ui-system/RecentlyViewedDrawer";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

// Rutas del marketplace donde el dock NO aplica (no son flujo de compra).
const HIDE_ON = [
  "/marketplace/repartidor",
  "/marketplace/aplicar",
  "/marketplace/onboarding",
];

const SCROLL_THRESHOLD = 400;

export default function FloatingDockController() {
  const pathname = usePathname() ?? "";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const { items } = useRecentlyViewed();

  // Aparece recién después de scrollear — no invade el primer viewport.
  useEffect(() => {
    const handler = () => setVisible(window.scrollY > SCROLL_THRESHOLD);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Skip en rutas de inscripción/onboarding (no son shopping).
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  // En /tiendas el dock se oculta en mobile (clase max-md:hidden, abajo).
  const onTiendas = pathname === "/tiendas" || pathname.startsWith("/tiendas/");

  // Sin historial → no rendear nada (libera la zona derecha del viewport
  // para el chat flotante y el sticky cart bar).
  if (items.length === 0) return null;

  const thumbs = items.slice(0, 3);

  return (
    <>
      {(visible || historyOpen) && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label={`Ver productos recientes (${items.length})`}
          className={cn(
            // Mobile: bottom-32 — por ENCIMA de la bottom-nav fija (~80px) y
            // del sticky cart bar. En sm+ no hay bottom-nav → bottom-20.
            "group fixed bottom-32 sm:bottom-20 right-4 z-40 flex items-center gap-2.5",
            // Brandon 2026-06-07: en /tiendas el dock de "tu historial" se
            // oculta en mobile (md-) — /tiendas en celular va minimalista.
            onTiendas && "max-md:hidden",
            "rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur",
            "py-1.5 pl-2 pr-3 shadow-lg shadow-black/10",
            "transition-all hover:border-[var(--accent)] hover:shadow-xl hover: hover:-translate-y-0.5 active:scale-95",
            "motion-safe:animate-[slideUp_0.3s_ease-out]",
          )}
        >
          {/* Stack de thumbnails solapadas — la cara del botón */}
          <span className="flex items-center -space-x-3" aria-hidden>
            {thumbs.map((it, i) => (
              <span
                key={`${it.id}-${i}`}
                className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-[var(--surface-raised)] bg-[var(--surface-sunken)] shadow-sm"
                style={{ zIndex: 3 - i }}
              >
                {it.image ? (
                  <Image src={it.image} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                    <Clock className="h-4 w-4" strokeWidth={2} />
                  </span>
                )}
              </span>
            ))}
            {items.length > 3 && (
              <span className="relative z-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--surface-raised)] bg-[var(--accent)] text-[length:var(--ts-2xs)] font-black text-white shadow-sm">
                +{Math.min(items.length - 3, 99)}
              </span>
            )}
          </span>

          {/* Label — visible en sm+; en mobile el stack solo ya comunica */}
          <span className="hidden sm:flex min-w-0 flex-col items-start leading-none">
            <span className="text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--text-tertiary)] group-hover:text-[var(--accent)]">
              Seguí viendo
            </span>
            <span className="mt-0.5 text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
              {items.length} reciente{items.length === 1 ? "" : "s"}
            </span>
          </span>

          <ChevronRight
            className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
            strokeWidth={2.75}
            aria-hidden
          />
        </button>
      )}

      <RecentlyViewedDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
