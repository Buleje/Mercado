"use client";

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu, X, ShoppingCart, Store,
  ChevronDown, ChevronLeft, ChevronRight, Leaf, Package, Beef, Milk, GlassWater, Sparkles, UserCircle, Settings,
  Search, Trophy, Gift, History, PackageCheck, User, ClipboardList, Mic, Flame, ChefHat,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings, DEFAULT_NAV_LINKS } from "@/contexts/settings-context";
import { useTheme } from "@/contexts/theme-context";
import type { Product } from "@/data/products";
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
    desc: "Productos frescos del día",
    subs: ["Frutas", "Verduras", "Tubérculos", "Hierbas"],
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-700 dark:text-emerald-400" },
  { id: "abarrotes", label: "Abarrotes", emoji: "🏪", icon: Package,
    desc: "Arroz, fideos, aceite y más",
    subs: ["Arroz", "Aceite", "Azúcar", "Fideos", "Enlatados"],
    iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-700 dark:text-amber-400" },
  { id: "carnes", label: "Carnes", emoji: "🥩", icon: Beef,
    desc: "Carnes frescas de calidad",
    subs: ["Pollo", "Res", "Cerdo", "Pescado"],
    iconBg: "bg-red-100 dark:bg-red-900/40", iconColor: "text-red-600 dark:text-red-400" },
  { id: "lacteos", label: "Lácteos", emoji: "🧀", icon: Milk,
    desc: "Leche, queso, yogurt",
    subs: ["Leche", "Queso", "Yogurt", "Mantequilla"],
    iconBg: "bg-sky-100 dark:bg-sky-900/40", iconColor: "text-sky-600 dark:text-sky-400" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤", icon: GlassWater,
    desc: "Agua, gaseosas, jugos",
    subs: ["Gaseosas", "Agua", "Jugos", "Cervezas"],
    iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400" },
  { id: "limpieza", label: "Limpieza", emoji: "🧹", icon: Sparkles,
    desc: "Todo para tu hogar limpio",
    subs: ["Detergente", "Jabón", "Lejía", "Desinfectante"],
    iconBg: "bg-violet-100 dark:bg-violet-900/40", iconColor: "text-violet-600 dark:text-violet-400" },
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
  const [_mobileCatOpen, setMobileCatOpen] = useState(false);
  const [mobileInicioOpen, setMobileInicioOpen] = useState(false);
  // Single active dropdown — prevents two menus visible simultaneously
  const [activeDropdown, setActiveDropdown] = useState<"inicio" | "categorias" | null>(null);
  const _megaOpen = activeDropdown === "categorias";
  const inicioOpen = activeDropdown === "inicio";
  const dropdownTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openDropdown = (which: "inicio" | "categorias") => {
    if (dropdownTimeout.current) { clearTimeout(dropdownTimeout.current); dropdownTimeout.current = null; }
    setActiveDropdown(which);
  };
  const closeDropdown = () => {
    dropdownTimeout.current = setTimeout(() => setActiveDropdown(null), 120);
  };
  const cancelClose = () => {
    if (dropdownTimeout.current) { clearTimeout(dropdownTimeout.current); dropdownTimeout.current = null; }
  };
  const [scrolled, setScrolled] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const [inlineSearchFocused, setInlineSearchFocused] = useState(false);
  const inlineSearchRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [orderStatusChanged, setOrderStatusChanged] = useState(false);
  /* X4: Voice search + ordering */
  const [listening, setListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState<{ type: "added"; product: string; qty: number } | null>(null);
  const categoryStripRef = useRef<HTMLDivElement>(null);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false);

  /* AC4: Track recent searches for trending suggestions */
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("bsm-recent-searches") || "[]").slice(0, 5); } catch { return []; }
  });
  const recordSearch = useCallback((term: string) => {
    setRecentSearches(prev => {
      const next = [term, ...prev.filter(s => s.toLowerCase() !== term.toLowerCase())].slice(0, 5);
      try { localStorage.setItem("bsm-recent-searches", JSON.stringify(next)); } catch { /* silent */ }
      return next;
    });
  }, []);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const updateCategoryStripState = useCallback(() => {
    const element = categoryStripRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    setCanScrollCategoriesLeft(element.scrollLeft > 8);
    setCanScrollCategoriesRight(maxScrollLeft - element.scrollLeft > 8);
  }, []);

  const scrollCategoryStrip = useCallback((direction: "left" | "right") => {
    const element = categoryStripRef.current;
    if (!element) return;
    element.scrollBy({ left: direction === "right" ? 180 : -180, behavior: "smooth" });
  }, []);

  // Lazy-loaded product data refs — avoids 32 KB in initial JS bundle
  const productsRef = useRef<Product[] | null>(null);
  const levenshteinRef = useRef<((a: string, b: string) => number) | null>(null);

  /* Trending products — top sellers from selling-fast localStorage data */
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);

  // Load products + levenshtein lazily after mount
  useEffect(() => {
    void Promise.all([
      import("@/data/products"),
      import("@/hooks/use-advanced-search"),
    ]).then(([{ products: p }, { levenshteinDistance: ld }]) => {
      productsRef.current = p;
      levenshteinRef.current = ld;
      // Populate trending products once data is available
      try {
        const now = Date.now();
        const data: Record<string, number[]> = JSON.parse(localStorage.getItem("bsm-selling-fast") || "{}");
        const scored = Object.entries(data)
          .map(([id, timestamps]) => ({
            id: Number(id),
            count: (timestamps || []).filter(t => now - t < 86_400_000).length,
          }))
          .filter(x => x.count >= 2)
          .sort((a, b) => b.count - a.count)
          .slice(0, 4);
        setTrendingProducts(
          scored
            .map(s => p.find((prod: Product) => prod.id === s.id))
            .filter(Boolean) as Product[]
        );
      } catch { /* no-op */ }
    });
  }, []);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const prevOrderStatus = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { count, toggle, addItem } = useCart();
  const { customer, openModal: openCustomerModal, openAccountModal, openOrderStatusModal, clear } = useCustomer();
  const { navLinks: storedNavLinks, businessName, storeTheme } = useSettings();
  const { resolved: _theme, toggle: _toggleTheme } = useTheme();
  const megaRef = useRef<HTMLDivElement>(null);
  const navLinks = storedNavLinks?.length ? storedNavLinks : DEFAULT_NAV_LINKS;

  // Loyalty data
  const [loyalty, setLoyalty] = useState<{ loyaltyPoints: number; loyaltyTier: string; totalSpent: number } | null>(null);

  // Notification inbox
  type NotifItem = { id: string; type: string; title: string; body: string; link?: string; read: boolean; createdAt: string };
  const [notifOpen, setNotifOpen] = useState(false);
  const [_notifs, setNotifs] = useState<NotifItem[]>([]);
  const [_unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // Fetch notifications when customer exists
  useEffect(() => {
    if (!customer?.phone) return;
    const phone = customer.phone;
    let cancelled = false;
    const fetchNotifs = async () => {
      try {
        const r = await fetch(`/api/customer-notifications?phone=${encodeURIComponent(phone)}`);
        if (r.ok && !cancelled) {
          const data = await r.json();
          setNotifs(data.notifications ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch { /* silent */ }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000); // poll every 60s
    return () => { cancelled = true; clearInterval(interval); };
  }, [customer?.phone]);

  // Close notif dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  const _markAllRead = async () => {
    if (!customer?.phone) return;
    await fetch(`/api/customer-notifications?phone=${encodeURIComponent(customer.phone!)}&all=1`, { method: "PATCH" });
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    updateCategoryStripState();
    const element = categoryStripRef.current;
    if (!element) return;

    element.addEventListener("scroll", updateCategoryStripState, { passive: true });
    window.addEventListener("resize", updateCategoryStripState);

    return () => {
      element.removeEventListener("scroll", updateCategoryStripState);
      window.removeEventListener("resize", updateCategoryStripState);
    };
  }, [pathname, updateCategoryStripState]);

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
        setActiveDropdown(null);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (inlineSearchRef.current && !inlineSearchRef.current.contains(e.target as Node)) {
        setInlineSearchFocused(false);
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

  // Search autocomplete — fuzzy with Levenshtein typo tolerance (debounced)
  useEffect(() => {
    if (searchQuery.trim().length < 2) { startTransition(() => setSuggestions([])); return; }
    const p = productsRef.current;
    const ld = levenshteinRef.current;
    if (!p || !ld) { startTransition(() => setSuggestions([])); return; }
    const timer = setTimeout(() => {
    const q = searchQuery.trim().toLowerCase();
    const qWords = q.split(/\s+/).filter(Boolean);
    const scored = p
      .map(prod => {
        const t = prod.name.toLowerCase();
        const tWords = t.split(/\s+/).filter(Boolean);
        let score = 0;
        // Exact substring → highest
        if (t.includes(q)) { score = 100 + (q.length / t.length) * 50; }
        else {
          // Word-level hits
          let wordHits = 0;
          for (const qw of qWords) {
            if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) wordHits++;
          }
          if (wordHits === qWords.length) score = 85;
          else if (wordHits > 0) score = 60;
          else {
            // Levenshtein per word
            let editHits = 0;
            for (const qw of qWords) {
              const maxDist = qw.length <= 4 ? 1 : qw.length <= 7 ? 2 : 3;
              if (tWords.some(tw => ld(qw, tw) <= maxDist)) editHits++;
            }
            if (editHits === qWords.length) score = 50;
            else if (editHits > 0) score = 30;
          }
        }
        return { name: prod.name, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(x => x.name);
    startTransition(() => setSuggestions(scored));
    }, 200); // 200ms debounce
    return () => clearTimeout(timer);
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
    recordSearch(name);
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

  /* X4: Voice search + voice ordering via Web Speech API */
  const startVoiceSearch = () => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as any)();
    recognition.lang = "es-PE";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript: string | undefined = e.results?.[0]?.[0]?.transcript;
      if (!transcript) return;

      // Voice ordering: detect intent like "agrega 2 cerveza" or "quiero arroz"
      const orderMatch = transcript.match(/^(?:agrega|añade|pon|quiero|dame|necesito|mete)\s+(\d+)?\s*(.+?)(?:\s+al\s+carrito)?$/i);
      if (orderMatch) {
        const qty = parseInt(orderMatch[1] || "1", 10);
        const query = orderMatch[2].trim().toLowerCase();
        // fuzzy match product
        const prods = productsRef.current;
        if (!prods) return;
        const match = prods.find(p => p.name.toLowerCase().includes(query))
          || prods.find(p => query.split(/\s+/).every(w => p.name.toLowerCase().includes(w)));
        if (match) {
          for (let i = 0; i < Math.min(qty, 10); i++) addItem(match);
          setVoiceResult({ type: "added", product: match.name, qty: Math.min(qty, 10) });
          setTimeout(() => setVoiceResult(null), 4000);
          return;
        }
      }

      // Fallback: regular search
      setSearchQuery(transcript);
      handleSearchSelect(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleCategoryClick = (categoryId: string) => {
    setActiveDropdown(null);
    setMobileOpen(false);
    setMobileCatOpen(false);
    // Navigate to dedicated category page
    router.push(`/tienda/categoria/${categoryId}`);
  };

  const navLinkCls = cn(
    "px-4 py-2.5 rounded-lg text-base font-semibold transition-all",
    scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10"
  );

  const renderDesktopNavItem = (id: string) => {
    switch (id) {
      case "inicio":
        return (
          <div key="inicio" className="relative"
            onMouseEnter={() => openDropdown("inicio")}
            onMouseLeave={closeDropdown}
          >
            <button
              onClick={() => setActiveDropdown(prev => prev === "inicio" ? null : "inicio")}
              aria-expanded={inicioOpen}
              aria-haspopup="true"
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-base font-semibold",
                scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10",
                inicioOpen && (scrolled ? "text-primary bg-primary/8" : "text-white bg-white/15")
              )}
            >
              Inicio
              <ChevronDown className={cn("h-3.5 w-3.5", inicioOpen && "rotate-180")} />
            </button>
            <div
              onMouseEnter={cancelClose}
              onMouseLeave={closeDropdown}
              className={cn(
                "absolute top-full left-0 mt-2 w-145 min-w-135 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden",
                inicioOpen ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
              )}
            >
              {/* Sección navegación */}
              <div className="px-4 py-3 border-b border-gray-100 bg-linear-to-r from-primary/5 to-primary/5">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Navegación</p>
              </div>
              <div className="grid grid-cols-2 gap-1 p-2.5">
                {inicioMenuItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-primary/15 hover:bg-primary/5 group"
                  >
                    <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-gray-100 text-lg shrink-0 group-hover:bg-primary/10">
                      {item.emoji}
                    </span>
                    <div>
                      <p className="font-bold text-sm text-foreground group-hover:text-primary">{item.label}</p>
                      <p className="text-[11px] text-muted mt-0.5">{item.desc}</p>
                    </div>
                  </a>
                ))}
              </div>
              {/* Sección categorías */}
              <div className="px-4 py-3 border-t border-b border-gray-100 bg-linear-to-r from-primary/5 to-primary/5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Categorías</p>
                  <span className="text-[10px] text-muted font-medium">{categoryMenuItems.length} secciones</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 p-2.5">
                {categoryMenuItems.map((cat) => (
                  <Link
                    key={cat.id}
                    href="/tienda"
                    onClick={() => { setActiveDropdown(null); handleCategoryClick(cat.id); }}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-transparent hover:shadow-sm hover:border-gray-200 hover:bg-gray-50 group"
                  >
                    <span className={cn("flex items-center justify-center h-9 w-9 rounded-xl text-xl shrink-0 group-hover:scale-110", cat.iconBg)}>
                      {cat.emoji}
                    </span>
                    <div>
                      <p className="font-bold text-xs text-foreground group-hover:text-primary">{cat.label}</p>
                      <p className="text-[10px] text-muted mt-0.5">{cat.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="px-3 py-2.5 bg-linear-to-r from-primary/5 to-primary/5 border-t border-gray-100">
                <Link href="/tienda" onClick={() => setActiveDropdown(null)}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-sm font-bold text-primary hover:bg-primary/8">
                  Ver todos los productos →
                </Link>
              </div>
            </div>
          </div>
        );
      case "tienda":
        return <Link key="tienda" href="/tienda" className={navLinkCls}>Tienda</Link>;
      case "categorias":
        return (
          <div key="categorias" className="relative"
            onMouseEnter={() => openDropdown("categorias")}
            onMouseLeave={closeDropdown}
          >
            <button
              onClick={() => setActiveDropdown(prev => prev === "categorias" ? null : "categorias")}
              aria-expanded={_megaOpen}
              aria-haspopup="true"
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-base font-semibold",
                scrolled ? "text-foreground hover:text-primary hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10",
                _megaOpen && (scrolled ? "text-primary bg-primary/8" : "text-white bg-white/15")
              )}
            >
              Categorías
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", _megaOpen && "rotate-180")} />
            </button>
            {/* Mega Menu Panel */}
            <div
              onMouseEnter={cancelClose}
              onMouseLeave={closeDropdown}
              className={cn(
                "absolute top-full -left-32 mt-2 bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-100 dark:border-card-border overflow-hidden transition-all duration-200",
                "w-[640px]",
                _megaOpen ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
              )}
            >
              {/* Overlay behind mega menu */}
              <div className="px-5 py-3 border-b border-gray-100 dark:border-card-border bg-linear-to-r from-primary/5 to-transparent">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Todas las categorías</p>
              </div>
              <div className="grid grid-cols-3 gap-0 p-3">
                {categoryMenuItems.map((cat) => (
                  <div key={cat.id} className="p-2">
                    <Link
                      href={`/tienda/categoria/${cat.id}`}
                      onClick={() => { setActiveDropdown(null); handleCategoryClick(cat.id); }}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-primary/5 group"
                    >
                      <span className={cn("flex items-center justify-center h-8 w-8 rounded-lg text-base shrink-0 group-hover:scale-110 transition-transform", cat.iconBg)}>
                        {cat.emoji}
                      </span>
                      <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{cat.label}</span>
                    </Link>
                    <div className="ml-12 mt-0.5 space-y-0.5">
                      {cat.subs.map((sub) => (
                        <Link
                          key={sub}
                          href={`/tienda/categoria/${cat.id}`}
                          onClick={() => { setActiveDropdown(null); handleCategoryClick(cat.id); }}
                          className="block text-xs text-muted hover:text-primary transition-colors py-0.5 pl-1"
                        >
                          {sub}
                        </Link>
                      ))}
                      <Link
                        href={`/tienda/categoria/${cat.id}`}
                        onClick={() => { setActiveDropdown(null); handleCategoryClick(cat.id); }}
                        className="block text-xs font-semibold text-primary hover:text-primary/80 transition-colors py-0.5 pl-1 mt-1"
                      >
                        Ver todo &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-surface border-t border-gray-100 dark:border-card-border">
                <Link href="/tienda" onClick={() => setActiveDropdown(null)}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-sm font-bold text-primary hover:bg-primary/8 transition-colors">
                  Ver todos los productos &rarr;
                </Link>
              </div>
            </div>
          </div>
        );
      case "recetas":
        return (
          <Link key="recetas" href="/recetas" className={cn(navLinkCls, "flex items-center gap-1.5")}>
            <ChefHat className="h-4 w-4" /> Recetas
          </Link>
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
              <div className="overflow-hidden">
                <div className="mx-4 my-2 space-y-1">
                  {inicioMenuItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary/25 hover:bg-primary/5"
                    >
                      <span className="text-xl">{item.emoji}</span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted">{item.desc}</p>
                      </div>
                    </a>
                  ))}
                  {/* Categorías dentro del menú inicio mobile */}
                  <div className="pt-2 border-t border-gray-100">
                    <p className="px-1 pb-2 text-[10px] font-bold text-primary uppercase tracking-widest">Categorías</p>
                    <div className="grid grid-cols-2 gap-2">
                      {categoryMenuItems.map((cat) => (
                        <Link
                          key={cat.id}
                          href="/tienda"
                          onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); handleCategoryClick(cat.id); }}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:border-primary/20 hover:bg-primary/5"
                        >
                          <span className={cn("flex items-center justify-center h-8 w-8 rounded-lg text-lg shrink-0", cat.iconBg)}>
                            {cat.emoji}
                          </span>
                          <span className="text-xs font-bold text-foreground">{cat.label}</span>
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/tienda"
                      onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); }}
                      className="flex items-center justify-center gap-1.5 mt-2 py-2.5 rounded-xl bg-primary/8 text-sm font-bold text-primary"
                    >
                      Ver todos los productos →
                    </Link>
                  </div>
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
              aria-expanded={_mobileCatOpen}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-foreground font-medium hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <span>Categorías</span>
              <span className={cn("transition-transform duration-200 inline-block", _mobileCatOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4 text-muted" />
              </span>
            </button>
            {_mobileCatOpen && (
              <div className="mx-4 my-2 space-y-1">
                {categoryMenuItems.map((cat) => (
                  <div key={cat.id}>
                    <Link
                      href={`/tienda/categoria/${cat.id}`}
                      onClick={() => { setMobileOpen(false); setMobileCatOpen(false); handleCategoryClick(cat.id); }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-card-border hover:border-primary/25 hover:bg-primary/5"
                    >
                      <span className={cn("flex items-center justify-center h-9 w-9 rounded-xl text-lg shrink-0", cat.iconBg)}>
                        {cat.emoji}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{cat.label}</p>
                        <p className="text-xs text-muted">{cat.desc}</p>
                      </div>
                    </Link>
                  </div>
                ))}
                <Link
                  href="/tienda"
                  onClick={() => { setMobileOpen(false); setMobileCatOpen(false); }}
                  className="flex items-center justify-center gap-1.5 mt-2 py-2.5 rounded-xl bg-primary/8 text-sm font-bold text-primary"
                >
                  Ver todos los productos &rarr;
                </Link>
              </div>
            )}
          </div>
        );
      case "recetas":
        return (
          <Link key="recetas" href="/recetas" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <ChefHat className="h-4 w-4 text-[#f97316]" /> Recetas
          </Link>
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
          borderBottom: "1px solid rgba(45,106,79,0.18)",
        }),
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div
              className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl text-white shadow-lg overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #0f766e 0%, #0d5f58 50%, #1b4332 100%)",
                boxShadow: "0 4px 12px rgba(45, 106, 79, 0.35)"
              }}
            >
              {storeTheme?.logo ? (
                <Image src={storeTheme.logo} alt={storeTheme.name || businessName || "logo"} width={44} height={44} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-5 w-5 sm:h-6 sm:w-6" />
              )}
            </div>
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className={cn("text-base sm:text-xl font-bold leading-tight transition-colors",
                  scrolled ? "text-primary-dark" : "text-white")}>
                  {storeTheme?.name || businessName || "Mi Bodega"}
                </span>
                <span className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none tracking-wide border",
                  scrolled
                    ? "bg-amber-500/15 text-amber-700 border-amber-500/25 dark:bg-amber-400/15 dark:text-amber-400 dark:border-amber-400/25"
                    : "bg-amber-400/25 text-amber-200 border-amber-400/35"
                )}>
                  v1 Beta
                </span>
              </div>

            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-2 flex-1 min-w-0" ref={megaRef}>
            {navLinks.filter(l => l.visible).map(l => renderDesktopNavItem(l.id))}

            {/* Barra de búsqueda inline — en la nav, a la derecha de Tienda */}
            <div className="relative flex-1 min-w-0 mx-2" ref={inlineSearchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                style={{ color: scrolled ? "var(--color-muted)" : "rgba(255,255,255,0.55)" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setInlineSearchFocused(true)}
                onKeyDown={(e) => { if (e.key === "Enter") { handleSearchSubmit(); setInlineSearchFocused(false); } if (e.key === "Escape") { setInlineSearchFocused(false); setSearchQuery(""); } }}
                placeholder="¿Qué producto buscas?"
                autoComplete="off"
                className={cn(
                  "w-full pl-9 pr-8 py-2 rounded-xl text-sm font-medium outline-none",
                  scrolled
                    ? "bg-gray-100 text-foreground placeholder:text-muted focus:ring-2 focus:ring-primary/30"
                    : "bg-white/15 text-white border border-white/25 placeholder:text-white/50 focus:border-white/50 focus:bg-white/20"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setInlineSearchFocused(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {inlineSearchFocused && (suggestions.length > 0 || searchQuery.length === 0) && (
                <div className="absolute top-full mt-2 w-full min-w-72 bg-white dark:bg-card rounded-2xl shadow-xl border border-gray-100 dark:border-card-border overflow-hidden z-50 max-h-96 overflow-y-auto">
                  {/* Sugerencias al escribir */}
                  {suggestions.length > 0 && (
                    <div className="pt-2 pb-1">
                      <p className="px-4 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Sugerencias</p>
                      {suggestions.map((name) => (
                        <button
                          key={name}
                          onMouseDown={() => { handleSearchSelect(name); setInlineSearchFocused(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-primary/5 hover:text-primary text-left"
                        >
                          <Search className="h-3.5 w-3.5 text-muted shrink-0" />
                          <HighlightMatch text={name} query={searchQuery} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Panel de bienvenida — aparece cuando no hay texto */}
                  {searchQuery.length === 0 && (
                    <>
                      {/* Búsquedas recientes */}
                      {recentSearches.length > 0 && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100 dark:border-card-border first:border-t-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">🔥 Recientes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {recentSearches.slice(0, 4).map(term => (
                              <button
                                key={term}
                                onMouseDown={() => { handleSearchSelect(term); setInlineSearchFocused(false); }}
                                className="px-2.5 py-1 rounded-full bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Categorías */}
                      <div className="px-4 pt-3 pb-3 border-t border-gray-100 dark:border-card-border first:border-t-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Categorías</p>
                        <div className="grid grid-cols-2 gap-1">
                          {categoryMenuItems.slice(0, 8).map(cat => (
                            <button
                              key={cat.id}
                              onMouseDown={() => { setInlineSearchFocused(false); handleCategoryClick(cat.id); }}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-foreground hover:bg-primary/5 hover:text-primary transition-colors text-left"
                            >
                              <span className="text-lg leading-none">{cat.emoji}</span>
                              <span className="truncate text-xs">{cat.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Productos populares */}
                      {trendingProducts.length > 0 && (
                        <div className="px-4 pt-2 pb-3 border-t border-gray-100 dark:border-card-border">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
                            <Flame className="h-3 w-3 text-orange-500" /> Populares ahora
                          </p>
                          <div className="space-y-0.5">
                            {trendingProducts.slice(0, 3).map(p => (
                              <button
                                key={p.id}
                                onMouseDown={() => { handleSearchSelect(p.name); setInlineSearchFocused(false); }}
                                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl text-sm text-foreground hover:bg-primary/5 hover:text-primary text-left"
                              >
                                {p.image && (
                                  <Image src={p.image} alt="" width={28} height={28} className="h-7 w-7 rounded-lg object-cover bg-gray-100 shrink-0" unoptimized={p.image.startsWith("data:")} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="font-semibold text-xs block truncate">{p.name}</span>
                                  <span className="text-[10px] text-muted">S/{p.price.toFixed(2)}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Estado de pedido — desktop: solo icono, grande si hay pedido */}
            <button
              id="order-status-nav-btn"
              onClick={() => { setOrderStatusChanged(false); openOrderStatusModal(); }}
              title="Ver estado de tu pedido"
              className={cn(
                "relative flex items-center justify-center rounded-full transition-all shrink-0",
                hasActiveOrder
                  ? "h-11 w-11 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shadow-lg shadow-amber-400/30 hover:bg-amber-200"
                  : scrolled
                    ? "h-9 w-9 bg-primary/10 text-primary hover:bg-primary/20"
                    : "h-9 w-9 bg-white/15 text-white hover:bg-white/25"
              )}
            >
              <PackageCheck className={cn("shrink-0", hasActiveOrder ? "h-5.5 w-5.5" : "h-5 w-5")} />
              {hasActiveOrder && (
                <>
                  <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500">
                    {orderStatusChanged && <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping" />}
                  </span>
                </>
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

            {/* Loyalty points badge — desktop with tier glow animation */}
            {loyalty && customer && (
              <a
                href="/cuenta"
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full text-xs font-bold transition-all duration-300 px-2.5 py-1.5 group overflow-hidden",
                  scrolled
                    ? loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante"
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200 ring-1 ring-amber-300/50"
                      : loyalty.loyaltyTier === "plata"
                        ? "bg-gray-100 text-gray-600 hover:bg-gray-200 ring-1 ring-gray-300/50"
                        : "bg-secondary/15 text-secondary hover:bg-secondary/25"
                    : "bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25"
                )}
                title={`Nivel ${loyalty.loyaltyTier} · ${loyalty.loyaltyPoints} puntos`}
              >
                {/* Shimmer animation for gold/diamond tiers */}
                {(loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante") && (
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-linear-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
                )}
                <span className={cn(
                  "text-sm leading-none",
                  loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante" ? "animate-bounce" : ""
                )} style={loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante" ? { animationDuration: "2s" } : undefined}>
                  {loyalty.loyaltyTier === "diamante" ? "💎" : loyalty.loyaltyTier === "oro" ? "🥇" : loyalty.loyaltyTier === "plata" ? "🥈" : "🥉"}
                </span>
                <span className="relative">{loyalty.loyaltyPoints}</span>
                <Gift className="h-3 w-3 relative" />
              </a>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Search button — solo en mobile (desktop usa la barra grande de abajo) */}
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(
                "lg:hidden flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                scrolled
                  ? "text-foreground hover:bg-primary/10 hover:text-primary"
                  : "text-white/70 hover:text-white hover:bg-white/15"
              )}
              aria-label="Buscar productos"
              title="Buscar"
            >
              <Search className="h-4.5 w-4.5" />
            </button>

            {/* Cart */}
            <button
              onClick={toggle}
              className={cn(
                "relative flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200",
                scrolled
                  ? "bg-primary text-white shadow-lg hover:bg-primary-dark"
                  : "bg-white/20 backdrop-blur-sm text-white hover:bg-white/30"
              )}
              aria-label="Abrir carrito"
            >
              <span className={cartBounce ? "inline-block animate-[cartBounce_0.5s_ease-out]" : "inline-block"}>
                <ShoppingCart className="h-6 w-6" />
              </span>
              {/* Mejora 13: Badge con bounce animado al agregar items */}
              {count > 0 && (
                <span
                  key={count}
                  aria-live="polite"
                  aria-atomic="true"
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-md animate-[cartBadgeBounce_0.3s_ease-out]"
                  style={{ minWidth: count > 9 ? "1.5rem" : undefined }}
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

        {/* Category quick-strip — only on /tienda pages */}
        {(pathname === "/tienda" || pathname?.startsWith("/tienda/")) && (
        <div className="relative px-3 pb-2 pt-0 lg:border-t lg:border-white/10 lg:px-4">
          <button
            type="button"
            onClick={() => scrollCategoryStrip("left")}
            className={cn(
              "absolute left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-md transition-all lg:hidden",
              scrolled ? "border-gray-200 text-primary" : "border-white/35 text-white bg-black/20 backdrop-blur",
              canScrollCategoriesLeft ? "opacity-100" : "pointer-events-none opacity-30"
            )}
            aria-label="Mover categorías a la izquierda"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div ref={categoryStripRef} className="scrollbar-hide flex gap-3 overflow-x-auto px-7 lg:justify-center lg:px-0">
            {categoryMenuItems.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1 whitespace-nowrap px-3 py-1 text-xs font-bold transition-opacity",
                  scrolled ? "text-primary hover:opacity-70" : "text-white hover:opacity-70"
                )}
              >
                <span className="text-2xl leading-none">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
            <Link
              href="/tienda"
              onClick={() => {}}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1 whitespace-nowrap px-3 py-1 text-xs font-bold transition-opacity",
                scrolled ? "text-primary hover:opacity-70" : "text-white hover:opacity-70"
              )}
            >
              <span className="text-2xl leading-none">🔍</span>
              Ver todos
            </Link>
          </div>

          <button
            type="button"
            onClick={() => scrollCategoryStrip("right")}
            className={cn(
              "absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-md transition-all lg:hidden",
              scrolled ? "border-gray-200 text-primary" : "border-white/35 text-white bg-black/20 backdrop-blur",
              canScrollCategoriesRight ? "opacity-100" : "pointer-events-none opacity-30"
            )}
            aria-label="Mover categorías a la derecha"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        )}
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
              {/* Buscador — mobile */}
              <div className="relative mb-3">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && searchQuery.trim()) { handleSearchSubmit(); setMobileOpen(false); } }}
                  placeholder="¿Qué producto buscas?"
                  autoComplete="off"
                  className="w-full pl-10 pr-10 py-3 rounded-2xl text-sm font-medium bg-gray-100 text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-primary/30"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                    aria-label="Limpiar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute top-full mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                    {suggestions.map((name) => (
                      <button
                        key={name}
                        onMouseDown={() => { handleSearchSelect(name); setMobileOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-primary/5 hover:text-primary text-left"
                      >
                        <Search className="h-3.5 w-3.5 text-muted shrink-0" />
                        <HighlightMatch text={name} query={searchQuery} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

                {/* Loyalty — mobile with tier animation */}
                {loyalty && customer && (
                  <a
                    href="/cuenta"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "relative flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors overflow-hidden",
                      loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante"
                        ? "bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400 hover:bg-amber-100"
                        : loyalty.loyaltyTier === "plata"
                          ? "bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                          : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                    )}
                  >
                    {(loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante") && (
                      <span className="absolute inset-0 -translate-x-full animate-[shimmer_3s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                    )}
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
                {/* X4: Voice search button */}
                <button
                  onClick={startVoiceSearch}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    listening
                      ? "bg-red-100 dark:bg-red-900/30 text-red-500 animate-pulse"
                      : "hover:bg-gray-100 dark:hover:bg-surface text-muted"
                  )}
                  aria-label="Búsqueda o pedido por voz"
                  title="Buscar o pedir por voz (ej: 'agrega 2 cerveza')"
                >
                  <Mic className="h-5 w-5" />
                </button>
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

              {/* No results state */}
              {searchQuery.trim().length >= 2 && suggestions.length === 0 && (
                <div className="mt-3 border-t border-gray-100 dark:border-card-border pt-4 text-center">
                  <p className="text-sm font-bold text-foreground">No encontramos &ldquo;{searchQuery.trim()}&rdquo;</p>
                  <p className="text-xs text-muted mt-1">Prueba con otro término o explora nuestras categorías</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-3">
                    {categoryMenuItems.slice(0, 4).map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => { setSearchOpen(false); handleCategoryClick(cat.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-gray-200 dark:border-card-border text-xs font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <span>{cat.emoji}</span> {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AC4: Trending / recent searches */}
              {searchQuery.length === 0 && recentSearches.length > 0 && (
                <div className="mt-3 border-t border-gray-100 dark:border-card-border pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">🔥 Búsquedas recientes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map(term => (
                      <button
                        key={term}
                        onClick={() => handleSearchSelect(term)}
                        className="px-3 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending products — popular items being added to cart */}
              {searchQuery.length === 0 && trendingProducts.length > 0 && (
                <div className="mt-3 border-t border-gray-100 dark:border-card-border pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
                    <Flame className="h-3 w-3 text-orange-500" /> Productos populares ahora
                  </p>
                  <div className="space-y-1">
                    {trendingProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSearchSelect(p.name)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-foreground hover:bg-primary/5 hover:text-primary transition-colors text-left"
                      >
                        {p.image && (
                          <Image src={p.image} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover bg-gray-100 shrink-0" unoptimized={p.image.startsWith("data:")} />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-xs block truncate">{p.name}</span>
                          <span className="text-[10px] text-muted">S/{p.price.toFixed(2)}</span>
                        </div>
                        <Flame className="h-3 w-3 text-orange-400 shrink-0" />
                      </button>
                    ))}
                  </div>
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
      {/* Voice ordering confirmation toast */}
      {voiceResult && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-bounce">
          ✅ {voiceResult.qty}x {voiceResult.product} agregado al carrito
        </div>
      )}
    </header>
  );
}

