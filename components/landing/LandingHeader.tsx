"use client";

/**
 * LandingHeader.tsx — Landing comercial (pre-auth).
 *
 * Este header es PARA `/`, `/nosotros`, `/vender`, `/precios`,
 * `/como-funciona`, `/faq`.
 * Para el marketplace post-auth usar `components/marketplace/MarketplaceNavbar.tsx`.
 *
 * Separación intencional:
 *   - Landing → conversión (registro)
 *   - Marketplace → transacción (compra)
 *
 * Construido sobre @buleje/design-system (PrimaryButton, Chip) + BulejeMark/Wordmark.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PrimaryButton, cn } from "@buleje/design-system";
import { X, MessageCircle, ArrowRight } from "@buleje/design-system/icons";
import {
  BulejeMark,
  BulejeWordmark,
} from "@/components/ui-system/illustrations";
import BrandLogo from "@/components/branding/BrandLogo";
import PromoBannerTop from "@/components/landing/PromoBannerTop";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { useNavVisibility } from "@/hooks/use-nav-visibility";

// ── Nav links canónicos (mission spec) ──────────────────────────────────────
type NavLink = {
  id: string;
  label: string;
  href: string;
};

// Nav links de la landing — todos dentro del contexto pre-auth.
// Brandon mayo 2026: reducidos de 6 a 4. "Inicio" se quita porque el logo
// ya lleva ahí. "Nosotros" se saca porque era el anchor menos transitado.
// El superadmin sigue pudiendo ocultar individualmente vía
// /superadmin/stores → tab Navegación (useNavVisibility).
const NAV_LINKS: readonly NavLink[] = [
  { id: "como-funciona", label: "Cómo funciona", href: "/#como-funciona" },
  { id: "planes", label: "Planes", href: "/#planes" },
  { id: "faq", label: "FAQ", href: "/#faq" },
  { id: "abrir-tienda", label: "Abre tu Tienda", href: "/abrir-tienda" },
] as const;

// ── Active-state matcher (rutas exactas, / solo matchea en root) ────────────
function isActiveLink(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface LandingHeaderProps {
  /** Force el variant "opaque" (útil en rutas internas donde no queremos transparencia). */
  alwaysOpaque?: boolean;
  className?: string;
}

export default function LandingHeader({
  alwaysOpaque = false,
  className,
}: LandingHeaderProps) {
  const pathname = usePathname();
  // alwaysOpaque seeds initial state so we don't trigger a cascading render.
  const [scrolled, setScrolled] = useState<boolean>(alwaysOpaque);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Visibilidad controlada desde superadmin. Durante SSR muestra todos;
  // el hook sincroniza con localStorage tras mount.
  const visibility = useNavVisibility("landing");
  const visibleLinks = NAV_LINKS.filter(
    (l) => visibility[l.id] !== false,
  );

  // AuthModal state — primary CTA abre modal "register", ghost "login"
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  // Scroll listener — opaque background after 20px (skip when alwaysOpaque).
  // The mobile sheet is closed by each Link's onClick handler + backdrop click,
  // so we don't need a pathname-change effect (avoids set-state-in-effect).
  useEffect(() => {
    if (alwaysOpaque) return;
    const handler = () => setScrolled(window.scrollY > 20);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [alwaysOpaque]);

  // Close mobile sheet + lock body scroll while sheet open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const handleLogin = useCallback(() => {
    openAuthModal();
  }, [openAuthModal]);

  const handleSignup = useCallback(() => {
    openAuthModal();
  }, [openAuthModal]);

  // Nav rediseñado mayo 2026 (Brandon: "muy plana y fea"):
  //   - Antes: transparente al inicio, sutil al scroll → se sentía vacío.
  //   - Ahora: siempre con leve elevación (backdrop blur + shadow + ring),
  //     y al hacer scroll el contraste sube (más opacidad + shadow más fuerte).
  const headerBg = scrolled
    ? "bg-[var(--surface-canvas)]/95 backdrop-blur-xl border-b border-[var(--rule-base)] shadow-[0_4px_20px_-8px_rgba(0,0,0,0.12)]"
    : "bg-[var(--surface-canvas)]/75 backdrop-blur-lg border-b border-[var(--rule-soft)] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.06)]";

  return (
    <>
      {/* Banner promocional dismissible — no-sticky, sale del viewport con scroll. */}
      <PromoBannerTop />

      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-200",
          headerBg,
          className,
        )}
        role="banner"
        aria-label="Nav comercial — Buleje"
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* ── Logo + tagline (desktop) ── */}
          <Link
            href="/"
            aria-label="Buleje — Ir al inicio"
            className="flex shrink-0 items-center gap-2 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
          >
            <BrandLogo
              variant="wordmark"
              height={32}
              fallback={<BulejeWordmark size={32} textSize={18} strokeWidth={1.75} />}
            />
            <span
              aria-hidden
              className="hidden lg:inline-flex flex-col leading-none border-l border-[var(--rule-base)] pl-2 ml-1"
            >
              <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                Tienda online
              </span>
              <span className="text-[10px] font-medium tracking-tight text-[var(--text-tertiary)]">
                en 5 minutos
              </span>
            </span>
          </Link>

          {/* ── Pill nav central (desktop ≥ lg) ── */}
          <nav
            aria-label="Navegación principal"
            className="hidden lg:inline-flex items-center gap-0.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)]/60 backdrop-blur-md p-1 shadow-sm"
          >
            {visibleLinks.map((link) => {
              const active = isActiveLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]/70 hover:text-[var(--text-primary)]",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* ── CTAs derecha (desktop) ── */}
          <div className="hidden items-center gap-2 lg:flex">
            <PrimaryButton
              variant="ghost"
              size="md"
              onClick={handleLogin}
              aria-label="Ingresar a tu cuenta"
            >
              Ingresar
            </PrimaryButton>
            <button
              type="button"
              onClick={handleSignup}
              aria-label="Empezar mi tienda"
              className={cn(
                "group inline-flex items-center gap-2 h-10 px-5 rounded-full",
                "bg-[var(--accent)] text-white text-sm font-extrabold",
                "shadow-md shadow-[var(--accent)]/25",
                "hover:gap-3 hover:shadow-lg hover:shadow-[var(--accent)]/35 hover:bg-[var(--accent)]/95",
                "active:scale-[0.98] transition-all duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
            >
              Empezar mi tienda
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.75}
                aria-hidden
              />
            </button>
          </div>

          {/* ── Hamburger animado (mobile) ── */}
          <button
            type="button"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-lg lg:hidden",
              "text-[var(--text-primary)] transition-colors",
              "hover:bg-[var(--surface-sunken)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            )}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-sheet"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            <span aria-hidden className="relative flex h-4 w-5 flex-col justify-between">
              <span
                className={cn(
                  "block h-[2px] w-full rounded-full bg-current transition-all duration-200 origin-center",
                  mobileOpen ? "translate-y-[7px] rotate-45" : "",
                )}
              />
              <span
                className={cn(
                  "block h-[2px] w-full rounded-full bg-current transition-opacity duration-150",
                  mobileOpen ? "opacity-0" : "opacity-100",
                )}
              />
              <span
                className={cn(
                  "block h-[2px] w-full rounded-full bg-current transition-all duration-200 origin-center",
                  mobileOpen ? "-translate-y-[7px] -rotate-45" : "",
                )}
              />
            </span>
          </button>
        </div>
      </header>

      {/* ── Mobile sheet (right-side drawer) ── */}
      <MobileSheet
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        pathname={pathname}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />

      {/* ── AuthModal (ya existente, shared login/signup) ── */}
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MobileSheet — right-side drawer con logo, nav en columna, CTAs full-width
// ─────────────────────────────────────────────────────────────────────────────

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  pathname: string | null;
  onLogin: () => void;
  onSignup: () => void;
}

function useVisibleLinks() {
  const visibility = useNavVisibility("landing");
  return NAV_LINKS.filter((l) => visibility[l.id] !== false);
}

function MobileSheet({
  open,
  onClose,
  pathname,
  onLogin,
  onSignup,
}: MobileSheetProps) {
  const visibleLinks = useVisibleLinks();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-mobile-sheet-title"
      id="landing-mobile-sheet"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar menú"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-[var(--surface-canvas)]",
          "border-l border-[var(--rule-base)] shadow-xl",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        {/* Header of sheet — logo + close */}
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-5 py-4">
          <Link
            href="/"
            onClick={onClose}
            aria-label="Buleje — Ir al inicio"
            className="flex items-center gap-2 text-[var(--text-primary)]"
          >
            <BrandLogo
              variant="wordmark"
              height={32}
              fallback={
                <>
                  <BulejeMark size={32} strokeWidth={1.75} />
                  <span
                    id="landing-mobile-sheet-title"
                    className="text-base font-bold tracking-tight"
                  >
                    Buleje
                  </span>
                </>
              }
            />
          </Link>
          <button
            type="button"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              "text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            )}
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Header decorativo del sheet — gradient sutil con identidad */}
        <div className="flex items-center justify-center border-b border-[var(--rule-base)] bg-gradient-to-b from-[var(--accent-soft)] to-[var(--surface-sunken)] py-6">
          <BulejeMark
            size={72}
            strokeWidth={1.4}
            className="text-[var(--accent)]"
          />
        </div>

        {/* Nav column */}
        <nav
          aria-label="Navegación principal mobile"
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          <ul className="flex flex-col gap-1">
            {visibleLinks.map((link) => {
              const active = isActiveLink(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className={cn(
                      "flex h-12 items-center rounded-xl px-3.5 text-lg font-semibold transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Separator + CTAs */}
        <div className="border-t border-[var(--rule-base)] px-4 py-4">
          <div className="flex flex-col gap-2">
            <PrimaryButton
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => {
                onClose();
                onLogin();
              }}
            >
              Ingresar
            </PrimaryButton>
            <PrimaryButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => {
                onClose();
                onSignup();
              }}
            >
              Empezar mi tienda
            </PrimaryButton>
          </div>
        </div>

        {/* Footer sutil con copyright + WhatsApp */}
        <div className="border-t border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
            <span>© Buleje {new Date().getFullYear()}</span>
            <a
              href="https://wa.me/51999999999"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium",
                "text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
              aria-label="Contáctanos por WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              WhatsApp
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
