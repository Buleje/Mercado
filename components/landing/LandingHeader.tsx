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
import {
  X,
  MessageCircle,
  ArrowRight,
  Store,
  Tag,
  HelpCircle,
  Bike,
  Home,
  Building2,
} from "@buleje/design-system/icons";
import { BulejeMark } from "@/components/ui-system/illustrations";
// Brandon 2026-05-20 v4: BrandLogo + BulejeWordmark removidos del header
// landing — el nuevo navbar usa BulejeMark + texto "Buleje" inline.
import PromoBannerTop from "@/components/landing/PromoBannerTop";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { useNavVisibility } from "@/hooks/use-nav-visibility";
import ThemeToggle from "@/components/ThemeToggle";
// LanguageSwitcher removido del landing header (mayo 2026) — producto 100% peruano
import { useLocale } from "@/contexts/locale-context";

// ── Nav links canónicos (mission spec) ──────────────────────────────────────
type NavLink = {
  id: string;
  label: string;
  href: string;
};

// Nav links de la landing — todos dentro del contexto pre-auth.
// Brandon mayo 14 2026 v5: navbar simplificado para el flujo B2C tipo Rappi.
// Quitamos "Registrarse" (formulario) y agregamos "Conocé Buleje" → /vender,
// que es la página informativa B2B (benefits, steps, calculadora, FAQ) — sirve
// al negocio que aún no decide registrarse.
const NAV_LINK_DEFS: ReadonlyArray<{ id: string; tKey: string; href: string }> = [
  { id: "inicio", tKey: "landing.nav.inicio", href: "/" },
  { id: "negocios", tKey: "landing.nav.negocios", href: "/negocios" },
  // /abrir-tienda tiene PlansToggle + BenefitsTabs + LiveSignupTicker
  // + BodegaScene — info del negocio + planes. Reemplaza al /vender.
  { id: "abrir-tienda", tKey: "landing.nav.openStore", href: "/abrir-tienda" },
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
  /**
   * Modo minimal para páginas de conversión (e.g. /abrir-tienda):
   * oculta el PromoBannerTop superior (que duplica el mensaje del hero).
   * Brandon mayo 2026: el nav de navegación SE MANTIENE visible.
   */
  minimal?: boolean;
  className?: string;
}

export default function LandingHeader({
  alwaysOpaque = false,
  minimal = false,
  className,
}: LandingHeaderProps) {
  const pathname = usePathname();
  // alwaysOpaque seeds initial state so we don't trigger a cascading render.
  const [scrolled, setScrolled] = useState<boolean>(alwaysOpaque);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Brandon 2026-05-20 v4: `currentYear` state era dead code (no se usaba en
  // el JSX del padre — solo lo usaba el MobileSheet antes del rediseño, que
  // ahora ya no lo necesita). Audit Q1 lo flageó como P1.

  // Visibilidad controlada desde superadmin. Durante SSR muestra todos;
  // el hook sincroniza con localStorage tras mount.
  const visibility = useNavVisibility("landing");
  const { t } = useLocale();
  // Construye los nav-links con labels traducidas según el locale activo.
  const NAV_LINKS: readonly NavLink[] = NAV_LINK_DEFS.map((d) => ({
    id: d.id,
    label: t(d.tKey),
    href: d.href,
  }));
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
      {/* Banner promocional dismissible — oculto en modo minimal (páginas
          de conversión) porque duplica el mensaje del hero. */}
      {!minimal && <PromoBannerTop />}

      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-200",
          headerBg,
          className,
        )}
        role="banner"
        aria-label="Nav comercial — Buleje"
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8">
          {/* ── Logo — Brandon 2026-05-20 v4: el buscador del navbar mobile
              era REDUNDANTE con el del hero (a 1 scroll de distancia, ambos
              van a /tiendas?q=). Lo quitamos para liberar espacio al logo
              completo con wordmark + microcopy comercial, igual que desktop
              pero compacto. Mobile gana identidad de marca y deja al hero
              ser el único buscador (anti-dupe). Dark mode: BrandLogo respeta
              tokens del DS. ── */}
          <Link
            href="/"
            aria-label="Buleje — Ir al inicio"
            className="flex shrink-0 items-center gap-2 sm:gap-2.5 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
            data-no-translate
          >
            <BulejeMark
              size={32}
              strokeWidth={1.75}
              className="text-[var(--text-primary)] dark:text-white shrink-0"
            />
            {/* Wordmark + microcopy visible desde el primer pixel mobile.
                Brandon 2026-05-20 v4: antes `hidden sm:inline-flex` ocultaba
                el nombre "Buleje" en celular — viewport <640px solo mostraba
                la marca circular sin contexto. Ahora visible siempre con
                tamaños responsivos. */}
            <span className="inline-flex flex-col leading-none">
              <span className="text-[15px] sm:text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Buleje
              </span>
              <span
                aria-hidden
                className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]"
              >
                Pucallpa · delivery
              </span>
            </span>
          </Link>

          {/* spacer que empuja acciones hacia la derecha en mobile */}
          <div className="flex-1 lg:hidden" aria-hidden />

          {/* ── Pill nav central (desktop ≥ lg) — mx-auto centra entre logo y CTAs ── */}
          <nav
            aria-label="Navegación principal"
            className="hidden lg:inline-flex mx-auto items-center gap-0.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)]/60 backdrop-blur-md p-1 shadow-sm"
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
                      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shadow-sm"
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
          <div className="hidden items-center gap-1.5 lg:flex">
            {/* LanguageSwitcher oculto en landing — producto 100% peruano en español.
                Volverá cuando expandamos a otros mercados de habla no-hispana. */}
            <ThemeToggle className="!h-10 !w-10" />
            <div className="mx-1 h-6 w-px bg-[var(--rule-base)]" aria-hidden />
            <PrimaryButton
              variant="ghost"
              size="md"
              onClick={handleLogin}
              aria-label={t("landing.nav.signin")}
            >
              {t("landing.nav.signin")}
            </PrimaryButton>
            <button
              type="button"
              onClick={handleSignup}
              aria-label={t("landing.nav.startStore")}
              className={cn(
                "group inline-flex items-center gap-2 h-10 px-5 rounded-full",
                "bg-[var(--accent-600,var(--accent))] text-white text-sm font-extrabold",
                "shadow-md",
                "hover:gap-3 hover:shadow-lg hover: hover:bg-[var(--accent)]/95",
                "active:scale-[0.98] transition-all duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
            >
              {t("landing.nav.startStore")}
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.75}
                aria-hidden
              />
            </button>
          </div>

          {/* ── Acciones mobile — Brandon 2026-05-20 v4 ─────────────────
              Antes: solo theme toggle + hamburger sueltos.
              Ahora: pill "Tiendas" (acceso 1-tap al catálogo, alta intención)
              + theme + hamburger, todos h-10 alineados en un cluster visual.
              El pill usa color accent suave para destacar como acción comercial
              sin competir con el CTA primario del hero. ── */}
          <div className="flex items-center gap-1.5 lg:hidden">
            {/* Pill "Tiendas" visible siempre en mobile (alta intención B2C).
                En viewport muy chico (<360px) podría apretar; el responsive
                `px-2.5 sm:px-3` lo mantiene tappable. */}
            <Link
              href="/tiendas"
              aria-label="Ver tiendas"
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full",
                "border-2 border-[var(--accent)]/30 bg-primary/10 px-2.5 sm:px-3",
                "text-[13px] sm:text-sm font-extrabold text-[var(--accent)] transition-all",
                "hover:border-[var(--accent)] hover:bg-primary/10",
                "active:scale-[0.97]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
            >
              <Store className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              Tiendas
            </Link>
            <ThemeToggle className="!h-10 !w-10" />
            <button
              type="button"
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-xl",
                "text-[var(--text-primary)] transition-all duration-200",
                "border-2",
                mobileOpen
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] scale-95"
                  : "border-transparent hover:border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileOpen}
              aria-controls="landing-mobile-sheet"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <span aria-hidden className="relative flex h-[14px] w-5 flex-col justify-between">
                <span
                  className={cn(
                    "block h-[2.5px] w-full rounded-full bg-current transition-all duration-200 origin-center",
                    mobileOpen ? "translate-y-[6px] rotate-45" : "",
                  )}
                />
                <span
                  className={cn(
                    "block h-[2.5px] w-full rounded-full bg-current transition-opacity duration-150",
                    mobileOpen ? "opacity-0" : "opacity-100",
                  )}
                />
                <span
                  className={cn(
                    "block h-[2.5px] w-3.5 rounded-full bg-current transition-all duration-200 origin-center ml-auto",
                    mobileOpen ? "-translate-y-[6px] -rotate-45 w-full" : "",
                  )}
                />
              </span>
            </button>
          </div>
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
  const { t } = useLocale();
  const links: readonly NavLink[] = NAV_LINK_DEFS.map((d) => ({
    id: d.id,
    label: t(d.tKey),
    href: d.href,
  }));
  return links.filter((l) => visibility[l.id] !== false);
}

// Brandon 2026-05-20 v4 — links extra en el MobileSheet.
// El sheet de mobile ahora muestra acciones B2C de alta intención que NO
// están en el nav principal desktop (Tiendas, Ofertas, Cómo pagar, Ayuda)
// porque ahí compiten visualmente con la jerarquía landing→conversion.
// En mobile el espacio vertical es generoso, los podemos incluir.
const MOBILE_EXTRA_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
  Icon: typeof Store;
}> = [
  { href: "/tiendas", label: "Tiendas", description: "Catálogo de bodegas", Icon: Store },
  { href: "/marketplace/ofertas", label: "Ofertas", description: "Promociones del día", Icon: Tag },
  { href: "/marketplace/como-pagar", label: "Cómo pagar", description: "Yape · Plin · efectivo", Icon: HelpCircle },
  { href: "/marketplace/repartidor", label: "Ser repartidor", description: "Generá ingresos extra", Icon: Bike },
];

// Iconos para los links principales del sheet (sincronizados con NAV_LINK_DEFS)
const MOBILE_NAV_ICONS: Record<string, typeof Store> = {
  inicio: Home,
  negocios: Building2,
  "abrir-tienda": Store,
};

function MobileSheet({
  open,
  onClose,
  pathname,
  onLogin,
  onSignup,
}: MobileSheetProps) {
  const visibleLinks = useVisibleLinks();
  // Escape key cierra el modal (a11y — WCAG 2.1.2 No Keyboard Trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel — Brandon 2026-05-20 v4 rediseñado:
          · header compacto (logo + close) sin el bloque decorativo gigante
            del mark 72px que desperdiciaba 200px de altura
          · nav con íconos en pills cuadrados — más jerarquía visual
          · sección "Para clientes" con accesos B2C que no caben en navbar
          · CTAs primario + secundario con ring de énfasis
          · footer WhatsApp solo (sin copyright, ruido removido) */}
      <aside
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(92vw,360px)] flex-col bg-[var(--surface-canvas)]",
          "border-l-2 border-[var(--rule-base)] shadow-2xl",
          "animate-in slide-in-from-right duration-250",
        )}
      >
        {/* Header sheet — más compacto */}
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-4 py-3 shrink-0">
          <Link
            href="/"
            onClick={onClose}
            aria-label="Buleje — Ir al inicio"
            className="flex items-center gap-2 text-[var(--text-primary)]"
          >
            <BulejeMark size={28} strokeWidth={1.75} className="text-[var(--accent)]" />
            <span
              id="landing-mobile-sheet-title"
              className="text-base font-extrabold tracking-tight"
            >
              Buleje
            </span>
          </Link>
          <button
            type="button"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl",
              "text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            )}
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        {/* Body scrollable: nav principal + acciones B2C */}
        <div className="flex-1 overflow-y-auto">
          {/* Nav principal con íconos */}
          <nav aria-label="Navegación principal mobile" className="px-3 pt-4 pb-2">
            <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
              Explorar
            </p>
            <ul className="flex flex-col gap-1">
              {visibleLinks.map((link) => {
                const active = isActiveLink(pathname, link.href);
                const Icon = MOBILE_NAV_ICONS[link.id] ?? Home;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={onClose}
                      className={cn(
                        "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-bold transition-all",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                        active
                          ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                          active
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                      </span>
                      <span>{link.label}</span>
                      {active && (
                        <span
                          aria-hidden
                          className="ml-auto inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Acciones B2C — no están en navbar landing pero tienen alta intención
              en mobile. Cada item es un row tipo lista con descripción corta */}
          <div className="px-3 pt-2 pb-4">
            <p className="px-3 mt-3 mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
              Para clientes
            </p>
            <ul className="flex flex-col gap-1">
              {MOBILE_EXTRA_LINKS.map(({ href, label, description, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
                      "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                    )}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
                      <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col leading-tight">
                      <span className="text-[15px] font-bold">{label}</span>
                      <span className="text-[12px] text-[var(--text-tertiary)] font-medium">
                        {description}
                      </span>
                    </span>
                    <ArrowRight
                      className="h-4 w-4 text-[var(--text-tertiary)] shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTAs sticky bottom + WhatsApp */}
        <div className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 px-3 py-3 shrink-0 space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignup();
            }}
            className={cn(
              "group inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl",
              "bg-[var(--accent-600,var(--accent))] text-white text-[15px] font-extrabold",
              "shadow-md",
              "active:scale-[0.98] transition-all",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            )}
          >
            <Store className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Empezar mi tienda
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.75}
              aria-hidden
            />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogin();
              }}
              className={cn(
                "flex-1 inline-flex items-center justify-center h-11 rounded-xl",
                "border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]",
                "text-[14px] font-bold text-[var(--text-primary)]",
                "hover:border-[var(--accent)]/40 active:scale-[0.98] transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
            >
              Ingresar
            </button>
            <a
              href="https://wa.me/51999999999"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-xl shrink-0",
                "border-2 border-[var(--data-success-500,var(--accent))]/30 bg-[var(--data-success-50,var(--accent-soft))]",
                "text-[var(--data-success-600,var(--accent))] hover:bg-[var(--data-success-100,var(--accent-soft))]/80",
                "active:scale-[0.97] transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              )}
              aria-label="Contáctanos por WhatsApp"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
