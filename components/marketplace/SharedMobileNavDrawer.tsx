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

  // Brandon 2026-05-30: transición limpia de ENTRADA y SALIDA. Antes el drawer
  // hacía `return null` al cerrar → desaparecía de golpe (sin animación de
  // salida) y el slide de entrada era de apenas 1rem. Ahora:
  //  - `render` mantiene el nodo montado durante la animación de salida.
  //  - `visible` dispara el slide completo (translate-x-full → 0) + fade del
  //    backdrop. Doble rAF para que el navegador pinte el estado inicial antes
  //    de animar (sino el transition no corre). Easing iOS-like (suave).
  const [render, setRender] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setRender(false), 320);
    return () => clearTimeout(t);
  }, [open]);

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
  // Brandon 2026-05-31: antes usaba Promise.reject() sin argumento en el `.then`
  // y un `.catch` por fetch. Al cerrar el drawer, controller.abort() interrumpía
  // el `r.json()` en vuelo → la rejección AbortError se escapaba como
  // "Uncaught (in promise) AbortError: signal is aborted without reason".
  // Fix: helper safeFetch que traga SIEMPRE (devuelve fallback, nunca rechaza)
  // + flag cancelled + guard de signal.aborted antes del setState.
  // Brandon 2026-05-31: SIN AbortController. Abortar mientras `r.json()` lee el
  // body produce un rejection interno del stream (Chromium) que escapa al catch
  // → "Uncaught (in promise) AbortError". Es un fetch fire-and-forget barato:
  // dejamos que termine e ignoramos el resultado si el drawer ya se cerró.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function safeFetch<T>(url: string, fallback: T): Promise<T> {
      try {
        const r = await fetch(url);
        if (!r.ok) return fallback;
        return (await r.json()) as T;
      } catch {
        return fallback; // red caída → fallback silencioso
      }
    }

    (async () => {
      const [catRes, storeRes] = await Promise.all([
        safeFetch<{ categories?: MarketplaceCategory[] }>(
          "/api/marketplace/categories",
          { categories: [] },
        ),
        safeFetch<{ stores?: Array<{ category?: string | null }>; data?: Array<{ category?: string | null }> }>(
          "/api/marketplace/stores?limit=100",
          { stores: [] },
        ),
      ]);
      // No tocar el state si el drawer se cerró/desmontó mientras esperábamos.
      if (cancelled) return;
      const baseList = catRes?.categories ?? [];
      const storeList = storeRes?.stores ?? storeRes?.data ?? [];
      const storeCategoryIds = new Set(
        storeList.map((s) => s.category).filter((c): c is string => typeof c === "string"),
      );
      setAvailableCategories(baseList.filter((c) => storeCategoryIds.has(c.id)));
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!render) return null;

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
    // Brandon 2026-05-30: "Explorar Buleje" PRIMERO (navegación principal del
    // consumidor), "Mi cuenta" debajo. La grilla "Categorías" va después (abajo).
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
    {
      title: "Mi cuenta",
      links: [
        { href: "/marketplace/mi-cuenta/pedidos", label: "Mis pedidos", desc: "Historial y tracking", Icon: Package },
        { href: "/marketplace/mi-cuenta/favoritos", label: "Favoritos", desc: "Tiendas y productos guardados", Icon: Heart },
        { href: "/marketplace/mi-cuenta", label: "Perfil", desc: "Datos, direcciones, cupones", Icon: UserCircle },
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
        className={`absolute inset-0 bg-black/65 backdrop-blur-md transition-opacity duration-300 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`relative flex flex-col w-full max-w-[330px] h-full bg-[var(--surface-canvas)] shadow-2xl overflow-hidden will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* ── Header minimalista (Brandon 2026-05-31 rediseño) ──
            Antes: bloque accent saturado con gradiente + 2 blur blobs + chips +
            descripciones. Ahora: header limpio sobre surface — avatar accent
            contenido + saludo + cerrar. El color vive solo en el avatar; la
            identidad respira. */}
        <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5 border-b border-[var(--rule-soft)]">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"
          >
            {isLoggedIn ? (
              <span className="text-lg font-black leading-none uppercase">
                {greetingName.charAt(0)}
              </span>
            ) : (
              <UserCircle className="h-6 w-6" strokeWidth={2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {isLoggedIn ? (
              <>
                <p className="text-base font-black tracking-tight leading-tight text-[var(--text-primary)] truncate capitalize">
                  {greetingName}
                </p>
                <p className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] leading-tight truncate">
                  {customer?.email ?? "Mi cuenta Buleje"}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-black tracking-tight leading-tight text-[var(--text-primary)]">
                  Tu barrio, a domicilio
                </p>
                <Link
                  href="/marketplace/mi-cuenta"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] leading-tight hover:gap-1.5 transition-all"
                >
                  Iniciar sesión
                  <ArrowRight className="h-3 w-3" strokeWidth={2.75} />
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all shrink-0"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        {/* Carrito activo — banda accent solo si hay items (acción contextual) */}
        {itemCount > 0 && (
          <Link
            href="/marketplace/carrito"
            onClick={onClose}
            className="flex items-center gap-2.5 mx-3 mt-3 rounded-2xl bg-[var(--accent)] px-3.5 h-12 text-white active:scale-[0.98] transition-transform"
          >
            <ShoppingCart className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
            <span className="flex-1 text-[length:var(--ts-sm)] font-extrabold leading-tight">
              Ver mi carrito
            </span>
            <span className="inline-flex items-center justify-center rounded-full bg-white/20 px-2 h-6 text-[length:var(--ts-xs)] font-black tabular-nums">
              {itemCount}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          </Link>
        )}

        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-4" aria-label="Navegación principal">
          {SECTIONS.map((section, si) => (
            <div key={section.title}>
              {/* Primera sección sin label (navegación primaria); el resto con
                  eyebrow sutil. Menos texto = más limpio. */}
              {si > 0 && (
                <p className="px-3 mb-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.links.map(({ href, label, Icon, badge }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className="group flex items-center gap-3 rounded-xl px-3 h-12 hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all"
                  >
                    <Icon
                      className="h-5 w-5 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors shrink-0"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="flex-1 min-w-0 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                      {label}
                    </span>
                    {badge !== undefined && (
                      <span className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[length:var(--ts-2xs)] font-black text-white tabular-nums">
                        {badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* ── Categorías ── Brandon 2026-05-30: visible SIEMPRE (también en
              modo tienda — filtrar por rubro es navegación de consumidor). Cada
              tile lleva a /tiendas?cat=<id> YA FILTRADO. Solo rubros con ≥1
              tienda real. Brandon 2026-05-31: rediseño minimalista — chips
              horizontales (icono + label) 2-col en vez de grid de tiles altos. */}
          {availableCategories.length > 0 && (
            <div>
              <p className="px-3 mb-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Categorías
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {availableCategories.map((cat) => {
                  const emoji = CATEGORY_EMOJI_FALLBACK[cat.id] ?? "🏪";
                  return (
                    <Link
                      key={cat.id}
                      href={`/tiendas?cat=${encodeURIComponent(cat.id)}`}
                      onClick={onClose}
                      aria-label={`Ver tiendas de ${cat.label}`}
                      className="group flex items-center gap-2.5 rounded-xl px-2.5 h-12 bg-[var(--surface-sunken)] hover:bg-[var(--accent-soft)]/50 active:scale-[0.97] transition-all"
                    >
                      <span
                        aria-hidden
                        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-canvas)] overflow-hidden shrink-0"
                      >
                        {cat.imageUrl ? (
                          <Image
                            src={cat.imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-base">{emoji}</span>
                        )}
                      </span>
                      <span className="flex-1 min-w-0 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] leading-tight truncate group-hover:text-[var(--accent)] transition-colors">
                        {cat.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ayuda — WhatsApp soporte (fila limpia, sin caja de icono pesada) */}
          <div>
            <p className="px-3 mb-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Ayuda
            </p>
            <a
              href="https://wa.me/51999999999?text=Hola%2C%20necesito%20ayuda%20con%20Buleje"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="group flex items-center gap-3 rounded-xl px-3 h-12 hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all"
            >
              <MessageCircle className="h-5 w-5 text-[#25D366] shrink-0" strokeWidth={2} aria-hidden />
              <span className="flex-1 min-w-0 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                WhatsApp soporte
              </span>
              <ArrowRight
                className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0"
                strokeWidth={2.25}
              />
            </a>
          </div>
        </nav>

        {/* CTA B2B "Abrí tu tienda" — oculto en modo tienda (tiendas-only).
            Ghost/outline (menos peso visual que el botón sólido anterior). */}
        {!tiendasOnly && (
          <div className="border-t border-[var(--rule-soft)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link
              href="/negocios"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border border-[var(--rule-base)] text-[var(--text-primary)] text-[length:var(--ts-sm)] font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-[0.98] transition-all"
            >
              <Rocket className="h-4 w-4" strokeWidth={2} aria-hidden />
              Abrí tu tienda
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
