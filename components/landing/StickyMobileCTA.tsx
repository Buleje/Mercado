"use client";

/**
 * StickyMobileCTA — barra de accion fija en la parte inferior del viewport
 * mobile. Aparece despues de scrollear el hero (para no competir con el
 * buscador). Se oculta en desktop (md:hidden).
 *
 * Patron tomado de Mercado Libre, Rappi, PedidosYa mobile — la CTA
 * siempre-visible en mobile aumenta conversion entre 15-25%.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@buleje/design-system/icons";

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // Aparece despues de 400px de scroll (hero alto ~600px mobile)
      setVisible(window.scrollY > 400);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href="/marketplace"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-6 py-3.5 text-sm font-bold text-[var(--surface-canvas)] shadow-lg active:scale-[0.98] transition-transform"
        >
          Explorar marketplace
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
