"use client";

/**
 * StoreDetailClient — Orchestrator de /marketplace/[slug].
 *
 * Layout:
 *   Breadcrumb
 *   StoreHero (kicker + h1 + stats + CTAs + ilustración)
 *   StoreAbout + StoreInfoCard (2 col)
 *   StoreCategories (chips)
 *   StoreCatalog (grid filtrable)
 *   StoreReviews
 *   StorePoliciesBlock
 *   FinalCTA
 *
 * El estado `activeCategory` se eleva aquí para conectar
 * StoreCategories → StoreCatalog sin setState en useEffect.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, Menu, LayoutGrid, List, Heart, Info,
  MapPin, Clock, Wallet, Phone, UserCircle,
  Home as HomeIcon, Store as StoreIcon, Package, Tag, ArrowRight,
} from "@buleje/design-system/icons";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import { cn } from "@/lib/utils";
import StoreBannerArea from "./StoreBannerArea";
import StoreHero from "./StoreHero";
import StorePromoBannersStrip from "./StorePromoBannersStrip";
import { type StoreCategoryChip } from "./StoreCategories";
import StoreCategoriesSidebar from "./StoreCategoriesSidebar";
import StoreCatalog, { slugifyCat } from "./StoreCatalog";
import StoreReviews from "./StoreReviews";
import StorePoliciesBlock from "./StorePoliciesBlock";
import ClosedNowBanner from "./ClosedNowBanner";
import { getStoreTagline } from "@/lib/store-tagline";
import type { DbStore, DbStoreProduct } from "@/lib/db/marketplace.db";
import type {
  MockStoreReview,
  MockStoreRatingSummary,
} from "@/lib/mock-store-reviews";

interface StoreDetailClientProps {
  store: DbStore;
  products: DbStoreProduct[];
  categories: StoreCategoryChip[];
  reviewSummary: MockStoreRatingSummary;
  reviews: MockStoreReview[];
  /** Calculado server-side desde openHours; default true si null. */
  isOpen?: boolean;
  /** Métodos de pago expuestos por la tienda. Por ahora yape+efectivo. */
  paymentMethods?: string[];
  /** Mapa name → URL imagen (resolved server-side: per-store > global) */
  categoryImages?: Record<string, string>;
  /** Horario configurado por el dueño (jsonb). Para mostrar en el banner cerrado. */
  hoursJson?: unknown;
  /** ISO timestamp de la próxima apertura — derivado server-side. */
  nextOpeningAt?: string | null;
}

export default function StoreDetailClient({
  store,
  products,
  categories,
  reviewSummary,
  reviews,
  isOpen = true,
  paymentMethods = ["yape", "efectivo"],
  categoryImages,
  hoursJson,
  nextOpeningAt,
}: StoreDetailClientProps) {
  // Brandon mayo 14 v5: 2 estados separados (patrón Rappi):
  //   - activeCategory: SOLO visual (subnav + scrollspy). NO filtra.
  //   - filterCategory: filtro REAL del catálogo. Solo se setea desde
  //     la sidebar desktop o el drawer mobile cuando el cliente quiere
  //     ver SOLO una categoría aislada.
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  // Brandon mayo 14 v6: hamburguesa abre menú de NAVEGACIÓN general
  // (Inicio, Tiendas, Mi cuenta, etc), NO el drawer de categorías.
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");

  // Cierra el drawer mobile cuando seleccionan una categoría desde el
  // drawer/sidebar — SÍ filtra (uso explícito del filtro).
  const handleCategorySelect = useCallback((cat: string | null) => {
    setFilterCategory(cat);
    setActiveCategory(cat);
    setMobileCatOpen(false);
  }, []);

  // Sugerencias rápidas: matchea nombre, categoría
  const suggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    const results: { type: "product" | "category"; label: string; value: string }[] = [];
    // Categorías que matcheen
    for (const c of categories) {
      if (c.name.toLowerCase().includes(q) && !seen.has(`cat:${c.name}`)) {
        results.push({ type: "category", label: c.name, value: c.name });
        seen.add(`cat:${c.name}`);
      }
    }
    // Productos que matcheen
    for (const p of products) {
      if (p.productName.toLowerCase().includes(q) && !seen.has(`prod:${p.productName}`)) {
        results.push({ type: "product", label: p.productName, value: p.productName });
        seen.add(`prod:${p.productName}`);
        if (results.length >= 8) break;
      }
    }
    return results.slice(0, 8);
  }, [searchTerm, categories, products]);

  // Detección de sticky scroll: cuando el sentinel sale del viewport,
  // el bar de categorías está pegado al top y rendea en modo `compact`.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // ── Scrollspy: detecta qué categoría está visible y actualiza activeCategory
  // Brandon mayo 14 v5: al scrollear el catálogo, el subnav resalta la
  // categoría activa automáticamente (patrón Rappi/iFood). El click en
  // un pill solo hace scroll smooth — NO filtra. El observer se encarga
  // del resto.
  const subnavScrollRef = useRef<HTMLDivElement | null>(null);
  // `scrollSpyEnabled` se apaga brevemente cuando el usuario hace tap en
  // un pill (para evitar conflicto entre scroll programático y el observer).
  const scrollSpyEnabledRef = useRef(true);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (categories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!scrollSpyEnabledRef.current) return;
        // Encuentra la sección más cercana al top que está cruzando.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          // PENTEST 2026-05-18 Fase 3 P1 #33: lee el nombre real desde
          // data-cat-name. Antes parseaba id quitando el prefijo "cat-",
          // pero el id ahora es un slug (cat-pollo-a-la-brasa) — el slug
          // NO matchea el nombre original ("Pollo a la Brasa") en el state.
          const catName =
            (visible.target as HTMLElement).getAttribute("data-cat-name") ??
            visible.target.id.replace(/^cat-/, "");
          if (catName) setActiveCategory(catName);
        }
      },
      {
        // rootMargin negativo top = ignora lo que está debajo de la zona
        // sticky (56 nav v6 + 56 slim + 56 subnav = ~170px). Negativo bottom
        // = ignora lo de muy abajo. Trigger cuando la sección cruza la
        // zona hot del viewport.
        rootMargin: "-170px 0px -55% 0px",
        threshold: 0,
      },
    );

    // Espera al render del catálogo antes de observar
    const t = setTimeout(() => {
      const sections = document.querySelectorAll('[id^="cat-"]');
      sections.forEach((s) => observer.observe(s));
    }, 300);

    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [categories.length]);

  // Auto-centrar el pill activo en el subnav horizontal
  useEffect(() => {
    if (!activeCategory || !subnavScrollRef.current) return;
    const container = subnavScrollRef.current;
    const activeBtn = container.querySelector<HTMLButtonElement>(
      `[data-cat="${CSS.escape(activeCategory)}"]`,
    );
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const offset = btnRect.left - containerRect.left;
    const targetScrollLeft =
      container.scrollLeft + offset - containerRect.width / 2 + btnRect.width / 2;
    container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
  }, [activeCategory]);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── MOBILE: Top FIJO nav v6 (Brandon 2026-05-18 — rediseño) ─────
           Cambios vs v5:
           - bg + backdrop-blur para cohesion con BottomNav (color-mix tokens)
           - Hamburger + search compact (sin logo dentro: duplica con slim bar) +
             icono cuenta + cart badge.
           - Search se reduce: solo icono + texto sutil "Buscar productos".
             El logo + nombre de la tienda viven en el slim bar de abajo,
             evitando redundancia que saturaba la barra.
           - Iconos h-10 (antes h-11) para tighter look premium. */}
      <div
        className={cn(
          "lg:hidden fixed inset-x-0 top-0 z-50",
          "border-b border-[var(--rule-base)]",
          "bg-[color-mix(in_oklab,var(--surface-canvas)_88%,transparent)]",
          "supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--surface-canvas)_70%,transparent)]",
          "supports-[backdrop-filter]:backdrop-blur-xl",
          "supports-[backdrop-filter]:backdrop-saturate-150",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Hamburguesa de navegación → drawer global (Inicio, Tiendas, etc) */}
          <button
            type="button"
            onClick={() => setNavDrawerOpen(true)}
            aria-label="Menú de navegación"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
          >
            <Menu className="h-5 w-5" strokeWidth={2.25} />
          </button>

          {/* Buscar — sin logo dentro (duplicado con slim bar abajo).
              Compact: icono + texto sutil, tap abre overlay full-screen. */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            aria-label={`Buscar en ${store.name}`}
            className="flex-1 inline-flex items-center gap-2 h-10 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)]/80 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] transition-colors min-w-0 text-left px-3.5"
          >
            <Search
              className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-tertiary)] truncate">
              Buscar productos
            </span>
          </button>

          {/* Icono cuenta usuario */}
          <Link
            href="/marketplace/mi-cuenta"
            aria-label="Mi cuenta"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)] transition-colors shrink-0"
          >
            <UserCircle className="h-5 w-5" strokeWidth={1.75} />
          </Link>

          {/* Carrito compacto — solo cantidad (sin precio) */}
          <CartBadge
            compact
            onClick={() => {
              window.dispatchEvent(new CustomEvent("marketplace-cart:open"));
            }}
          />
        </div>
      </div>

      {/* Spacer para compensar el fixed top nav (h-[56px] post-rediseño) */}
      <div className="lg:hidden h-[56px]" aria-hidden />

      {/* ── Banner cerrado (justo después del spacer — sin gap antes del
           banner image. Brandon mayo 15: antes estaba arriba del nav fijo
           y dejaba un espacio en blanco visible entre nav y banner). ── */}
      {!isOpen && (
        <ClosedNowBanner
          hours={hoursJson}
          nextOpeningAt={nextOpeningAt ?? null}
          storeName={store.name}
        />
      )}

      {/* ── Banner image grande del negocio (mobile + desktop) ───────────
           Brandon mayo 14 v6 (referencia Rappi don-bajadon): el banner
           image vuelve a aparecer en mobile como antes — scrollea
           naturalmente. La barra slim sticky abajo cubre el rol del
           overlay cuando se sale del viewport. */}
      <StoreBannerArea
        banner={store.banner ?? null}
        logo={store.logo ?? null}
        name={store.name}
        category={store.category}
        zone={store.zone}
      />

      {/* ── MOBILE: barra slim STICKY v6 (Brandon 2026-05-18 — rediseño) ──
           Cambios vs v5:
           - Top ajustado a [56px] (nuevo alto del top nav).
           - Banner background con mejor overlay (gradient + blur).
           - Jerarquía mejorada: logo circular + name + dot status "Abierto/Cerrado"
             en lugar de solo nombre centrado. Más informativo en 1 tap-zone.
           - Info button mantiene su lugar a la derecha. */}
      {/* PENTEST 2026-05-18 Fase 2 P0 #32: sanitizar URL del banner.
          ANTES: `url(${store.banner})` con URL no escapada. Admin malicioso
          podía configurar banner con `;background: red;` o cerrar la
          comilla simple e inyectar CSS adicional.
          AHORA: encodeURI escapa caracteres peligrosos (paréntesis,
          comillas) sin tocar los normales de URL. CSS interpreta solo la
          URL correcta. */}
      <div
        className="lg:hidden sticky top-[56px] z-30 h-14 overflow-hidden border-b border-black/10 shadow-sm"
        style={{
          background: store.banner
            ? `linear-gradient(rgba(0,0,0,0.70), rgba(0,0,0,0.55)), url("${encodeURI(store.banner).replace(/"/g, "%22")}") center/cover`
            : "linear-gradient(135deg, var(--accent-600,var(--accent)), var(--accent))",
        }}
      >
        <div className="relative h-full flex items-center gap-2.5 px-3 backdrop-blur-sm">
          <BackButton storeSlug={store.slug} />

          {/* Identidad de la tienda — logo + name + status. La parte central
              tap-able para abrir el modal de info (mejor área que solo el icono). */}
          <button
            type="button"
            onClick={() => setInfoModalOpen(true)}
            aria-label={`Ver información de ${store.name}`}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left active:scale-[0.98] transition-transform"
          >
            <span className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-white/15 border border-white/25 backdrop-blur-md flex items-center justify-center ring-2 ring-white/10">
              {store.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logo}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-sm font-black text-white">
                  {store.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="flex flex-col min-w-0 leading-tight">
              <span className="text-sm font-extrabold text-white truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                {store.name}
              </span>
              <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                <span
                  aria-hidden
                  className={cn(
                    "relative inline-flex h-1.5 w-1.5 shrink-0",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full rounded-full opacity-70",
                      isOpen ? "bg-[#34d399] animate-ping" : "bg-[#f87171]",
                    )}
                  />
                  <span
                    className={cn(
                      "relative inline-flex h-1.5 w-1.5 rounded-full",
                      isOpen ? "bg-[#34d399]" : "bg-[#f87171]",
                    )}
                  />
                </span>
                {isOpen ? "Abierto ahora" : "Cerrado"}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setInfoModalOpen(true)}
            aria-label="Información de la tienda"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white hover:bg-white/25 active:scale-95 transition-all shrink-0 shadow-lg"
          >
            <Info className="h-4.5 w-4.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* ── DESKTOP: Botón Volver bajo el banner ──────────────────────── */}
      <div className="hidden lg:block">
        <BackToTiendasButton storeName={store.name} storeSlug={store.slug} />
      </div>

      {/* ── Hero del negocio (mobile + desktop) — como Rappi don-bajadon
           muestra info completa: rating, descripción, horario, pagos. */}
      <StoreHero
        name={store.name}
        category={store.category}
        zone={store.zone}
        description={getStoreTagline({
          slug: store.slug,
          name: store.name,
          category: store.category,
          existing: store.description,
        })}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
        scheduleLabel="Lun a Dom · 7am – 11pm"
        isOpen={isOpen}
        paymentMethods={paymentMethods}
      />

      {/* ── Promociones de la tienda (gestionadas por el dueño desde su admin) ─ */}
      <StorePromoBannersStrip storeSlug={store.slug} storeName={store.name} />

      {/* ── Sentinel para detectar sticky ─────────────────────────────────── */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* ── Sticky toolbar consolidado (Brandon, mayo 14 v4) ──────────
          MOBILE: solo el subnav de categorías (search + toggle ya están
          arriba en el top sticky nav). DESKTOP: search prominente + toggle.
          MOBILE el sticky empieza después del top nav (top-[60px]) para que
          ambos queden apilados. */}
      <div
        className={cn(
          "sticky z-20 bg-[var(--surface-canvas)]/95 backdrop-blur-md border-b border-[var(--rule-base)] transition-shadow duration-150",
          // top-[112px] = 56 nav (v6) + 56 barra slim. En desktop top-0.
          "top-[112px] lg:top-0",
          isStuck ? "shadow-[0_4px_16px_-6px_rgba(0,0,0,0.12)]" : "shadow-none",
        )}
        style={{ contain: "layout paint" }}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-2.5">
          {/* ── Desktop only: Row de Search + View toggle ── */}
          <div className="hidden lg:flex items-center gap-2">
            {/* Search bar grande + prominente */}
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]"
                aria-hidden
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder={`Buscar en ${store.name}…`}
                className="w-full h-12 pl-12 pr-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-colors"
                aria-label="Buscar productos"
                autoComplete="off"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}

              {/* Sugerencias dropdown */}
              {searchFocused && suggestions.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 right-0 z-40 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                  {suggestions.map((s, idx) => (
                    <button
                      key={`${s.type}:${s.value}:${idx}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (s.type === "category") {
                          setActiveCategory(s.value);
                          setSearchTerm("");
                        } else {
                          setSearchTerm(s.value);
                        }
                        setSearchFocused(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent-soft)]/40 transition-colors border-b border-[var(--rule-soft)] last:border-b-0"
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center h-8 w-8 rounded-full shrink-0",
                        s.type === "category" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                      )}>
                        <Search className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{s.label}</p>
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          {s.type === "category" ? "Filtrar por categoría" : "Producto"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View toggle compacto — siempre visible al lado del search
                (antes solo en mobile en una row separada). */}
            <div
              role="group"
              aria-label="Cambiar entre cuadrícula y lista"
              className="inline-flex rounded-xl border-2 border-[var(--rule-base)] overflow-hidden bg-[var(--surface-raised)] shrink-0"
            >
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-pressed={view === "grid"}
                aria-label="Vista en cuadrícula"
                className={cn(
                  "inline-flex items-center justify-center h-12 w-11 transition-colors",
                  view === "grid"
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                aria-label="Vista en lista"
                className={cn(
                  "inline-flex items-center justify-center h-12 w-11 border-l-2 border-[var(--rule-base)] transition-colors",
                  view === "list"
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                <List className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {/* ── Mobile category subnav (tabs estilo iFood/Rappi) ──
               Brandon mayo 14 v4: quitado el chip "Todos" (no aporta —
               si querés ver todo, cerrá el filtro). Pills rediseñadas
               como tabs sin border: solo texto + contador. Franja inferior
               accent que se anima al pill activo via CSS transition.
               El click hace scroll smooth al sentinel #cat-{name} si existe.
               Brandon 2026-05-18: agregado botón "Ver todas" sticky a la
               izquierda que abre el drawer mobile (StoreCategoriesSidebar).
               Antes el drawer no tenía trigger visible — código muerto. */}
          {categories.length > 0 && (
            <div className="lg:hidden -mx-4 sm:-mx-6 flex items-stretch">
              {/* Botón "Ver todas" sticky-izq que abre el drawer rediseñado */}
              <button
                type="button"
                onClick={() => setMobileCatOpen(true)}
                aria-label="Abrir todas las categorías"
                className="shrink-0 inline-flex items-center gap-1.5 h-12 px-3.5 ml-2 sm:ml-4 rounded-full bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-95 transition-all"
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Categorías
              </button>
              <div
                ref={subnavScrollRef}
                role="tablist"
                aria-label="Filtrar por categoría"
                className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide px-2 sm:px-4 scroll-smooth flex-1 min-w-0"
              >
                {categories.map((cat) => {
                  const active = activeCategory === cat.name;
                  return (
                    <button
                      key={cat.name}
                      type="button"
                      role="tab"
                      data-cat={cat.name}
                      aria-selected={active}
                      onClick={() => {
                        // Brandon mayo 14 v5: tap en pill → SOLO scroll smooth
                        // a la sección. NO filtra. El scrollspy se encarga de
                        // actualizar activeCategory cuando la sección cruza
                        // la zona hot del viewport.
                        if (typeof window === "undefined") return;
                        // Apaga scrollspy temporalmente para evitar el conflicto
                        // entre scroll programático y observer disparado por
                        // secciones intermedias.
                        scrollSpyEnabledRef.current = false;
                        setActiveCategory(cat.name);
                        // PENTEST 2026-05-18 Fase 3 P1 #33: slug el id antes
                        // de buscar — antes "cat-Pollo a la Brasa" no matcheaba
                        // el HTML id real "cat-pollo-a-la-brasa".
                        const el = document.getElementById(`cat-${slugifyCat(cat.name)}`);
                        if (el) {
                          // 64 top nav + 56 slim + 56 subnav + 8 margen
                          const offset = 184;
                          const y = el.getBoundingClientRect().top + window.scrollY - offset;
                          window.scrollTo({ top: y, behavior: "smooth" });
                        }
                        // Re-activa scrollspy tras 700ms (después del scroll smooth)
                        setTimeout(() => {
                          scrollSpyEnabledRef.current = true;
                        }, 700);
                      }}
                      className={cn(
                        "relative shrink-0 inline-flex items-center gap-1.5 px-3.5 h-12 text-sm font-bold whitespace-nowrap transition-colors",
                        active
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <span className="tracking-tight">{cat.name}</span>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[length:var(--ts-2xs)] font-black tabular-nums transition-colors",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                        )}
                      >
                        {cat.count}
                      </span>
                      {/* Franja indicadora — solo en el activo, animada con
                          translate al cambiar de tab via parent layout. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full transition-all duration-[var(--dur-base)]",
                          active
                            ? "bg-[var(--accent-600,var(--accent))] opacity-100 scale-x-100"
                            : "bg-transparent opacity-0 scale-x-0",
                        )}
                        style={{ transformOrigin: "center" }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Layout: SIDEBAR (lg+) + CATALOG ─────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10">
        <div className="flex gap-6 lg:gap-8">
          {/* Sidebar desktop — sticky, vertical, scroll interno si hay muchas categorias */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-[5.5rem]">
              <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 shadow-sm max-h-[calc(100dvh-7rem)] overflow-y-auto">
                <StoreCategoriesSidebar
                  categories={categories}
                  activeCategory={filterCategory}
                  onCategoryChange={handleCategorySelect}
                  images={categoryImages}
                />
              </div>
            </div>
          </aside>

          {/* Main: catálogo — recibe filterCategory (no activeCategory) para
              no filtrar en mobile cuando el scrollspy actualiza el visual. */}
          <main className="flex-1 min-w-0">
            <StoreCatalog
              storeSlug={store.slug}
              storeName={store.name}
              storeId={store.id}
              products={products}
              activeCategory={filterCategory}
              externalSearch={searchTerm}
              onExternalSearchChange={setSearchTerm}
              externalView={view}
              onExternalViewChange={setView}
            />
          </main>
        </div>
      </div>

      {/* ── Drawer mobile — overlay con lista de categorías (v2 Brandon 2026-05-18)
           Rediseño mobile: backdrop con blur más fuerte, sheet desde la derecha
           con border-radius en la izquierda (siente más como sheet, menos
           como pared). Header con título grande + counter de categorías
           activas + close button h-11. Animation slide-in-from-right. */}
      {mobileCatOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Categorías"
        >
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-md animate-in fade-in-0 duration-200"
            onClick={() => setMobileCatOpen(false)}
          />
          <div className="relative ml-auto h-full w-[88vw] max-w-sm bg-[var(--surface-canvas)] shadow-2xl flex flex-col rounded-l-3xl overflow-hidden animate-in slide-in-from-right-4 duration-300">
            {/* Header rediseñado: drag handle visual + título + count + close */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b-2 border-[var(--rule-base)] bg-linear-to-b from-[var(--accent-soft)]/40 to-transparent">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                    Explorar
                  </p>
                  <h2 className="text-xl font-black text-[var(--text-primary)] leading-tight tracking-tight">
                    Categorías
                  </h2>
                  <p className="mt-0.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] tabular-nums">
                    {categories.length} {categories.length === 1 ? "categoría" : "categorías"}
                    {filterCategory && " · 1 filtrada"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileCatOpen(false)}
                  aria-label="Cerrar categorías"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)] active:scale-95 transition-all shrink-0"
                >
                  <X className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
              <StoreCategoriesSidebar
                categories={categories}
                activeCategory={filterCategory}
                onCategoryChange={handleCategorySelect}
                images={categoryImages}
                hideHeader
              />
            </div>
            {/* Sticky footer con CTA "Limpiar filtro" si hay categoría activa */}
            {filterCategory && (
              <div className="shrink-0 border-t border-[var(--rule-soft)] px-4 py-3 bg-[var(--surface-canvas)]">
                <button
                  type="button"
                  onClick={() => {
                    handleCategorySelect(null);
                    setMobileCatOpen(false);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-95 transition-all"
                >
                  Ver todos los productos
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Reviews ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StoreReviews summary={reviewSummary} reviews={reviews} storeSlug={store.slug} storeName={store.name} />
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Policies ───────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StorePoliciesBlock />
      </div>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-900 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-white mb-1">
              ¿Sos el dueño de esta tienda?
            </p>
            <p className="text-sm text-[var(--text-secondary)] dark:text-gray-400">
              Reclamá tu tienda y gestioná tu catálogo desde el panel de vendedor.
            </p>
          </div>
          <Link
            href="/marketplace/negocios"
            className="flex-shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] dark:text-gray-300 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
          >
            Registrar mi negocio
          </Link>
        </div>
      </div>

      {/* ── Mobile search overlay (expandible al tap en lupa del nav top) ── */}
      <MobileSearchOverlay
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        storeName={store.name}
        value={searchTerm}
        onChange={setSearchTerm}
        suggestions={suggestions}
        onSelectSuggestion={(s) => {
          if (s.type === "category") {
            setActiveCategory(s.value);
            setSearchTerm("");
          } else {
            setSearchTerm(s.value);
          }
          setMobileSearchOpen(false);
        }}
      />

      {/* ── Modal info del negocio (mobile + desktop) ──────────────────── */}
      <StoreInfoModal
        open={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        store={store}
        hoursJson={hoursJson}
        paymentMethods={paymentMethods}
      />

      {/* ── Nav drawer general (hamburguesa del top nav) ──────────────── */}
      <NavDrawer
        open={navDrawerOpen}
        onClose={() => setNavDrawerOpen(false)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavDrawer — menú de navegación general (hamburguesa).
// Brandon mayo 14 v6: el hamburguesa abre ESTE drawer (no el de categorías).
// Links principales del marketplace: Inicio, Tiendas, Negocios, Mi cuenta,
// Mis pedidos, Favoritos.
// ─────────────────────────────────────────────────────────────────────────────
function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  if (!open) return null;

  const NAV_LINKS: Array<{
    href: string;
    label: string;
    desc: string;
    Icon: typeof HomeIcon;
  }> = [
    { href: "/", label: "Inicio", desc: "Volver al home Buleje", Icon: HomeIcon },
    { href: "/tiendas", label: "Tiendas", desc: "Directorio completo", Icon: StoreIcon },
    { href: "/marketplace/ofertas", label: "Ofertas", desc: "Promos del día", Icon: Tag },
    { href: "/marketplace/mi-cuenta/pedidos", label: "Mis pedidos", desc: "Historial y tracking", Icon: Package },
    { href: "/marketplace/mi-cuenta/favoritos", label: "Favoritos", desc: "Tiendas y productos guardados", Icon: Heart },
    { href: "/marketplace/mi-cuenta", label: "Mi cuenta", desc: "Perfil, direcciones, cupones", Icon: UserCircle },
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      />
      <aside className="relative flex flex-col w-full max-w-[320px] h-full bg-[var(--surface-canvas)] shadow-2xl animate-in slide-in-from-left duration-200">
        {/* Header con accent */}
        <div className="relative overflow-hidden bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white px-5 pt-6 pb-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/80 leading-tight">
                Buleje
              </p>
              <p className="text-xl font-extrabold tracking-tight leading-tight">
                Menú
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar menú"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors shrink-0"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5" aria-label="Navegación principal">
          {NAV_LINKS.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="group flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 p-3.5 transition-all"
            >
              <span
                aria-hidden
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white transition-colors shrink-0"
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                  {label}
                </p>
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-tight mt-0.5">
                  {desc}
                </p>
              </div>
              <ArrowRight
                className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0"
                strokeWidth={2.25}
              />
            </Link>
          ))}
        </nav>

        {/* Footer — CTA "abrir tu tienda" */}
        <div className="border-t border-[var(--rule-base)] p-4">
          <Link
            href="/negocios"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-extrabold hover:bg-[var(--text-primary)]/90 transition-colors"
          >
            ¿Tenés una tienda? Abrila acá
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BackButton — pill glassmorph para overlay sobre el banner del negocio.
// ─────────────────────────────────────────────────────────────────────────────
function BackButton({ storeSlug }: { storeSlug?: string }) {
  void storeSlug; // referencia futura por contexto
  const router = useRouter();
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/tiendas");
    }
  }, [router]);

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Volver"
      className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-black/55 active:scale-95 transition-all shrink-0 shadow-lg"
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MobileSearchOverlay — full-screen search overlay mobile-only.
// ─────────────────────────────────────────────────────────────────────────────
interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  storeName: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: Array<{ type: "product" | "category"; label: string; value: string }>;
  onSelectSuggestion: (s: { type: "product" | "category"; label: string; value: string }) => void;
}

function MobileSearchOverlay({
  open,
  onClose,
  storeName,
  value,
  onChange,
  suggestions,
  onSelectSuggestion,
}: MobileSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 bg-[var(--surface-canvas)]">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--rule-base)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar buscador"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Buscar en ${storeName}…`}
            aria-label="Buscar productos"
            autoComplete="off"
            className="w-full h-11 pl-9 pr-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Limpiar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] shrink-0"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        )}
      </div>

      <div className="overflow-y-auto h-[calc(100svh-64px)] px-3 py-3">
        {suggestions.length > 0 ? (
          <ul className="space-y-1">
            {suggestions.map((s, idx) => (
              <li key={`${s.type}:${s.value}:${idx}`}>
                <button
                  type="button"
                  onClick={() => onSelectSuggestion(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl hover:bg-[var(--accent-soft)]/40 transition-colors"
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center h-9 w-9 rounded-full shrink-0",
                      s.type === "category"
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                    )}
                  >
                    <Search className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {s.label}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {s.type === "category" ? "Filtrar por categoría" : "Producto"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : value.trim().length === 0 ? (
          <p className="text-center text-sm text-[var(--text-tertiary)] py-8">
            Empezá a escribir para buscar productos o categorías…
          </p>
        ) : (
          <p className="text-center text-sm text-[var(--text-tertiary)] py-8">
            Sin resultados para &ldquo;{value}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StoreInfoModal — bottom-sheet mobile / centered desktop.
// Muestra: logo + nombre + categoría + dirección + horario + métodos pago + WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────
interface StoreInfoModalProps {
  open: boolean;
  onClose: () => void;
  store: DbStore;
  hoursJson?: unknown;
  paymentMethods?: string[];
}

function StoreInfoModal({
  open,
  onClose,
  store,
  hoursJson,
  paymentMethods = [],
}: StoreInfoModalProps) {
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

  if (!open) return null;

  // Días de la semana en orden — adaptar al jsonb {mon:{open,close,closed}, ...}
  const DAYS = [
    { key: "mon", label: "Lunes" },
    { key: "tue", label: "Martes" },
    { key: "wed", label: "Miércoles" },
    { key: "thu", label: "Jueves" },
    { key: "fri", label: "Viernes" },
    { key: "sat", label: "Sábado" },
    { key: "sun", label: "Domingo" },
  ];

  const hours = (hoursJson as Record<string, { open?: string; close?: string; closed?: boolean }> | undefined) ?? {};
  const today = new Date().getDay(); // 0=dom, 1=lun...
  const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][today];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Información de ${store.name}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg max-h-[90svh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-[var(--rule-soft)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-14 w-14 shrink-0 rounded-2xl overflow-hidden bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] flex items-center justify-center">
              {store.logo ? (
                <img
                  src={store.logo}
                  alt={store.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-lg font-black text-[var(--accent)]">
                  {store.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                {store.category ?? "Tienda"}
              </p>
              <h3 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                {store.name}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Zona */}
          {store.zone && (
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <MapPin className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                  Ubicación
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                  {store.zone}
                </p>
              </div>
            </div>
          )}

          {/* Horario */}
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
              <Clock className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight mb-1.5">
                Horario de atención
              </p>
              {Object.keys(hours).length > 0 ? (
                <ul className="space-y-1">
                  {DAYS.map((d) => {
                    const h = hours[d.key];
                    const isToday = d.key === todayKey;
                    return (
                      <li
                        key={d.key}
                        className={cn(
                          "flex items-center justify-between gap-3 text-sm",
                          isToday && "font-extrabold text-[var(--accent)]",
                        )}
                      >
                        <span className={isToday ? "" : "text-[var(--text-secondary)]"}>
                          {d.label}
                          {isToday && " · hoy"}
                        </span>
                        <span className="tabular-nums font-bold text-[var(--text-primary)]">
                          {h?.closed
                            ? "Cerrado"
                            : h?.open && h?.close
                              ? `${h.open} – ${h.close}`
                              : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Lun a Dom · 7am – 11pm
                </p>
              )}
            </div>
          </div>

          {/* Métodos de pago */}
          {paymentMethods.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Wallet className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                  Métodos de pago
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] capitalize">
                  {paymentMethods.join(" · ")}
                </p>
              </div>
            </div>
          )}

          {/* WhatsApp / Contacto */}
          {(store as { whatsapp?: string; phone?: string }).whatsapp && (
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Phone className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                  WhatsApp
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                  {(store as { whatsapp?: string }).whatsapp}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Botón Volver ───────────────────────────────────────────────────────────
function BackToTiendasButton({
  storeName,
  storeSlug,
}: {
  storeName?: string;
  storeSlug?: string;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/tiendas");
    }
  }, [router]);

  const scrollToCatalog = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("catalogo");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Persistencia local de favoritos por tienda (placeholder hasta backend).
  useEffect(() => {
    if (!storeSlug) return;
    try {
      const fav = localStorage.getItem(`buleje:fav-store:${storeSlug}`);
      setFavorited(fav === "1");
    } catch {
      /* ignore */
    }
  }, [storeSlug]);

  const toggleFavorite = useCallback(() => {
    if (!storeSlug) return;
    setFavorited((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(`buleje:fav-store:${storeSlug}`, "1");
        else localStorage.removeItem(`buleje:fav-store:${storeSlug}`);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storeSlug]);

  // Brandon, mayo 14 2026 v2: simplificado. Antes tenía 4 elementos en
  // mobile (Volver + Nombre + Catálogo + Favorito) que competían con los
  // CTAs del hero — confuso. Ahora: Volver compacto + Nombre tienda + un
  // único Favorito a la derecha. "Catálogo" se quita porque el hero ya
  // tiene su CTA "Ver catálogo" y el sticky toolbar de abajo deja el
  // catálogo siempre visible al scrollear. _scrollToCatalog ya no se usa.
  void scrollToCatalog;

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]/40 active:scale-[0.98] transition-all shrink-0"
          aria-label="Volver a Tiendas"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          <span className="hidden xs:inline">Volver</span>
        </button>

        {/* Nombre tienda — mobile only, reemplaza el h1 mientras se scrollea */}
        {storeName && (
          <p className="md:hidden flex-1 min-w-0 text-base font-extrabold tracking-tight text-[var(--text-primary)] truncate">
            {storeName}
          </p>
        )}

        {/* Spacer en desktop para empujar el favorito a la derecha */}
        <div className="hidden md:block flex-1" />

        {/* Favorito — único CTA al lado del Volver. Visible en todos los tamaños. */}
        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
          aria-pressed={favorited}
          title={favorited ? "Tienda favorita" : "Guardar como favorita"}
          className={cn(
            "inline-flex h-10 sm:h-11 items-center gap-1.5 rounded-full border-2 transition-all shrink-0 active:scale-[0.95] px-3 sm:px-4 text-sm font-bold",
            favorited
              ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)]",
          )}
        >
          <Heart
            className={cn("h-4 w-4", favorited && "fill-[var(--data-error-500)]")}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="hidden sm:inline">{favorited ? "Guardada" : "Guardar"}</span>
        </button>
      </div>
    </div>
  );
}
