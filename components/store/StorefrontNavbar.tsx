"use client";

/**
 * StorefrontNavbar — barra superior de la TIENDA INDIVIDUAL (subdominio / `/t/<slug>`).
 *
 * Brandon 2026-06-07/08: SOLO dos enlaces (Inicio + Catálogo) + un buscador
 * + carrito. Cero links/buscador/sub-nav del marketplace. Es el ÚNICO nav de
 * la tienda — se usa tanto en el catálogo (vía `(store)` layout) como en la
 * landing `/t/<slug>`.
 *
 * Dos modos según el contexto:
 *  - **Chrome `(store)`** (catálogo, subdominio): props por defecto → enlaces
 *    relativos (`/`, `/tienda`) y carrito VIVO (`useCart` + abre el drawer).
 *  - **Landing `/t/<slug>`** (fuera del chrome `(store)`, sin CartProvider):
 *    se pasan `homeHref`/`catalogHref`/`searchHref` tenant-aware y un `cartHref`
 *    → el carrito se vuelve un enlace al catálogo (no usa el CartProvider).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Search, ShoppingCart, User, Package, Sparkles, Gift, Bell, ChevronDown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/cart-context";
import OAuthButton from "@/components/auth/OAuthButton";

interface StorefrontNavbarProps {
  name: string;
  logo?: string | null;
  /** Inicio de la tienda. Default `/` (subdominio/cookie). Landing → `/t/<slug>`. */
  homeHref?: string;
  /** Catálogo. Default `/tienda`. Landing → `/t/<slug>/tienda`. */
  catalogHref?: string;
  /** Buscador (lleva al catálogo). Default `/tienda#productos`. */
  searchHref?: string;
  /**
   * Si se pasa, el carrito se renderiza como ENLACE a esta URL sin usar el
   * CartProvider — para páginas fuera del chrome `(store)` (ej. la landing
   * `/t/<slug>`, que no monta StoreProviders). Si se omite → carrito vivo.
   */
  cartHref?: string;
  /** Lote E (Brandon 2026-06-27): color de fondo del navbar (vacío = superficie). */
  bgColor?: string;
  /** Color de texto del navbar (vacío = tokens). Cascada a los enlaces vía vars. */
  textColor?: string;
}

export default function StorefrontNavbar({
  name,
  logo,
  homeHref,
  catalogHref,
  searchHref,
  cartHref,
  bgColor,
  textColor,
}: StorefrontNavbarProps) {
  const initial = (name?.trim()?.charAt(0) || "T").toUpperCase();
  const pathname = usePathname() ?? "";

  // Las DOS páginas /t del negocio: Inicio (landing con la info) y Catálogo.
  // Si la URL es /t/<slug>/* (tienda individual por path) derivamos la base
  // del propio pathname → ambos enlaces apuntan a /t/<slug> y /t/<slug>/tienda.
  // En subdominio (sin prefijo /t) caemos a "/" y "/tienda". Los props
  // explícitos (la landing) siempre ganan.
  const tBase = pathname.match(/^\/t\/[^/]+/)?.[0] ?? "";
  const home = homeHref ?? (tBase || "/");
  const catalog = catalogHref ?? `${tBase}/tienda`;
  const search = searchHref ?? `${tBase}/tienda#productos`;

  // Activo en catálogo: cubre tanto `/tienda` como `/t/<slug>/tienda`.
  const onCatalog = pathname.includes("/tienda");

  const linkCls = (active: boolean) =>
    cn(
      "relative inline-flex items-center whitespace-nowrap px-2 py-1.5 text-sm font-bold transition-colors",
      active
        ? "text-[var(--text-primary)] after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:bg-[var(--accent)]"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
    );

  // Lote E: override de color de navbar. textColor cascada vía --text-* a los
  // enlaces (usan text-[var(--text-primary/secondary)]).
  const navStyle: React.CSSProperties | undefined = (bgColor || textColor)
    ? {
        ...(bgColor ? { background: bgColor } : {}),
        ...(textColor ? ({ "--text-primary": textColor, "--text-secondary": textColor } as React.CSSProperties) : {}),
      }
    : undefined;

  return (
    <header className={cn("sticky top-0 z-50 border-b border-[var(--rule-soft)]", !bgColor && "bg-[var(--surface-raised)]")} style={navStyle}>
      <div className="mx-auto flex h-14 md:h-16 max-w-[1280px] items-center gap-2 sm:gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo de la tienda → inicio */}
        <Link href={home} aria-label={`${name} — inicio`} className="flex shrink-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-sunken)] text-sm font-black text-[var(--text-secondary)]">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar simple
              <img src={logo} alt="" className="h-full w-full object-cover" loading="eager" />
            ) : (
              initial
            )}
          </span>
          <span data-live="storeName" className="hidden max-w-[160px] truncate text-base font-extrabold tracking-tight text-[var(--text-primary)] md:inline">
            {name}
          </span>
        </Link>

        {/* Los DOS únicos enlaces: Inicio + Catálogo */}
        <nav aria-label="Navegación de la tienda" className="flex shrink-0 items-center gap-0.5">
          <Link href={home} aria-current={!onCatalog ? "page" : undefined} className={linkCls(!onCatalog)}>
            Inicio
          </Link>
          <Link href={catalog} aria-current={onCatalog ? "page" : undefined} className={linkCls(onCatalog)}>
            Catálogo
          </Link>
        </nav>

        {/* Buscador de la tienda — barra estilo input que lleva al catálogo
            (donde vive el buscador real). */}
        <Link
          href={search}
          aria-label="Buscar productos en la tienda"
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-[var(--text-tertiary)] transition-colors hover:border-[var(--text-primary)]/30"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="truncate text-sm font-medium">Buscar productos…</span>
        </Link>

        {/* Carrito — vivo (drawer) dentro del chrome (store); enlace al catálogo
            en la landing (donde no hay CartProvider). */}
        {cartHref ? (
          <Link
            href={cartHref}
            aria-label="Ver carrito en el catálogo"
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ShoppingCart className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        ) : (
          <LiveCartButton />
        )}

        {/* Notificaciones — icono de campana + dropdown con los avisos de esta
            tienda individual (Brandon 2026-06-27). */}
        <NotifMenu base={tBase} />

        {/* Menú de usuario: cuenta, pedidos, puntos, cupones, notificaciones.
            Enlaces planos (sin CustomerProvider) → funciona en la landing y en
            el catálogo. Brandon 2026-06-22: "como lo tenía antes". */}
        <AccountMenu base={tBase} />
      </div>
    </header>
  );
}

/**
 * AccountMenu — dropdown con las funciones del cliente (cuenta, pedidos, puntos…).
 * Usa enlaces directos a las rutas del cliente, prefijadas con la base del tenant
 * (`/t/<slug>` por path, o "" en subdominio). Cierra con click-fuera + Escape.
 */
function AccountMenu({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { href: `${base}/cuenta`, label: "Mi cuenta", Icon: User },
    { href: `${base}/mis-pedidos`, label: "Mis pedidos", Icon: Package },
    { href: `${base}/puntos`, label: "Mis puntos", Icon: Sparkles },
    { href: `${base}/cuenta/cupones`, label: "Cupones", Icon: Gift },
    { href: `${base}/cuenta/notificaciones`, label: "Notificaciones", Icon: Bell },
  ];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mi cuenta"
        className="inline-flex h-10 items-center gap-1 rounded-full px-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-sunken)]">
          <User className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <ChevronDown
          className={cn("hidden h-4 w-4 text-[var(--text-tertiary)] transition-transform sm:block", open && "rotate-180")}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Funciones de tu cuenta"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 shadow-[var(--shadow-xl)]"
        >
          <p className="px-4 pb-1 pt-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Tu cuenta
          </p>
          {items.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
              {label}
            </Link>
          ))}
          {/* Iniciar sesión con Google (Brandon 2026-06-27) — OAuth Supabase. */}
          <div className="mt-1 border-t border-[var(--rule-soft)] px-3 pb-1 pt-2.5">
            <p className="pb-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              ¿No iniciaste sesión?
            </p>
            <OAuthButton provider="google" redirectTo={`${base}/cuenta`} />
          </div>
        </div>
      )}
    </div>
  );
}

type NotifItem = {
  id: string;
  title: string;
  message?: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
};

/**
 * NotifMenu — campana + dropdown con las notificaciones del cliente para esta
 * tienda. Fetch a /api/me/notifications (requireCustomer) al abrir; sin sesión de
 * cliente muestra estado vacío honesto. Cierra con click-fuera + Escape.
 */
function NotifMenu({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    const ctrl = new AbortController();
    fetch("/api/me/notifications", { credentials: "include", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.notifications) ? (data.notifications as NotifItem[]) : [];
        setNotifs(list);
        setUnread(typeof data?.unreadCount === "number" ? data.unreadCount : list.filter((n) => !n.read).length);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.warn("[nav/notif] no se pudo cargar las notificaciones", err);
        }
      })
      .finally(() => { setLoading(false); setLoaded(true); });
    return () => ctrl.abort();
  }, [open, loaded]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notificaciones — ${unread} sin leer` : "Notificaciones"}
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-raised)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notificaciones"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-4 py-2.5">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">Notificaciones</p>
            <Link
              href={`${base}/cuenta/notificaciones`}
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
                ))}
              </div>
            ) : notifs.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-7 w-7 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">Sin notificaciones</p>
                <p className="text-xs text-[var(--text-tertiary)]">Acá verás avisos de tus pedidos y ofertas.</p>
              </div>
            ) : (
              notifs.slice(0, 6).map((n) => (
                <Link
                  key={n.id}
                  href={n.link || `${base}/cuenta/notificaciones`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-[var(--rule-base)]" : "bg-[var(--accent)]")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", n.read ? "font-semibold text-[var(--text-secondary)]" : "font-extrabold text-[var(--text-primary)]")}>
                      {n.title}
                    </span>
                    {n.message && (
                      <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">{n.message}</span>
                    )}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Botón de carrito VIVO — aislado en su propio componente para que `useCart`
 * (que exige CartProvider) solo se llame cuando realmente montamos el carrito
 * vivo. En la landing no se renderiza → no se necesita el provider.
 */
function LiveCartButton() {
  const { items, open: openCart } = useCart();
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`Carrito — ${count} ${count === 1 ? "producto" : "productos"}`}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <ShoppingCart className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-raised)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
