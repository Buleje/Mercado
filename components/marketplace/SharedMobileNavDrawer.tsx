"use client";

/**
 * SharedMobileNavDrawer — drawer mobile UNIFICADO de navegación marketplace.
 *
 * Brandon 2026-05-18: antes había 2 drawers distintos (uno en MarketplaceNavbar
 * para /tiendas y otro en StoreDetailClient para /marketplace/[slug]). Romper
 * la consistencia al saltar entre ambos rompía la confianza del usuario.
 * Ahora este componente único se usa en AMBOS lugares.
 *
 * Features:
 *  - Hero con identidad de usuario (logueado/anónimo).
 *  - Quick chips: carrito si itemCount > 0 + "Iniciar sesión" si anónimo.
 *  - Secciones: Mi cuenta · Explorar Buleje.
 *  - Grid 4-col "Explorar por rubro" con emoji para saltar a /tiendas?category=X.
 *  - WhatsApp soporte en sección Ayuda.
 *  - Footer CTA "Abrir tienda" → /negocios.
 *
 * UX: backdrop blur-md + slide-in-from-left-4 + rounded-r-3xl + max-w-340.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  X,
  Heart,
  UserCircle,
  Home as HomeIcon,
  Store as StoreIcon,
  Package,
  Tag,
  ArrowRight,
  ShoppingCart,
  MessageCircle,
  Building2,
  Rocket,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useCustomerAuthStatus } from "@/hooks/useCustomerAuthStatus";
import { useHasActiveOffers } from "@/hooks/use-active-offers";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

interface MarketplaceCategory {
  id: string;
  label: string;
  imageUrl: string | null;
}

/**
 * Brandon 2026-05-18: emoji fallback cuando una categoría todavía no tiene
 * imagen subida desde superadmin. Mejor que mostrar inicial sobre fondo
 * placeholder — la categoría se identifica al instante.
 */
const CATEGORY_EMOJI_FALLBACK: Record<string, string> = {
  restaurante: "🍽️",
  bodega:      "🥫",
  fruteria:    "🍎",
  farmacia:    "💊",
  ferreteria:  "🔧",
  polleria:    "🍗",
  panaderia:   "🥐",
  licoreria:   "🍷",
  carniceria:  "🥩",
  minimarket:  "🏪",
  tecnologia:  "📱",
};

export interface SharedMobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function SharedMobileNavDrawer({ open, onClose }: SharedMobileNavDrawerProps) {
  const { customer } = useCustomer();
  // Brandon 2026-05-18 v3: bug — el drawer mostraba "Iniciar sesión" aunque
  // el cliente ya estaba autenticado. `useCustomer()` lee localStorage y
  // puede estar desincronizado con la cookie httpOnly (fuente real de auth).
  // Ahora gateamos por `useCustomerAuthStatus()` (consulta server-side) y
  // usamos `useCustomer()` solo para el name/email del greeting.
  const { authenticated } = useCustomerAuthStatus();
  // Brandon 2026-05-18 v3: gateamos el link "Ofertas del día" — si no hay
  // ofertas activas en ningún tenant, el link no aparece (no prometemos
  // descuentos inexistentes).
  const hasActiveOffers = useHasActiveOffers();
  const { itemCount } = useMarketplaceCart();
  // Brandon 2026-05-30: en "modo tienda" (tiendas-only, el default del super-
  // admin) el drawer muestra SOLO las opciones de consumidor: Inicio · Tiendas
  // · Pedidos · Favoritos · Perfil · WhatsApp soporte. Se ocultan los bloques
  // B2B/descubrimiento (Para tu negocio, Explorar por rubro, Ofertas del día y
  // el CTA "Abrí tu tienda"). En full/minimo se mantiene la experiencia full.
  const navMode = useMarketplaceNavMode();
  const tiendasOnly = navMode === "tiendas-only";

  // Brandon 2026-05-18: rubros del marketplace SE FETCHEAN del backend
  // (las mismas que Brandon configura en /superadmin/marketplace > Categorías)
  // y se FILTRAN contra las tiendas reales — solo mostramos rubros que
  // tengan al menos 1 tienda asociada. Evita rubros muertos en el drawer.
  const [availableCategories, setAvailableCategories] = useState<MarketplaceCategory[]>([]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Fetch rubros + stores en paralelo, filtra solo los que tienen tiendas.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    Promise.all([
      fetch("/api/marketplace/categories", { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .catch(() => ({ categories: [] as MarketplaceCategory[] })),
      fetch("/api/marketplace/stores?limit=200", { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .catch(() => ({ stores: [] as Array<{ category?: string }> })),
    ])
      .then(([catRes, storeRes]) => {
        const baseList = (catRes?.categories ?? []) as MarketplaceCategory[];
        const storeList = (storeRes?.stores ?? storeRes?.data ?? []) as Array<{ category?: string | null }>;
        const storeCategoryIds = new Set(
          storeList.map((s) => s.category).filter((c): c is string => typeof c === "string"),
        );
        const filtered = baseList.filter((c) => storeCategoryIds.has(c.id));
        setAvailableCategories(filtered);
      })
      .catch(() => {
        // Silent fail — la sección simplemente no aparece
      });
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  // Brandon 2026-05-18 v3: isLoggedIn ahora es la verdad del servidor (cookie
  // httpOnly), NO localStorage. Mientras `authenticated === null` (cargando)
  // tratamos como "anónimo en proceso" para no parpadear; el render real se
  // ajusta apenas la respuesta de /api/customer/me llega.
  const isLoggedIn = authenticated === true;
  const greetingName =
    customer?.name?.split(" ")[0] ??
    customer?.email?.split("@")[0] ??
    "vecino";

  const SECTIONS: Array<{
    title: string;
    links: Array<{
      href: string;
      label: string;
      desc?: string;
      Icon: typeof HomeIcon;
      badge?: number | string;
    }>;
  }> = [
    {
      title: "Mi cuenta",
      links: [
        { href: "/marketplace/mi-cuenta/pedidos", label: "Mis pedidos", desc: "Historial y tracking", Icon: Package },
        { href: "/marketplace/mi-cuenta/favoritos", label: "Favoritos", desc: "Tiendas y productos guardados", Icon: Heart },
        { href: "/marketplace/mi-cuenta", label: "Perfil", desc: "Datos, direcciones, cupones", Icon: UserCircle },
      ],
    },
    {
      title: "Explorar Buleje",
      links: [
        { href: "/", label: "Inicio", Icon: HomeIcon },
        { href: "/tiendas", label: "Todas las tiendas", Icon: StoreIcon },
        // Brandon 2026-05-18 v3: "Ofertas del día" solo si hay activas.
        // 2026-05-30: y nunca en modo tienda (tiendas-only).
        ...(!tiendasOnly && hasActiveOffers === true
          ? [{ href: "/marketplace/ofertas", label: "Ofertas del día", Icon: Tag }]
          : []),
      ],
    },
    // "Para tu negocio" (B2B) solo fuera de modo tienda.
    ...(!tiendasOnly
      ? [
          {
            title: "Para tu negocio",
            links: [
              { href: "/negocios", label: "Negocios", desc: "Software para bodegas", Icon: Building2 },
              { href: "/abrir-tienda", label: "Abre tu Tienda", desc: "Planes y beneficios", Icon: Rocket },
            ],
          },
        ]
      : []),
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menú de navegación"
      className="lg:hidden fixed inset-0 z-[60] flex"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar menú"
        className="absolute inset-0 bg-black/65 backdrop-blur-md animate-in fade-in-0 duration-200"
      />
      <aside className="relative flex flex-col w-full max-w-[340px] h-full bg-[var(--surface-canvas)] shadow-2xl rounded-r-3xl overflow-hidden animate-in slide-in-from-left-4 duration-300">
        {/* Hero con identidad de usuario */}
        <div className="relative overflow-hidden bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white px-5 pt-6 pb-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-white/12 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-12 h-32 w-32 rounded-full bg-white/8 blur-2xl"
          />
          <div className="relative">
            {/* Fila superior: marca + cerrar */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 h-7 pl-1.5 pr-3 rounded-full bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white text-[var(--accent)] text-[10px] font-black leading-none">
                  b
                </span>
                <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white leading-none">
                  Buleje
                </span>
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar menú"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 active:scale-95 transition-all shrink-0 ring-1 ring-white/15"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Identidad: avatar (inicial logueado / icono anónimo) + saludo */}
            <div className="flex items-center gap-3 mb-4">
              <span
                aria-hidden
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm shadow-inner"
              >
                {isLoggedIn ? (
                  <span className="text-2xl font-black text-white leading-none uppercase">
                    {greetingName.charAt(0)}
                  </span>
                ) : (
                  <UserCircle className="h-8 w-8 text-white" strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {isLoggedIn ? (
                  <>
                    <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/70 leading-tight mb-0.5">
                      Hola de nuevo
                    </p>
                    <p className="text-xl font-black tracking-tight leading-tight truncate capitalize">
                      {greetingName}
                    </p>
                    <p className="text-[length:var(--ts-xs)] font-bold text-white/80 leading-tight mt-0.5 truncate">
                      {customer?.email}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/70 leading-tight mb-0.5">
                      Bienvenido a Buleje
                    </p>
                    <p className="text-xl font-black tracking-tight leading-tight">
                      Tu barrio, a domicilio
                    </p>
                    <p className="text-[length:var(--ts-xs)] font-bold text-white/80 leading-tight mt-0.5">
                      Iniciá sesión para ver tus pedidos
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {itemCount > 0 && (
                <Link
                  href="/marketplace/carrito"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white text-[var(--accent)] text-[length:var(--ts-xs)] font-black tabular-nums active:scale-95 transition-transform shadow-md"
                >
                  <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2.75} />
                  {itemCount} en carrito
                  <ArrowRight className="h-3 w-3" strokeWidth={2.75} />
                </Link>
              )}
              {!isLoggedIn && (
                <Link
                  href="/marketplace/mi-cuenta"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white text-[var(--accent)] text-[length:var(--ts-xs)] font-black active:scale-95 transition-transform shadow-md"
                >
                  Iniciar sesión
                  <ArrowRight className="h-3 w-3" strokeWidth={2.75} />
                </Link>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Navegación principal">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="px-2 mb-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.links.map(({ href, label, desc, Icon, badge }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className="group flex items-center gap-3 rounded-2xl p-2.5 hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white transition-colors shrink-0"
                    >
                      <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                        {label}
                      </p>
                      {desc && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight mt-0.5 font-medium">
                          {desc}
                        </p>
                      )}
                    </div>
                    {badge !== undefined && (
                      <span className="shrink-0 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--accent)] px-2 text-[length:var(--ts-2xs)] font-black text-white tabular-nums">
                        {badge}
                      </span>
                    )}
                    <ArrowRight
                      className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0"
                      strokeWidth={2.25}
                    />
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* Brandon 2026-05-18: Categorías base del marketplace
              (gestionadas desde superadmin/marketplace > Categorías).
              Solo muestran las que tienen ≥1 tienda real asociada — evita
              rubros muertos. La imagen viene del superadmin; si todavía no
              tiene foto subida, usa emoji fallback para identificación visual. */}
          {!tiendasOnly && availableCategories.length > 0 && (
            <div>
              <p className="px-2 mb-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Explorar por rubro
              </p>
              <div className="grid grid-cols-4 gap-2">
                {availableCategories.map((cat) => {
                  const emoji = CATEGORY_EMOJI_FALLBACK[cat.id] ?? "🏪";
                  return (
                    <Link
                      key={cat.id}
                      href={`/tiendas?category=${cat.id}`}
                      onClick={onClose}
                      className="group flex flex-col items-center gap-1.5 rounded-2xl p-2.5 bg-[var(--surface-sunken)] border border-[var(--rule-soft)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 active:scale-95 transition-all"
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-base)] overflow-hidden group-hover:scale-110 transition-transform shrink-0"
                      >
                        {cat.imageUrl ? (
                          <Image
                            src={cat.imageUrl}
                            alt=""
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-2xl">{emoji}</span>
                        )}
                      </span>
                      <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-primary)] leading-tight text-center truncate w-full">
                        {cat.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ayuda */}
          <div>
            <p className="px-2 mb-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Ayuda
            </p>
            <a
              href="https://wa.me/51999999999?text=Hola%2C%20necesito%20ayuda%20con%20Buleje"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="group flex items-center gap-3 rounded-2xl p-2.5 hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all"
            >
              <span
                aria-hidden
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366] group-hover:bg-[#25D366] group-hover:text-white transition-colors shrink-0"
              >
                <MessageCircle className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                  WhatsApp soporte
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight mt-0.5 font-medium">
                  Te respondemos en menos de 10 min
                </p>
              </div>
              <ArrowRight
                className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] shrink-0"
                strokeWidth={2.25}
              />
            </a>
          </div>
        </nav>

        {/* CTA B2B "Abrí tu tienda" — oculto en modo tienda (tiendas-only). */}
        {!tiendasOnly && (
          <div className="border-t border-[var(--rule-base)] p-4">
            <Link
              href="/negocios"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-extrabold hover:bg-[var(--text-primary)]/90 active:scale-95 transition-all shadow-lg"
            >
              ¿Tenés una tienda? Abrila acá
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
