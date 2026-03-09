"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import {
  Menu, X, ShoppingBasket, ShoppingCart,
  ChevronDown, Leaf, Package, Beef, Milk, GlassWater, Sparkles, UserCircle, AlertTriangle, Settings,
  Sun, Moon, Search, Trophy, Gift,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings, DEFAULT_NAV_LINKS } from "@/contexts/settings-context";
import { useTheme } from "@/contexts/theme-context";
import { products } from "@/data/products";
import { cn } from "@/lib/utils";

const categoryMenuItems = [
  { id: "frutas-verduras", label: "Frutas y Verduras", emoji: "🥬", icon: Leaf,
    desc: "Productos frescos del día" },
  { id: "abarrotes", label: "Abarrotes", emoji: "🏪", icon: Package,
    desc: "Arroz, fideos, aceite y más" },
  { id: "carnes", label: "Carnes", emoji: "🥩", icon: Beef,
    desc: "Carnes frescas de calidad" },
  { id: "lacteos", label: "Lácteos", emoji: "🧀", icon: Milk,
    desc: "Leche, queso, yogurt" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤", icon: GlassWater,
    desc: "Agua, gaseosas, jugos" },
  { id: "limpieza", label: "Limpieza", emoji: "🧹", icon: Sparkles,
    desc: "Todo para tu hogar limpio" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevCount = useRef(0);
  const { count, toggle, hasPendingOrder, openConfirmModal } = useCart();
  const { customer, openModal: openCustomerModal } = useCustomer();
  const { navLinks: storedNavLinks } = useSettings();
  const { resolved: theme, toggle: toggleTheme } = useTheme();
  const megaRef = useRef<HTMLDivElement>(null);
  const navLinks = storedNavLinks?.length ? storedNavLinks : DEFAULT_NAV_LINKS;

  // Loyalty data
  const [loyalty, setLoyalty] = useState<{ loyaltyPoints: number; loyaltyTier: string; totalSpent: number } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Listen for announcement bar visibility changes
  useEffect(() => {
    const hide = () => startTransition(() => setAnnouncementVisible(false));
    const show = () => startTransition(() => setAnnouncementVisible(true));
    window.addEventListener("bsm:announcementDismissed", hide);
    window.addEventListener("bsm:announcementHidden", hide);
    window.addEventListener("bsm:announcementShown", show);
    return () => {
      window.removeEventListener("bsm:announcementDismissed", hide);
      window.removeEventListener("bsm:announcementHidden", hide);
      window.removeEventListener("bsm:announcementShown", show);
    };
  }, []);

  // Bounce cart icon when item added
  useEffect(() => {
    if (count > prevCount.current) {
      startTransition(() => setCartBounce(true));
      const t = setTimeout(() => setCartBounce(false), 600);
      prevCount.current = count;
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  // Close mega menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) {
        setMegaOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch loyalty data when customer phone is available
  useEffect(() => {
    if (!customer?.phone) { startTransition(() => setLoyalty(null)); return; }
    const phone = customer.phone.replace(/\D/g, "").slice(-9);
    if (phone.length < 6) return;
    fetch(`/api/loyalty/${phone}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) startTransition(() => setLoyalty(data)); })
      .catch(() => {});
  }, [customer?.phone]);

  // Search autocomplete
  useEffect(() => {
    if (searchQuery.trim().length < 2) { startTransition(() => setSuggestions([])); return; }
    const q = searchQuery.trim().toLowerCase();
    const matches = products
      .filter(p => p.name.toLowerCase().includes(q))
      .map(p => p.name)
      .slice(0, 6);
    startTransition(() => setSuggestions(matches));
  }, [searchQuery]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      startTransition(() => {
        setSearchQuery("");
        setSuggestions([]);
      });
    }
  }, [searchOpen]);

  const handleSearchSelect = (name: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    setSuggestions([]);
    // Scroll to products and trigger search
    const el = document.getElementById("productos");
    if (el) el.scrollIntoView({ behavior: "smooth" });
    // Set the search input in ProductCatalog
    window.dispatchEvent(new CustomEvent("bsm:searchProduct", { detail: { query: name } }));
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      handleSearchSelect(searchQuery.trim());
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    setMegaOpen(false);
    setMobileOpen(false);
    setMobileCatOpen(false);
    // Broadcast to ProductCatalog via DOM event
    window.dispatchEvent(
      new CustomEvent("bsm:selectCategory", { detail: { categoryId } })
    );
    // Scroll to products section
    const el = document.getElementById("productos");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const navLinkCls = cn(
    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
    scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10"
  );

  const renderDesktopNavItem = (id: string) => {
    switch (id) {
      case "inicio":
        return <a key="inicio" href="#inicio" className={navLinkCls}>Inicio</a>;
      case "productos":
        return (
          <div key="productos" className="relative">
            <button
              onClick={() => setMegaOpen((o) => !o)}
              onMouseEnter={() => setMegaOpen(true)}
              aria-expanded={megaOpen}
              aria-haspopup="true"
              aria-controls="mega-menu"
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10",
                megaOpen && (scrolled ? "text-primary bg-primary/5" : "text-white bg-white/10")
              )}
            >
              Productos
              <span className={cn("transition-transform duration-200 inline-block", megaOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
            {megaOpen && (
              <div
                id="mega-menu"
                role="menu"
                onMouseLeave={() => setMegaOpen(false)}
                className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-120 bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-100 dark:border-card-border overflow-hidden animate-[megaIn_0.18s_ease-out]"
              >
                <div className="grid grid-cols-2 gap-2 p-4">
                  {categoryMenuItems.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryClick(cat.id)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 text-left transition-all hover:scale-[1.02] hover:shadow-sm hover:border-primary/25 hover:bg-primary/5 group"
                    >
                      <span className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/8 text-xl leading-none shrink-0 group-hover:bg-primary/12 transition-colors">
                        {cat.emoji}
                      </span>
                      <div>
                        <p className="font-bold text-sm leading-tight text-foreground group-hover:text-primary transition-colors">{cat.label}</p>
                        <p className="text-xs text-muted mt-0.5">{cat.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                  <button onClick={() => handleCategoryClick("todos")} className="text-sm font-semibold text-primary hover:underline">
                    → Ver todos los productos
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case "beneficios":
        return <a key="beneficios" href="#beneficios" className={navLinkCls}>Beneficios</a>;
      case "contacto":
        return <a key="contacto" href="#contacto" className={navLinkCls}>Contacto</a>;
      default:
        return null;
    }
  };

  const renderMobileNavItem = (id: string) => {
    const cls = "block px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors";
    switch (id) {
      case "inicio":
        return <a key="inicio" href="#inicio" onClick={() => setMobileOpen(false)} className={cls}>Inicio</a>;
      case "productos":
        return (
          <div key="productos">
            <button
              onClick={() => setMobileCatOpen((o) => !o)}
              aria-expanded={mobileCatOpen}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <span>Productos</span>
              <span className={cn("transition-transform duration-200 inline-block", mobileCatOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4 text-muted" />
              </span>
            </button>
            {mobileCatOpen && (
              <div className="overflow-hidden animate-[fadeDown_0.2s_ease-out]">
                <div className="mx-4 my-2 grid grid-cols-2 gap-2">
                  {categoryMenuItems.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryClick(cat.id)}
                      className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 text-left transition-colors hover:border-primary/25 hover:bg-primary/5"
                    >
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="text-sm font-bold text-foreground">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case "beneficios":
        return <a key="beneficios" href="#beneficios" onClick={() => setMobileOpen(false)} className={cls}>Beneficios</a>;
      case "contacto":
        return <a key="contacto" href="#contacto" onClick={() => setMobileOpen(false)} className={cls}>Contacto</a>;
      default:
        return null;
    }
  };

  return (
    <header
      className={cn(
        "fixed left-0 right-0 z-50 animate-[fadeDown_0.6s_ease-out]",
        announcementVisible ? "top-11" : "top-0",
        scrolled
          ? "bg-white/97 backdrop-blur-md shadow-lg dark:bg-card/97"
          : ""
      )}
      style={{
        transition: scrolled
          ? "background 0.4s ease, box-shadow 0.4s ease, top 0.35s cubic-bezier(0.4,0,0.2,1)"
          : "background 0.4s ease, top 0.35s cubic-bezier(0.4,0,0.2,1)",
        ...(scrolled ? {} : {
          background: "rgba(4,20,10,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(74,222,128,0.18)",
        }),
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">

          {/* Logo */}
          <a href="#inicio" className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-primary text-white shadow-md">
              <ShoppingBasket className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className={cn("text-base sm:text-xl font-bold leading-tight transition-colors",
                scrolled ? "text-primary-dark" : "text-white")}>
                Bodega San Martín
              </span>
              <span className={cn("hidden sm:block text-[10px] tracking-widest uppercase transition-colors",
                scrolled ? "text-primary/60" : "text-white/60")}>
                Pucallpa · Ucayali
              </span>
            </div>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1" ref={megaRef}>
            {navLinks.filter(l => l.visible).map(l => renderDesktopNavItem(l.id))}

            {/* Admin link — desktop */}
            <a
              href="/admin"
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all",
                scrolled
                  ? "text-gray-400 hover:text-primary hover:bg-primary/5"
                  : "text-white/50 hover:text-white hover:bg-white/10"
              )}
              title="Panel de administración"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden xl:inline">Admin</span>
            </a>

            {/* User profile pill — desktop nav */}
            <button
              onClick={() => openCustomerModal("profile")}
              className={cn(
                "flex items-center gap-2 rounded-full text-sm font-semibold transition-all duration-200 px-3 py-2 ml-1",
                scrolled
                  ? customer
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "bg-gray-100 text-foreground hover:bg-primary/10 hover:text-primary"
                  : "bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25"
              )}
              aria-label="Mi cuenta"
            >
              <UserCircle className="h-4 w-4 shrink-0" />
              <span className="max-w-22.5 truncate">
                {customer ? customer.name.split(" ")[0] : "Mi cuenta"}
              </span>
              {customer && (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
            </button>

            {/* Loyalty points badge — desktop */}
            {loyalty && customer && (
              <a
                href="/cuenta"
                className={cn(
                  "flex items-center gap-1.5 rounded-full text-xs font-bold transition-all duration-200 px-2.5 py-1.5",
                  scrolled
                    ? "bg-secondary/15 text-secondary hover:bg-secondary/25"
                    : "bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25"
                )}
                title={`Nivel ${loyalty.loyaltyTier} · ${loyalty.loyaltyPoints} puntos`}
              >
                {loyalty.loyaltyTier === "diamante" ? "💎" : loyalty.loyaltyTier === "oro" ? "🥇" : loyalty.loyaltyTier === "plata" ? "🥈" : "🥉"}
                <span>{loyalty.loyaltyPoints}</span>
                <Gift className="h-3 w-3" />
              </a>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                scrolled
                  ? "text-foreground hover:bg-primary/10 hover:text-primary"
                  : "text-white/70 hover:text-white hover:bg-white/15"
              )}
              aria-label="Buscar productos"
              title="Buscar"
            >
              <Search className="h-4.5 w-4.5" />
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                scrolled
                  ? "text-foreground hover:bg-primary/10 hover:text-primary"
                  : "text-white/70 hover:text-white hover:bg-white/15"
              )}
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            >
              {theme === "dark"
                ? <Sun className="h-4.5 w-4.5" />
                : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Pending warning icon — next to cart */}
            {hasPendingOrder && (
              <button
                onClick={() => openConfirmModal()}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/40 transition-colors animate-[scaleIn_0.3s_ease-out]"
                aria-label="Pedido pendiente de confirmación"
                title="Tienes un pedido pendiente"
              >
                <span className="absolute inset-0 rounded-full bg-amber-400 animate-[pendingRing_1.8s_ease-in-out_infinite]" />
                <AlertTriangle className="h-4 w-4 text-white relative z-10" />
              </button>
            )}

            {/* Cart */}
            <button
              onClick={toggle}
              className={cn(
                "relative flex items-center gap-2 rounded-full px-3 sm:px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                scrolled
                  ? "bg-primary text-white shadow-md hover:bg-primary-dark"
                  : "bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25"
              )}
              aria-label="Abrir carrito"
            >
              <span className={cartBounce ? "inline-block animate-[cartBounce_0.5s_ease-out]" : "inline-block"}>
                <ShoppingCart className="h-5 w-5" />
              </span>
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 && (
                <span
                  key={count}
                  aria-live="polite"
                  aria-atomic="true"
                  className="absolute -top-2 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-white shadow-sm animate-[scaleIn_0.2s_ease-out]"
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className={cn("lg:hidden p-2 rounded-lg transition-colors",
                scrolled ? "text-foreground hover:bg-gray-100" : "text-white hover:bg-white/10")}
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          role="navigation"
          aria-label="Menú principal"
          className="lg:hidden bg-white dark:bg-card border-t dark:border-card-border shadow-2xl overflow-hidden animate-[fadeDown_0.3s_ease-out]"
        >
            <div className="px-4 py-5 space-y-1">
              {navLinks.filter(l => l.visible).map(l => renderMobileNavItem(l.id))}
              <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                <button
                  onClick={() => { openCustomerModal("profile"); setMobileOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
                >
                  <UserCircle className="h-5 w-5" />
                  <span>{customer ? `Mi cuenta \u2014 ${customer.name.split(" ")[0]}` : "Mi cuenta"}</span>
                </button>

                {/* Loyalty — mobile */}
                {loyalty && customer && (
                  <a
                    href="/cuenta"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/10 text-secondary font-semibold hover:bg-secondary/20 transition-colors"
                  >
                    <Trophy className="h-5 w-5" />
                    <span className="flex-1">
                      {loyalty.loyaltyTier === "diamante" ? "💎" : loyalty.loyaltyTier === "oro" ? "🥇" : loyalty.loyaltyTier === "plata" ? "🥈" : "🥉"}{" "}
                      {loyalty.loyaltyPoints} puntos · Nivel {loyalty.loyaltyTier}
                    </span>
                  </a>
                )}
                <a
                  href="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 font-medium hover:bg-primary/5 hover:text-primary transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  <span>Panel de administración</span>
                </a>
              </div>
            </div>
          </div>
        )}

      {/* Search Overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm animate-[fadeDown_0.2s_ease-out]" onClick={() => setSearchOpen(false)}>
          <div className="bg-white dark:bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-3xl px-4 py-4">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-muted shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); if (e.key === "Escape") setSearchOpen(false); }}
                  placeholder="¿Qué producto buscas?"
                  className="flex-1 text-lg text-foreground bg-transparent outline-none placeholder:text-muted"
                  autoComplete="off"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors"
                  aria-label="Cerrar búsqueda"
                >
                  <X className="h-5 w-5 text-muted" />
                </button>
              </div>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="mt-3 border-t border-gray-100 dark:border-card-border pt-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Sugerencias</p>
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleSearchSelect(name)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-primary/5 hover:text-primary transition-colors text-left"
                    >
                      <Search className="h-3.5 w-3.5 text-muted shrink-0" />
                      <span dangerouslySetInnerHTML={{
                        __html: name.replace(
                          new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"),
                          '<strong class="text-primary">$1</strong>'
                        )
                      }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Quick categories */}
              {searchQuery.length === 0 && (
                <div className="mt-3 border-t border-gray-100 dark:border-card-border pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Categorías populares</p>
                  <div className="flex flex-wrap gap-2">
                    {categoryMenuItems.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => { setSearchOpen(false); handleCategoryClick(cat.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface dark:bg-surface border border-gray-200 dark:border-card-border text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <span>{cat.emoji}</span>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

