"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Menu, X, ShoppingCart, Store,
  ChevronDown, Leaf, Package, Beef, Milk, GlassWater, Sparkles, UserCircle, Settings,
  Sun, Moon, Search, Trophy, Gift, History, PackageCheck, User, ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings, DEFAULT_NAV_LINKS } from "@/contexts/settings-context";
import { useTheme } from "@/contexts/theme-context";
import { products } from "@/data/products";
import { cn } from "@/lib/utils";
import { dispatchAppEvent, onAppEvent } from "@/lib/events";

/** Safe text highlight — no dangerouslySetInnerHTML */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <strong key={i} className="text-primary">{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

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

const inicioMenuItems = [
  { id: "inicio-top", label: "Página Principal", emoji: "🏠", href: "/", desc: "Volver al inicio" },
  { id: "beneficios", label: "Beneficios", emoji: "⚡", href: "#beneficios", desc: "¿Por qué elegirnos?" },
  { id: "como-funciona", label: "Cómo Funciona", emoji: "🔄", href: "#como-funciona", desc: "Pasos para pedir" },
  { id: "reseñas", label: "Reseñas", emoji: "⭐", href: "#reseñas", desc: "Lo que dicen nuestros clientes" },
  { id: "contacto", label: "Contacto", emoji: "📞", href: "#contacto", desc: "Escríbenos" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const [inicioOpen, setInicioOpen] = useState(false);
  const [mobileInicioOpen, setMobileInicioOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [orderStatusChanged, setOrderStatusChanged] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const prevOrderStatus = useRef<string | null>(null);
  const router = useRouter();
  const { count, toggle } = useCart();
  const { customer, openModal: openCustomerModal, openAccountModal, openOrderStatusModal, clear } = useCustomer();
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
    
    const unsubDismissed = onAppEvent("announcementDismissed", hide);
    const unsubHidden = onAppEvent("announcementHidden", hide);
    const unsubShown = onAppEvent("announcementShown", show);
    
    return () => {
      unsubDismissed();
      unsubHidden();
      unsubShown();
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

  // Close mega menu and user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) {
        setMegaOpen(false);
        setInicioOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Check for active order
  useEffect(() => {
    const checkOrder = () => {
      try {
        const raw = localStorage.getItem("bsm-active-order");
        if (!raw) { setHasActiveOrder(false); prevOrderStatus.current = null; return; }
        const order = JSON.parse(raw);
        const age = Date.now() - new Date(order.createdAt).getTime();
        if (age > 7_200_000 || order.status === "entregado") {
          setHasActiveOrder(false);
          prevOrderStatus.current = null;
          return;
        }
        if (prevOrderStatus.current !== null && order.status !== prevOrderStatus.current) {
          startTransition(() => setOrderStatusChanged(true));
        }
        prevOrderStatus.current = order.status;
        setHasActiveOrder(true);
      } catch { setHasActiveOrder(false); }
    };
    checkOrder();
    const interval = setInterval(checkOrder, 30_000);
    window.addEventListener("bsm:orderCreated", checkOrder);
    return () => {
      clearInterval(interval);
      window.removeEventListener("bsm:orderCreated", checkOrder);
    };
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
    // Navigate to tienda and trigger search
    const el = document.getElementById("productos");
    if (el) {
      // Already on /tienda — just scroll and dispatch
      el.scrollIntoView({ behavior: "smooth" });
      dispatchAppEvent("searchProduct", { query: name });
    } else {
      // On landing page — navigate to /tienda then dispatch after load
      router.push("/tienda");
      setTimeout(() => {
        dispatchAppEvent("searchProduct", { query: name });
      }, 800);
    }
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
    dispatchAppEvent("selectCategory", { categoryId });
    // Navigate to shop if not there
    const el = document.getElementById("productos");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push("/tienda");
      setTimeout(() => {
        dispatchAppEvent("selectCategory", { categoryId });
      }, 800);
    }
  };

  const navLinkCls = cn(
    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
    scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10"
  );

  const renderDesktopNavItem = (id: string) => {
    switch (id) {
      case "inicio":
        return (
          <div key="inicio" className="relative">
            <button
              onClick={() => setInicioOpen((o) => !o)}
              onMouseEnter={() => setInicioOpen(true)}
              aria-expanded={inicioOpen}
              aria-haspopup="true"
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10",
                inicioOpen && (scrolled ? "text-primary bg-primary/5" : "text-white bg-white/10")
              )}
            >
              Inicio
              <span className={cn("transition-transform duration-200 inline-block", inicioOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
            {inicioOpen && (
              <div
                onMouseLeave={() => setInicioOpen(false)}
                className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-72 bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-100 dark:border-card-border overflow-hidden animate-[megaIn_0.18s_ease-out]"
              >
                <div className="p-2 space-y-0.5">
                  {inicioMenuItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={() => setInicioOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-transparent text-left transition-all hover:shadow-sm hover:border-primary/20 hover:bg-primary/5 group"
                    >
                      <span className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/8 text-xl leading-none shrink-0 group-hover:bg-primary/15 transition-colors">
                        {item.emoji}
                      </span>
                      <div>
                        <p className="font-bold text-sm leading-tight text-foreground group-hover:text-primary transition-colors">{item.label}</p>
                        <p className="text-[11px] text-muted mt-0.5">{item.desc}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case "tienda":
        return <Link key="tienda" href="/tienda" className={navLinkCls}>Tienda</Link>;
      case "categorias":
        return (
          <div key="categorias" className="relative">
            <button
              onClick={() => setMegaOpen((o) => !o)}
              onMouseEnter={() => setMegaOpen(true)}
              aria-expanded={megaOpen}
              aria-haspopup="true"
              aria-controls="mega-menu"
              aria-label="Menú de categorías"
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10",
                megaOpen && (scrolled ? "text-primary bg-primary/5" : "text-white bg-white/10")
              )}
            >
              Categorías
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
                <div className="grid grid-cols-2 gap-1.5 p-3">
                  {categoryMenuItems.map((cat) => (
                    <Link
                      key={cat.id}
                      href="/tienda"
                      onClick={() => { setMegaOpen(false); handleCategoryClick(cat.id); }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-transparent text-left transition-all hover:shadow-md hover:border-primary/20 hover:bg-primary/5 group"
                    >
                      <span className="flex items-center justify-center h-11 w-11 rounded-xl bg-primary/8 text-xl leading-none shrink-0 group-hover:bg-primary/15 transition-colors">
                        {cat.emoji}
                      </span>
                      <div>
                        <p className="font-bold text-sm leading-tight text-foreground group-hover:text-primary transition-colors">{cat.label}</p>
                        <p className="text-[11px] text-muted mt-0.5">{cat.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="px-4 py-2.5 bg-primary/5 dark:bg-primary/8 border-t border-gray-100 dark:border-card-border">
                  <Link href="/tienda" onClick={() => setMegaOpen(false)} className="text-sm font-bold text-primary hover:underline">
                    Ver todos los productos →
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const renderMobileNavItem = (id: string) => {
    const cls = "block px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors";
    switch (id) {
      case "inicio":
        return (
          <div key="inicio">
            <button
              onClick={() => setMobileInicioOpen((o) => !o)}
              aria-expanded={mobileInicioOpen}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <span>Inicio</span>
              <span className={cn("transition-transform duration-200 inline-block", mobileInicioOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4 text-muted" />
              </span>
            </button>
            {mobileInicioOpen && (
              <div className="overflow-hidden animate-[fadeDown_0.2s_ease-out]">
                <div className="mx-4 my-2 space-y-1">
                  {inicioMenuItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-card-border transition-colors hover:border-primary/25 hover:bg-primary/5"
                    >
                      <span className="text-xl">{item.emoji}</span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted">{item.desc}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case "tienda":
        return <Link key="tienda" href="/tienda" onClick={() => setMobileOpen(false)} className={cls}>Tienda</Link>;
      case "categorias":
        return (
          <div key="categorias">
            <button
              onClick={() => setMobileCatOpen((o) => !o)}
              aria-expanded={mobileCatOpen}
              aria-label="Menú de categorías"
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <span>Categorías</span>
              <span className={cn("transition-transform duration-200 inline-block", mobileCatOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4 text-muted" />
              </span>
            </button>
            {mobileCatOpen && (
              <div className="overflow-hidden animate-[fadeDown_0.2s_ease-out]">
                <div className="mx-4 my-2 grid grid-cols-2 gap-2">
                  {categoryMenuItems.map((cat) => (
                    <Link
                      key={cat.id}
                      href="/tienda"
                      onClick={() => { setMobileOpen(false); setMobileCatOpen(false); handleCategoryClick(cat.id); }}
                      className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 text-left transition-colors hover:border-primary/25 hover:bg-primary/5"
                    >
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="text-sm font-bold text-foreground">{cat.label}</span>
                    </Link>
                  ))}
                </div>
                <Link
                  href="/tienda"
                  onClick={() => { setMobileOpen(false); setMobileCatOpen(false); }}
                  className="block mx-4 mb-2 text-center text-sm font-bold text-primary hover:underline py-2"
                >
                  Ver todos los productos →
                </Link>
              </div>
            )}
          </div>
        );
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
          background: "rgba(30,27,75,0.65)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(99,102,241,0.18)",
        }),
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div 
              className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ 
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #3730a3 100%)",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35)"
              }}
            >
              <Store className="h-5 w-5 sm:h-6 sm:w-6" />
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
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1" ref={megaRef}>
            {navLinks.filter(l => l.visible).map(l => renderDesktopNavItem(l.id))}

            {/* Estado de pedido — desktop (always visible) */}
            <button
              id="order-status-nav-btn"
              onClick={() => { setOrderStatusChanged(false); openOrderStatusModal(); }}
              title="Ver estado de tu pedido"
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                hasActiveOrder
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                  : scrolled
                    ? "bg-primary/8 text-primary border-primary/20 hover:bg-primary/15"
                    : "bg-white/15 text-white border-white/20 hover:bg-white/25"
              )}
            >
              <PackageCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Estado de pedido</span>
              {hasActiveOrder && (
                <span className="relative flex h-2 w-2">
                  {orderStatusChanged && <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping" />}
                  <span className="relative h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                </span>
              )}
            </button>

            {/* User menu dropdown — desktop nav */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-2 rounded-full text-sm font-semibold transition-all duration-200 px-3 py-2 ml-1",
                  scrolled
                    ? customer
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "bg-gray-100 text-foreground hover:bg-primary/10 hover:text-primary"
                    : "bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25"
                )}
                aria-label="Menú de usuario"
                aria-expanded={userMenuOpen}
              >
                <UserCircle className="h-4 w-4 shrink-0" />
                <span className="max-w-22.5 truncate">
                  {customer ? (customer.name?.split(" ")[0] ?? "Mi cuenta") : "Mi cuenta"}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", userMenuOpen && "rotate-180")} />
              </button>
              
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-card rounded-xl shadow-2xl border border-gray-100 dark:border-card-border overflow-hidden animate-[fadeDown_0.15s_ease-out] z-50">
                  <div className="py-1.5">
                    <button
                      onClick={() => { openAccountModal(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-primary/5 hover:text-primary transition-colors text-left"
                    >
                      <User className="h-4 w-4" />
                      <span>Mi cuenta</span>
                    </button>
                    <a
                      href="/mis-pedidos"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span>Mis pedidos</span>
                    </a>
                    <button
                      onClick={() => { setUserMenuOpen(false); window.location.href = "/cuenta"; }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-primary/5 hover:text-primary transition-colors text-left"
                    >
                      <History className="h-4 w-4" />
                      <span>Historial de datos</span>
                    </button>
                    <a
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Panel de administración</span>
                    </a>
                    <button
                      onClick={() => { setOrderStatusChanged(false); openOrderStatusModal(); setUserMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left",
                        hasActiveOrder
                          ? "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                          : "text-muted hover:bg-primary/5 hover:text-primary"
                      )}
                    >
                      <div className="relative">
                        <PackageCheck className="h-4 w-4" />
                        {hasActiveOrder && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                        )}
                      </div>
                      <span className="flex-1">Estado de mi pedido</span>
                      {hasActiveOrder && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </button>
                    {customer && (
                      <>
                        <div className="mx-3 my-1 border-t border-gray-100 dark:border-card-border" />
                        <button
                          onClick={() => {
                            clear();
                            setUserMenuOpen(false);
                            window.location.reload();
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left"
                        >
                          <X className="h-4 w-4" />
                          <span>Cerrar sesión</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

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

            {/* Order status icon — mobile shortcut */}
            <button
              id="order-status-nav-btn-mobile"
              onClick={() => { setOrderStatusChanged(false); openOrderStatusModal(); }}
              className={cn(
                "lg:hidden relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                scrolled
                  ? hasActiveOrder
                    ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    : "text-foreground hover:bg-primary/10 hover:text-primary"
                  : hasActiveOrder
                    ? "text-amber-300 hover:bg-white/15"
                    : "text-white/70 hover:text-white hover:bg-white/15"
              )}
              aria-label="Estado de pedido"
              title="Estado de pedido"
            >
              <PackageCheck className="h-5 w-5" />
              {hasActiveOrder && (
                <span className="absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500">
                  {orderStatusChanged && (
                    <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping" />
                  )}
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

        {/* Category quick-strip — mobile only */}
        <div className="lg:hidden overflow-x-auto scrollbar-hide flex gap-1.5 px-2 pb-2 pt-0.5">
          {categoryMenuItems.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0",
                scrolled
                  ? "bg-primary/8 text-primary hover:bg-primary/15"
                  : "bg-white/15 text-white border border-white/20 hover:bg-white/25"
              )}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
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
                {/* Estado de pedido — mobile */}
                <button
                  onClick={() => { setOrderStatusChanged(false); openOrderStatusModal(); setMobileOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors",
                    hasActiveOrder
                      ? "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100"
                      : "bg-primary/5 text-primary hover:bg-primary/10"
                  )}
                >
                  <PackageCheck className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">Estado de mi pedido</span>
                  {hasActiveOrder && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
                </button>
                <button
                  onClick={() => { openCustomerModal("profile"); setMobileOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
                >
                  <UserCircle className="h-5 w-5" />
                  <span>{customer ? `Mi cuenta \u2014 ${customer.name?.split(" ")[0] ?? "Mi cuenta"}` : "Mi cuenta"}</span>
                </button>
                <a
                  href="/mis-pedidos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
                >
                  <ClipboardList className="h-5 w-5" />
                  <span>Mis pedidos</span>
                </a>

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
                {customer && (
                  <button
                    onClick={() => {
                      clear();
                      setMobileOpen(false);
                      window.location.reload();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    <X className="h-5 w-5" />
                    <span>Cerrar sesión</span>
                  </button>
                )}
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
                <Search className="h-5 w-5 text-muted shrink-0" aria-hidden="true" />
                <label htmlFor="product-search" className="sr-only">
                  Buscar productos
                </label>
                <input
                  id="product-search"
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
                      <HighlightMatch text={name} query={searchQuery} />
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

