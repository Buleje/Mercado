"use client";

/**
 * MarketplaceNavLinks — nav de links del marketplace con overflow adaptativo.
 *
 * Problema que resuelve (Brandon 2026-05-30): en modo "Marketplace completo"
 * el superadmin activa hasta 11 links; el pill estático no cabía en laptops
 * (1280–1440px) → el texto se partía en 2 líneas, el logo se aplastaba y el
 * botón "Ingresar" quedaba cortado.
 *
 * Estrategia (elegida por Brandon): "priority navigation". Medimos el ancho
 * real disponible con un ResizeObserver y una capa fantasma (ghost) que tiene
 * TODOS los chips a su ancho natural. Los que entran se muestran; el resto se
 * pliega bajo un botón "Más ▾". Nunca se desborda, sin importar cuántos links
 * active el superadmin ni el ancho de pantalla.
 *
 * El slot "Descubrí" (mega-menú) se muestra completo cuando hay espacio; si
 * cae al overflow degrada con gracia a un link simple → /marketplace/para-vos.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { NavLink } from "@/components/marketplace/MarketplaceNavbar";

// Lazy — framer-motion + panel pesado, solo aparece al interactuar.
const DiscoverMegaMenu = dynamic(
  () => import("@/components/marketplace/navbar/DiscoverMegaMenu"),
  {},
);

type Props = {
  links: readonly NavLink[];
  isActive: (link: NavLink) => boolean;
  t: (key: string) => string;
  hasActiveLive: boolean;
};

// useLayoutEffect mide antes del paint (sin flash) en cliente; en SSR no
// existe layout, así que caemos a useEffect para evitar el warning de React.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// gap-0.5 del pill = 2px · chrome del pill (border 1px×2 + p-1 4px×2) ≈ 10px.
const CHIP_GAP_PX = 2;
const PILL_CHROME_PX = 12;
// Espacio reservado para el botón "Más ▾" cuando hay overflow (label + chevron + padding).
const MORE_BTN_PX = 70;

export default function MarketplaceNavLinks({
  links,
  isActive,
  t,
  hasActiveLive,
}: Props) {
  // `trackRef` = la pista flexible cuyo ancho real es el presupuesto disponible.
  const trackRef = useRef<HTMLDivElement>(null);
  // `ghostRef` = capa oculta con TODOS los chips para medir su ancho natural.
  const ghostRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const [visibleCount, setVisibleCount] = useState(links.length);
  const [moreOpen, setMoreOpen] = useState(false);

  // ── Medición: ¿cuántos chips entran en la pista? ──────────────────────────
  useIsomorphicLayoutEffect(() => {
    const recompute = () => {
      const track = trackRef.current;
      const ghost = ghostRef.current;
      if (!track || !ghost) return;
      const available = track.clientWidth - PILL_CHROME_PX;
      const items = Array.from(ghost.children) as HTMLElement[];
      const widths = items.map((el) => el.getBoundingClientRect().width);
      const n = widths.length;
      if (n === 0) return;

      // ¿Entran todos sin botón "Más"?
      const sumAll =
        widths.reduce((a, b) => a + b, 0) + CHIP_GAP_PX * Math.max(0, n - 1);
      if (sumAll <= available + 0.5) {
        setVisibleCount(n);
        return;
      }

      // No entran todos → acomodar reservando lugar para "Más ▾".
      let used = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const next = used + (i > 0 ? CHIP_GAP_PX : 0) + widths[i];
        if (next + CHIP_GAP_PX + MORE_BTN_PX <= available) {
          used = next;
          count++;
        } else {
          break;
        }
      }
      setVisibleCount(Math.max(1, count));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    const track = trackRef.current;
    if (track) ro.observe(track);
    // Re-medir cuando las fuentes terminan de cargar (cambian anchos).
    const fonts = (
      typeof document !== "undefined"
        ? (document as Document & { fonts?: FontFaceSet }).fonts
        : undefined
    );
    fonts?.ready?.then(recompute).catch(() => {
      /* fire-and-forget: si fonts.ready rechaza, la medición inicial ya corrió. */
    });
    return () => ro.disconnect();
  }, [links]);

  // ── Cierre del dropdown "Más" (click afuera / Escape) ─────────────────────
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Cerrar el dropdown si el overflow desaparece (resize que muestra todo).
  useEffect(() => {
    if (visibleCount >= links.length && moreOpen) setMoreOpen(false);
  }, [visibleCount, links.length, moreOpen]);

  // ── Chip individual (pill) ────────────────────────────────────────────────
  const renderChip = useCallback(
    (link: NavLink, opts?: { measure?: boolean }) => {
      const active = isActive(link);
      const LinkIcon = link.icon;
      return (
        <Link
          key={link.href}
          href={link.href}
          tabIndex={opts?.measure ? -1 : undefined}
          aria-hidden={opts?.measure || undefined}
          aria-current={active ? "page" : undefined}
          className={cn(
            "whitespace-nowrap inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-all",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            active
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
          )}
        >
          <LinkIcon
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{t(link.labelKey)}</span>
          {link.showLiveDot && hasActiveLive && (
            <span
              aria-label={t("nav.liveNow")}
              className="relative ml-0.5 inline-flex h-1.5 w-1.5"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-error-500)] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)]" />
            </span>
          )}
        </Link>
      );
    },
    [isActive, t, hasActiveLive],
  );

  // Proxy de "Descubrí" para la capa de medición — replica el ancho del
  // trigger real del DiscoverMegaMenu (Compass + label + chevron, px-3.5 py-2).
  const renderDiscoverGhost = () => (
    <span
      key="discover-ghost"
      aria-hidden="true"
      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold"
    >
      <span className="h-3.5 w-3.5" />
      {t("nav.discover")}
      <span className="h-3.5 w-3.5" />
    </span>
  );

  const slots = links.map((link, i) => ({ link, i }));
  const visibleSlots = slots.slice(0, visibleCount);
  const overflowSlots = slots.slice(visibleCount);
  const hasOverflow = overflowSlots.length > 0;

  return (
    // Pista flexible — su ancho real es el presupuesto medible. Comparte la
    // pista 4:3 con el search (nav un poco más). min-w-0 deja que flexbox la
    // achique en vez de empujar al cluster derecho.
    <div ref={trackRef} className="hidden lg:flex min-w-0 flex-1 items-center justify-center">
      {/* ── Capa fantasma (oculta) para medir anchos naturales ── */}
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute -left-[9999px] top-0 inline-flex items-center gap-0.5"
      >
        {links.map((link) =>
          link.discover
            ? renderDiscoverGhost()
            : renderChip(link, { measure: true }),
        )}
      </div>

      {/* Links visibles — planos (Brandon 2026-06-07): sin pill, sin borde,
          sin sombra ni backdrop-blur. El estado activo se marca con fill sólido. */}
      <div className="inline-flex max-w-full items-center gap-1">
        {visibleSlots.map(({ link }) =>
          link.discover ? (
            <DiscoverMegaMenu key="discover" variant="desktop" />
          ) : (
            renderChip(link)
          ),
        )}

        {hasOverflow && (
          <div ref={moreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={moreOpen}
              aria-label="Más secciones del marketplace"
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-semibold transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                moreOpen
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
              )}
            >
              <span>{t("nav.more") || "Más"}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  moreOpen && "rotate-180",
                )}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>

            {moreOpen && (
              <div
                role="menu"
                aria-label="Más secciones"
                className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 shadow-[var(--shadow-md)]"
              >
                {overflowSlots.map(({ link }) => {
                  const active = isActive(link);
                  const LinkIcon = link.icon;
                  const href = link.discover
                    ? "/marketplace/para-vos"
                    : link.href;
                  const label = link.discover
                    ? t("nav.discover")
                    : t(link.labelKey);
                  return (
                    <Link
                      key={link.id}
                      href={href}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                          : "text-[var(--text-primary)] hover:bg-[var(--surface-alt)]",
                      )}
                    >
                      <LinkIcon
                        className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className="flex-1">{label}</span>
                      {link.showLiveDot && hasActiveLive && (
                        <span
                          aria-label={t("nav.liveNow")}
                          className="relative inline-flex h-1.5 w-1.5"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-error-500)] opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)]" />
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
