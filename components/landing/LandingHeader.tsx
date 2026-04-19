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
import { Chip, PrimaryButton, cn } from "@buleje/design-system";
import { Menu, X, MessageCircle } from "@buleje/design-system/icons";
import {
  BulejeMark,
  BulejeWordmark,
} from "@/components/ui-system/illustrations";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";

// ── Nav links canónicos (mission spec) ──────────────────────────────────────
type NavLink = {
  label: string;
  href: string;
};

const NAV_LINKS: readonly NavLink[] = [
  { label: "Inicio", href: "/" },
  { label: "Nosotros", href: "/nosotros" },
  { label: "Abre tu Tienda", href: "/vender" },
  { label: "Precios", href: "/precios" },
  { label: "Cómo funciona", href: "/como-funciona" },
  { label: "FAQ", href: "/faq" },
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

  const headerBg = scrolled
    ? "bg-[var(--surface-canvas)]/85 backdrop-blur-md border-b border-[var(--rule-base)]"
    : "bg-transparent border-b border-transparent";

  return (
    <>
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
          {/* ── Logo izquierda ── */}
          <Link
            href="/"
            aria-label="Buleje — Ir al inicio"
            className="flex shrink-0 items-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
          >
            <BulejeWordmark size={32} textSize={18} strokeWidth={1.75} />
          </Link>

          {/* ── Links centrales (desktop ≥ lg) ── */}
          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-1 lg:flex"
          >
            {NAV_LINKS.map((link) => {
              const active = isActiveLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] focus-visible:rounded-sm",
                    active
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--accent)]",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--accent)]"
                    />
                  ) : null}
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
            <div className="flex items-center gap-2">
              <PrimaryButton
                variant="primary"
                size="md"
                onClick={handleSignup}
                aria-label="Registrarse gratis"
              >
                Registrarse
              </PrimaryButton>
              <Chip size="sm" className="hidden xl:inline-flex">
                Gratis
              </Chip>
            </div>
          </div>

          {/* ── Hamburger (mobile) ── */}
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
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
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

function MobileSheet({
  open,
  onClose,
  pathname,
  onLogin,
  onSignup,
}: MobileSheetProps) {
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
            <BulejeMark size={32} strokeWidth={1.75} />
            <span
              id="landing-mobile-sheet-title"
              className="text-base font-bold tracking-tight"
            >
              Buleje
            </span>
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

        {/* Ilustración identidad (refuerzo mobile) */}
        <div className="flex items-center justify-center border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] py-6">
          <BulejeMark
            size={72}
            strokeWidth={1.4}
            className="text-[var(--text-secondary)]"
          />
        </div>

        {/* Nav column */}
        <nav
          aria-label="Navegación principal mobile"
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = isActiveLink(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className={cn(
                      "flex h-12 items-center rounded-lg px-3 text-lg font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                      active
                        ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
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
              Registrarse gratis
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
