"use client";

/**
 * MarketplaceSectionNav — barra sticky de navegación por secciones (scrollspy).
 *
 * Lista anclas de las secciones del feed; un IntersectionObserver ilumina la
 * que estás mirando y un click te lleva ahí con scroll suave. Hace navegable el
 * feed largo sin perderse. Las anclas son los `id` de cada BodegasSectionBox.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SectionNavItem {
  /** id del elemento ancla en el DOM (BodegasSectionBox anchorId). */
  id: string;
  label: string;
}

export default function MarketplaceSectionNav({
  sections,
}: {
  sections: readonly SectionNavItem[];
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);

  // Scrollspy: observa cada ancla y marca activa la más cercana al tope.
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inView[0]) setActive(inView[0].target.id);
      },
      // zona de detección: una franja debajo del nav sticky.
      { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.15, 0.5] },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  // Mantener la pill activa visible dentro del scroll horizontal del nav.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLElement>(`[data-section="${active}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Las secciones son `defer` (montan al acercarse) → su alto crece tras el
    // primer scroll y quedaríamos pasados. Re-ajustamos una vez montado el
    // contenido real (sin esto el "Catálogo" aterriza dentro de los productos).
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 480);
  };

  if (sections.length < 2) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Navegación por secciones"
      className="sticky top-16 z-30 flex gap-1.5 overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-2 py-1.5 shadow-sm backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            data-section={s.id}
            onClick={() => go(s.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
              isActive
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
