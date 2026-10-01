"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Store, ArrowUpRight } from "@buleje/design-system/icons";

/**
 * StickyActivateCTA — barra/pastilla flotante con la CTA principal que sigue
 * el scroll en /abrir-tienda (página larga ~10k px). Aparece tras pasar el hero
 * y se OCULTA cerca del fondo para no tapar la CTA final ni el footer.
 * Mobile: barra inferior por encima del BottomNav. Desktop: pastilla centrada.
 */
export default function StickyActivateCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const compute = () => {
      const y = window.scrollY;
      const fromBottom =
        document.documentElement.scrollHeight - (y + window.innerHeight);
      // Visible: pasado el hero (700px) y lejos del cierre/footer (>900px).
      setVisible(y > 700 && fromBottom > 900);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        compute();
        ticking = false;
      });
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      style={{
        transform: visible ? "translateY(0)" : "translateY(140%)",
        transition: "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease",
        opacity: visible ? 1 : 0,
      }}
      // Sobre el BottomNav en mobile (≈64px); pegado abajo-centro en desktop.
      className="fixed inset-x-0 bottom-[4.75rem] z-40 px-3 lg:bottom-6 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 p-2 pl-5 shadow-[0_12px_40px_rgba(2,6,23,0.18)] backdrop-blur-md lg:max-w-none">
        <div className="min-w-0 flex-1 lg:flex-none lg:pr-2">
          <p className="truncate text-sm font-extrabold leading-tight text-[var(--text-primary)]">
            Activá tu tienda gratis
          </p>
          <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
            0% comisión · sin tarjeta
          </p>
        </div>
        <Link
          href="/marketplace/registrar"
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 transition-all hover:gap-2.5"
        >
          <Store className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Activar gratis
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.5}
            aria-hidden
          />
        </Link>
      </div>
    </div>
  );
}
