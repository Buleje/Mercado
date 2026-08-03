"use client";

import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu, X, ShoppingCart, Store,
  ChevronDown, ChevronLeft, ChevronRight, Leaf, Package, Beef, Milk, GlassWater, Sparkles, UserCircle, Settings,
  Search, Trophy, History, PackageCheck, User, Mic, Flame, ChefHat, Globe, ClipboardList,
  Home, Zap, RotateCw, Star, Phone, ShoppingBag, Tag, MapPin, Compass, Wallet,
  Bell, AlertCircle, CheckCheck, ArrowRight, Info,
  type LucideIcon,
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
import { BulejeMark } from "@/components/ui-system/illustrations";

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

interface CategoryItem {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  subs: string[];
  iconBg: string;
  iconColor: string;
}

const categoryMenuItems: CategoryItem[] = [
  { id: "frutas-verduras", label: "Frutas y Verduras", icon: Leaf,
    desc: "Productos frescos del día",
    subs: ["Frutas", "Verduras", "Tubérculos", "Hierbas"],
    iconBg: "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
    iconColor: "text-gray-700 dark:text-gray-200" },
  { id: "abarrotes", label: "Abarrotes", icon: Package,
    desc: "Arroz, fideos, aceite y más",
    subs: ["Arroz", "Aceite", "Azúcar", "Fideos", "Enlatados"],
    iconBg: "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
    iconColor: "text-gray-700 dark:text-gray-200" },
  { id: "carnes", label: "Carnes", icon: Beef,
    desc: "Carnes frescas de calidad",
    subs: ["Pollo", "Res", "Cerdo", "Pescado"],
    iconBg: "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
    iconColor: "text-gray-700 dark:text-gray-200" },
  { id: "lacteos", label: "Lácteos", icon: Milk,
    desc: "Leche, queso, yogurt",
    subs: ["Leche", "Queso", "Yogurt", "Mantequilla"],
    iconBg: "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
    iconColor: "text-gray-700 dark:text-gray-200" },
  { id: "bebidas", label: "Bebidas", icon: GlassWater,
    desc: "Agua, gaseosas, jugos",
    subs: ["Gaseosas", "Agua", "Jugos", "Cervezas"],
    iconBg: "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
    iconColor: "text-gray-700 dark:text-gray-200" },
  { id: "limpieza", label: "Limpieza", icon: Sparkles,
    desc: "Todo para tu hogar limpio",
    subs: ["Detergente", "Jabón", "Lejía", "Desinfectante"],
    iconBg: "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800",
    iconColor: "text-gray-700 dark:text-gray-200" },
];

interface InicioItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  desc: string;
}

const inicioMenuItems: InicioItem[] = [
  { id: "inicio-top", label: "Página Principal", icon: Home, href: "/", desc: "Volver al inicio" },
  { id: "beneficios", label: "Beneficios", icon: Zap, href: "#beneficios", desc: "¿Por qué elegirnos?" },
  { id: "como-funciona", label: "Cómo Funciona", icon: RotateCw, href: "#como-funciona", desc: "Pasos para pedir" },
  { id: "reseñas", label: "Reseñas", icon: Star, href: "#reseñas", desc: "Lo que dicen nuestros clientes" },
  { id: "contacto", label: "Contacto", icon: Phone, href: "#contacto", desc: "Escríbenos" },
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
  const [suggestions, setSuggestions] = useState<{ name: string; image?: string; price: number; stock?: number; id: number }[]>([]);
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const [inlineSearchFocused, setInlineSearchFocused] = useState(false);
  const inlineSearchRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [orderStatusChanged, setOrderStatusChanged] = useState(false);
  const [_isAdmin, setIsAdmin] = useState(false);
  /* X4: Voice search + ordering */
  const [listening, setListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState<{ type: "added"; product: string; qty: number } | null>(null);
  const categoryStripRef = useRef<HTMLDivElement>(null);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false);

  /* AC4: Track recent searches for trending suggestions */
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("buleje-recent-searches") || "[]").slice(0, 5); } catch { return []; }
  });
  const recordSearch = useCallback((term: string) => {
    setRecentSearches(prev => {
      const next = [term, ...prev.filter(s => s.toLowerCase() !== term.toLowerCase())].slice(0, 5);
      try { localStorage.setItem("buleje-recent-searches", JSON.stringify(next)); } catch { /* silent */ }
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

  // Categories with actual products — filter out empties
  const [activeCategoryIds, setActiveCategoryIds] = useState<Set<string> | null>(null);

  // Load products from API + levenshtein lazily after mount
  useEffect(() => {
    void Promise.all([
      fetch("/api/products").then(r => r.ok ? r.json() : []).catch(() => []),
      import("@/hooks/use-advanced-search"),
    ]).then(([apiProducts, { levenshteinDistance: ld }]) => {
      const raw = Array.isArray(apiProducts) ? apiProducts : [];
      const p: Product[] = raw.filter((x: Record<string, unknown>) => x.active !== false).map((x: Record<string, unknown>) => ({
        id: x.id as number, name: x.name as string, category: x.category as string,
        price: x.price as number, image: x.image as string, unit: (x.unit as string) ?? "",
        badge: x.badge as string | undefined, stock: x.stock as number | undefined,
      }));
      productsRef.current = p;
      levenshteinRef.current = ld;

      // Build set of categories that have at least 1 product
      const catIds = new Set(p.map((prod: Product) => prod.category).filter(Boolean));
      setActiveCategoryIds(catIds);

      // Populate trending products once data is available
      try {
        const now = Date.now();
        const data: Record<string, number[]> = JSON.parse(localStorage.getItem("buleje-selling-fast") || "{}");
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

  // Only show categories that have at least 1 product
  const filteredCategories = useMemo(
    () => activeCategoryIds ? categoryMenuItems.filter(cat => activeCategoryIds.has(cat.id)) : categoryMenuItems,
    [activeCategoryIds]
  );

  const userMenuRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const prevOrderStatus = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  // Tienda individual del comerciante: oculta enlaces cross-store al
  // marketplace (Explorar, Recetas, Marketplace) cuando estamos bajo
  // `/t/<slug>/...`. La página propia del negocio no debe llevar al cliente
  // hacia el marketplace cross-vendor.
  const isTenantStore = pathname?.startsWith("/t/") ?? false;
  const tenantSlug = isTenantStore ? pathname?.match(/^\/t\/([^/]+)/)?.[1] ?? null : null;
  // Prefija paths internos con `/t/<slug>` cuando estamos en la tienda
  // individual, para que el cliente no salga del contexto del comercio al
  // navegar entre /tienda, /cuenta, /tracking, etc. Anchors (#foo) y URLs
  // externas se devuelven sin tocar.
  const tenantPath = (path: string): string => {
    if (!isTenantStore || !tenantSlug) return path;
    if (!path || path.startsWith("#") || path.startsWith("http")) return path;
    if (path.startsWith(`/t/${tenantSlug}`)) return path;
    if (path === "/") return `/t/${tenantSlug}`;
    return `/t/${tenantSlug}${path}`;
  };
  const { count, toggle, addItem } = useCart();
  const { customer, openModal: openCustomerModal, openAccountModal, openOrderStatusModal, clear } = useCustomer();
  const { navLinks: storedNavLinks, businessName, storeTheme } = useSettings();
  const { resolved: _theme, toggle: _toggleTheme } = useTheme();
  const megaRef = useRef<HTMLDivElement>(null);
  const baseNavLinks = storedNavLinks?.length ? storedNavLinks : DEFAULT_NAV_LINKS;

  // Brandon mayo 2026: en /t/[slug]/tienda inyectamos un link "Información"
  // al inicio del nav para que el cliente pueda volver al landing del tenant
  // (/t/[slug]) sin perder navegación. Solo se inyecta si NO existe ya.
  const isOnTenantStore = pathname?.startsWith(`/t/${tenantSlug}/tienda`) ?? false;
  const navLinks = (() => {
    if (!isOnTenantStore || !tenantSlug) return baseNavLinks;
    const hasInfoLink = baseNavLinks.some((l) => l.id === "tenant-info");
    if (hasInfoLink) return baseNavLinks;
    return [
      {
        id: "tenant-info",
        label: "Información",
        icon: "info" as const,
        href: `/t/${tenantSlug}`,
        visible: true,
      } as unknown as (typeof baseNavLinks)[number],
      ...baseNavLinks,
    ];
  })();

  // Loyalty data
  const [loyalty, setLoyalty] = useState<{ loyaltyPoints: number; loyaltyTier: string; totalSpent: number } | null>(null);

  // Notification inbox
  type NotifItem = { id: string; type: string; title: string; body: string; link?: string; read: boolean; createdAt: string };
  const [notifOpen, setNotifOpen] = useState(false);
  const [_notifs, setNotifs] = useState<NotifItem[]>([]);
  const [_unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // Fetch notifications when customer exists.
  // FIX 2026-05-07 v2: ANTES (v1) había race entre el fetch async y el
  // setInterval — si el primer fetch daba 401, el intervalo SÍ se iniciaba
  // y seguía spammeando. Además StrictMode dev re-ejecuta efectos y
  // hot-reload re-monta el componente.
  // Solución: flag persistente en sessionStorage. Si la sesión expiró una
  // vez, NINGÚN futuro mount/render dispara fetchs hasta que el cliente
  // limpie el flag (al re-loguearse, customer-context lo limpia).
  useEffect(() => {
    if (!customer?.phone) return;
    const phone = customer.phone;
    const sessionKey = `customer-notifs-401:${phone}`;

    // Si ya recibimos 401 en otro mount, no intentar de nuevo.
    if (typeof window !== "undefined") {
      try {
        if (sessionStorage.getItem(sessionKey) === "1") return;
      } catch { /* sessionStorage bloqueado — continuar */ }
    }

    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchNotifs = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/customer-notifications?phone=${encodeURIComponent(phone)}`, {
          credentials: "include",
        });
        if (stopped) return;
        if (r.status === 401 || r.status === 403) {
          // Session expirada — detener polling para SIEMPRE en este browser
          // hasta que el customer se vuelva a loguear.
          stopped = true;
          setNotifs([]);
          setUnreadCount(0);
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          try { sessionStorage.setItem(sessionKey, "1"); } catch { /* ignore */ }
          return;
        }
        if (r.ok) {
          const data = await r.json();
          setNotifs(data.notifications ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch { /* silent — error red transitorio */ }
    };

    // Brandon 2026-05-27 (audit perf): guard de visibilidad — sin polleo en background.
    const start = () => { if (!interval) interval = setInterval(fetchNotifs, 60000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVis = () => {
      if (document.visibilityState === "visible") { fetchNotifs(); start(); }
      else stop();
    };
    fetchNotifs();
    if (typeof document === "undefined" || document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
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
    await fetch(`/api/customer-notifications?phone=${encodeURIComponent(customer.phone!)}&all=1`, { method: "PATCH", headers: csrfHeaders() });
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Detectar si hay cookie de admin para mostrar enlace al panel
  useEffect(() => {
    setIsAdmin(document.cookie.includes("buleje-admin-sess"));
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

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  // Check for active order
  useEffect(() => {
    const checkOrder = () => {
      try {
        const raw = localStorage.getItem("buleje-active-order");
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
    // Brandon 2026-05-27 (audit perf): guard de visibilidad — sin polleo en background.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(checkOrder, 30_000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVis = () => {
      if (document.visibilityState === "visible") { checkOrder(); start(); }
      else stop();
    };
    checkOrder();
    if (typeof document === "undefined" || document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("buleje:orderCreated", checkOrder);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("buleje:orderCreated", checkOrder);
    };
  }, []);

  // Fetch loyalty data when customer phone is available.
  // Pre-check session — sin auth no llamamos endpoints protegidos para evitar
  // que el 401 aparezca en consola del browser.
  useEffect(() => {
    if (!customer?.phone) { startTransition(() => setLoyalty(null)); return; }
    const phone = customer.phone.replace(/\D/g, "").slice(-9);
    if (phone.length < 6) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await fetch("/api/auth/customer/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled || !auth.ok) return;
        const authData = await auth.json();
        if (!authData?.authenticated) return;
        const r = await fetch(`/api/loyalty/${phone}`, { credentials: "include" });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled || !data) return;
        startTransition(() => setLoyalty(data));
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [customer?.phone]);

  // Search autocomplete — fuzzy with Levenshtein typo tolerance (debounced)
  useEffect(() => {
    if (searchQuery.trim().length < 1) { startTransition(() => setSuggestions([])); return; }
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
        return { name: prod.name, image: prod.image, price: prod.price, stock: prod.stock, id: prod.id, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ score: _s, ...rest }) => rest);
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
    scrolled ? "text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10"
  );

  // Helper: resuelve active state basado en el pathname actual.
  // /tienda + /tienda/* → "tienda"; /recetas → "recetas"; etc.
  const isNavActive = (id: string): boolean => {
    if (!pathname) return false;
    if (id === "tienda") return pathname.startsWith("/tienda");
    if (id === "ofertas") return pathname.startsWith("/tienda") && pathname.includes("ofertas");
    if (id === "recetas") return pathname.startsWith("/recetas");
    if (id === "marketplace") return pathname.startsWith("/marketplace");
    if (id === "historial") return pathname.startsWith("/cuenta/historial");
    if (id === "inicio") return pathname === "/";
    return false;
  };

  const activeNavCls = cn(
    "after:content-[''] after:absolute after:left-4 after:right-4 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[var(--accent)]",
    scrolled ? "text-[var(--accent)]" : "text-white",
  );

  const renderDesktopNavItem = (id: string) => {
    switch (id) {
      case "inicio":
        // Tienda individual: el dropdown "Inicio" del marketplace no aplica
        // — el cliente solo necesita Comprar + Ofertas + búsqueda.
        if (isTenantStore) return null;
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
                scrolled ? "text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5" : "text-white/90 hover:text-white hover:bg-white/10",
                inicioOpen && (scrolled ? "text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/8" : "text-white bg-white/15")
              )}
            >
              Inicio
              <ChevronDown className={cn("h-3.5 w-3.5", inicioOpen && "rotate-180")} />
            </button>
            <div
              onMouseEnter={cancelClose}
              onMouseLeave={closeDropdown}
              className={cn(
                "absolute top-full left-0 mt-2 z-[60] w-145 min-w-135 bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] overflow-hidden",
                inicioOpen ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
              )}
            >
              {/* Sección navegación */}
              <div className="px-4 py-3 border-b border-gray-100 bg-linear-to-r from-primary/5 to-primary/5">
                <p className="text-[length:var(--ts-2xs)] font-bold text-primary uppercase tracking-widest">Navegación</p>
              </div>
              <div className="grid grid-cols-2 gap-1 p-2.5">
                {inicioMenuItems.map((item) => {
                  const IIcon = item.icon;
                  return (
                    <a
                      key={item.id}
                      href={tenantPath(item.href)}
                      onClick={() => setActiveDropdown(null)}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-gray-700 group"
                    >
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 shrink-0 group-hover:bg-gray-100 dark:group-hover:bg-gray-800">
                        <IIcon className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <div>
                        <p className="font-extrabold tracking-tight text-sm text-[var(--text-primary)] group-hover:text-primary">{item.label}</p>
                        <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">{item.desc}</p>
                      </div>
                    </a>
                  );
                })}
              </div>
              {/* Sección categorías */}
              <div className="px-4 py-3 border-t border-b border-gray-100 bg-linear-to-r from-primary/5 to-primary/5">
                <div className="flex items-center justify-between">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-primary uppercase tracking-widest">Categorías</p>
                  <span className="text-[length:var(--ts-2xs)] text-muted font-medium">{filteredCategories.length} secciones</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 p-2.5">
                {filteredCategories.map((cat) => {
                  const CIcon = cat.icon;
                  return (
                    <Link
                      key={cat.id}
                      href={tenantPath("/tienda")}
                      onClick={() => { setActiveDropdown(null); handleCategoryClick(cat.id); }}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-900 group"
                    >
                      <span className={cn("flex items-center justify-center h-9 w-9 rounded-lg shrink-0", cat.iconBg, cat.iconColor)}>
                        <CIcon className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <div>
                        <p className="font-extrabold tracking-tight text-xs text-[var(--text-primary)] group-hover:text-primary">{cat.label}</p>
                        <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">{cat.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="px-3 py-2.5 bg-linear-to-r from-primary/5 to-primary/5 border-t border-gray-100">
                <Link href={tenantPath("/tienda")} onClick={() => setActiveDropdown(null)}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/8">
                  Ver todos los productos →
                </Link>
              </div>
            </div>
          </div>
        );
      case "tienda":
        return (
          <Link key="tienda" href={tenantPath("/tienda")} className={cn(navLinkCls, "flex items-center gap-1.5 relative", isNavActive("tienda") && activeNavCls)}>
            <ShoppingBag className="h-4 w-4" strokeWidth={1.75} /> Tienda
          </Link>
        );
      case "tenant-info":
        // Brandon mayo 2026: link inyectado automaticamente cuando estamos en
        // /t/[slug]/tienda. Vuelve al landing del tenant /t/[slug] con info,
        // horarios, sobre nosotros, etc.
        if (!tenantSlug) return null;
        return (
          <Link
            key="tenant-info"
            href={`/t/${tenantSlug}`}
            className={cn(navLinkCls, "flex items-center gap-1.5 relative")}
          >
            <Info className="h-4 w-4" strokeWidth={1.75} /> Información
          </Link>
        );
      case "explorar":
        // Hub de descubrimiento del marketplace — fuera de la tienda individual.
        if (isTenantStore) return null;
        return (
          <Link key="explorar" href="/marketplace/explorar" className={cn(navLinkCls, "flex items-center gap-1.5 relative")}>
            <Compass className="h-4 w-4" strokeWidth={1.75} /> Explorar
          </Link>
        );
      case "ofertas":
        // Hub de ofertas cross-store del marketplace — fuera de la tienda individual.
        if (isTenantStore) return null;
        return (
          <Link key="ofertas" href="/marketplace/ofertas" className={cn(navLinkCls, "flex items-center gap-1.5 relative", isNavActive("ofertas") && activeNavCls)}>
            <Tag className="h-4 w-4" strokeWidth={1.75} /> Ofertas
          </Link>
        );
      case "como-pagar":
        // Página informativa cross-store — la tienda individual ya tiene su footer con métodos.
        if (isTenantStore) return null;
        return (
          <Link key="como-pagar" href="/marketplace/como-pagar" className={cn(navLinkCls, "flex items-center gap-1.5 relative")}>
            <Wallet className="h-4 w-4" strokeWidth={1.75} /> Cómo pagar
          </Link>
        );
      case "tiendas":
        // Directorio multi-tienda — fuera de la tienda individual (es un entorno autónomo del dueño).
        if (isTenantStore) return null;
        return (
          <Link key="tiendas" href="/tiendas" className={cn(navLinkCls, "flex items-center gap-1.5 relative", isNavActive("tiendas") && activeNavCls)}>
            <Store className="h-4 w-4" strokeWidth={1.75} /> Tiendas
          </Link>
        );
      case "a-domicilio":
        // Tienda individual: oculto. La info de delivery vive en el footer
        // y en el hero — no necesita doblarse en el navbar.
        if (isTenantStore) return null;
        return (
          <Link key="a-domicilio" href={tenantPath("/") + "#a-domicilio"} className={cn(navLinkCls, "flex items-center gap-1.5 relative")}>
            <MapPin className="h-4 w-4" strokeWidth={1.75} /> A domicilio
          </Link>
        );
      case "categorias":
        return null;
      case "recetas":
        // Recetario es contenido cross-store del marketplace — ocultar en tienda individual.
        if (isTenantStore) return null;
        return (
          <Link key="recetas" href="/recetas" className={cn(navLinkCls, "flex items-center gap-1.5 relative", isNavActive("recetas") && activeNavCls)}>
            <ChefHat className="h-4 w-4" strokeWidth={1.75} /> Recetas
          </Link>
        );
      case "marketplace":
        // Acceso al marketplace cross-vendor — ocultar en tienda individual.
        if (isTenantStore) return null;
        return (
          <Link key="marketplace" href="/marketplace" className={cn(navLinkCls, "flex items-center gap-1.5 relative", isNavActive("marketplace") && activeNavCls)}>
            <Globe className="h-4 w-4" strokeWidth={1.75} /> Marketplace
          </Link>
        );
      case "historial":
        // Historial nav link removido — el cliente accede al historial via
        // "Mi panel" → "Pedidos" en el menú de usuario para reducir clutter.
        return null;
      default:
        return null;
    }
  };

  const renderMobileNavItem = (id: string) => {
    const cls = "block px-4 py-3 rounded-xl text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] font-medium hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors";
    switch (id) {
      case "inicio":
        if (isTenantStore) return null;
        return (
          <div key="inicio">
            <button
              onClick={() => setMobileInicioOpen((o) => !o)}
              aria-expanded={mobileInicioOpen}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] font-medium hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
            >
              <span>Inicio</span>
              <span className={cn("transition-transform duration-[var(--dur-fast)] inline-block", mobileInicioOpen && "rotate-180")}>
                <ChevronDown className="h-4 w-4 text-muted" />
              </span>
            </button>
            {mobileInicioOpen && (
              <div className="overflow-hidden">
                <div className="mx-4 my-2 space-y-1">
                  {inicioMenuItems.map((item) => {
                    const IIcon = item.icon;
                    return (
                      <a
                        key={item.id}
                        href={item.href}
                        onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); }}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500"
                      >
                        <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 shrink-0">
                          <IIcon className="h-4 w-4" strokeWidth={1.5} />
                        </span>
                        <div>
                          <p className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">{item.label}</p>
                          <p className="text-xs text-muted">{item.desc}</p>
                        </div>
                      </a>
                    );
                  })}
                  {/* Categorías dentro del menú inicio mobile */}
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                    <p className="px-1 pb-2 text-[length:var(--ts-2xs)] font-bold text-gray-400 uppercase tracking-[var(--ls-wider)]">Categorías</p>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredCategories.map((cat) => {
                        const CIcon = cat.icon;
                        return (
                          <Link
                            key={cat.id}
                            href={tenantPath("/tienda")}
                            onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); handleCategoryClick(cat.id); }}
                            className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500"
                          >
                            <span className={cn("flex items-center justify-center h-8 w-8 rounded-lg shrink-0", cat.iconBg, cat.iconColor)}>
                              <CIcon className="h-4 w-4" strokeWidth={1.5} />
                            </span>
                            <span className="text-xs font-extrabold tracking-tight text-[var(--text-primary)]">{cat.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                    <Link
                      href={tenantPath("/tienda")}
                      onClick={() => { setMobileOpen(false); setMobileInicioOpen(false); }}
                      className="flex items-center justify-center gap-1.5 mt-2 py-2.5 rounded-xl bg-primary/8 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
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
        return (
          <Link key="tienda" href={tenantPath("/tienda")} onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <ShoppingBag className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Tienda
          </Link>
        );
      case "explorar":
        if (isTenantStore) return null;
        return (
          <Link key="explorar" href="/marketplace/explorar" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <Compass className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Explorar
          </Link>
        );
      case "ofertas":
        if (isTenantStore) return null;
        return (
          <Link key="ofertas" href="/marketplace/ofertas" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <Tag className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Ofertas
          </Link>
        );
      case "como-pagar":
        if (isTenantStore) return null;
        return (
          <Link key="como-pagar" href="/marketplace/como-pagar" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <Wallet className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Cómo pagar
          </Link>
        );
      case "tiendas":
        if (isTenantStore) return null;
        return (
          <Link key="tiendas" href="/tiendas" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <Store className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Tiendas
          </Link>
        );
      case "a-domicilio":
        if (isTenantStore) return null;
        return (
          <Link key="a-domicilio" href={tenantPath("/") + "#a-domicilio"} onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <MapPin className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> A domicilio
          </Link>
        );
      case "categorias":
        return null;
      case "recetas":
        if (isTenantStore) return null;
        return (
          <Link key="recetas" href="/recetas" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <ChefHat className="h-4 w-4 text-secondary" /> Recetas
          </Link>
        );
      case "marketplace":
        if (isTenantStore) return null;
        return (
          <Link key="marketplace" href="/marketplace" onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <Globe className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Marketplace
          </Link>
        );
      case "historial":
        return (
          <Link key="historial" href={tenantPath("/cuenta/historial")} onClick={() => setMobileOpen(false)} className={cn(cls, "flex items-center gap-2")}>
            <History className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} /> Historial
          </Link>
        );
      default:
        return null;
    }
  };

  return (
    <header
      className={cn(
        "store-header fixed left-0 right-0 z-50",
        announcementVisible ? "top-11" : "top-0",
        scrolled
          ? "bg-white/97 backdrop-blur-md shadow-[var(--shadow-lg)] dark:bg-[var(--surface-raised)]/97"
          : ""
      )}
      style={{
        transition: scrolled
          ? "background 0.4s ease, box-shadow 0.4s ease, top 0.35s cubic-bezier(0.4,0,0.2,1)"
          : "background 0.4s ease, top 0.35s cubic-bezier(0.4,0,0.2,1)",
        ...(scrolled ? {} : {
          background: "rgba(6,10,13,0.72)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }),
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">

          {/* Logo */}
          <Link href={tenantPath("/")} className="flex items-center gap-2.5 shrink-0">
            <div
              className={cn(
                "flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg overflow-hidden transition-colors",
                scrolled
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-white/10 text-white border border-white/15",
              )}
            >
              {storeTheme?.logo ? (
                <Image src={storeTheme.logo} alt={storeTheme.name || businessName || "logo"} width={40} height={40} className="h-full w-full object-cover" />
              ) : (
                <BulejeMark size={22} strokeWidth={1.75} />
              )}
            </div>
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center gap-1.5">
                {/* Logo name sin badge "v1 Beta" — aura profesional, confianza B2C.
                    Fallback chain: storeTheme.storeName → storeTheme.name →
                    businessName → "Buleje". El primero es el campo real
                    que el dueño edita desde el admin. */}
                <span className={cn("text-base sm:text-xl font-bold leading-tight transition-colors",
                  scrolled ? "text-primary-dark" : "text-white")}>
                  {(storeTheme as { storeName?: string } | null)?.storeName
                    || storeTheme?.name
                    || businessName
                    || "Buleje"}
                </span>
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-2 flex-1 min-w-0" ref={megaRef}>
            {navLinks.filter(l => l.visible).map(l => renderDesktopNavItem(l.id))}

            {/* Barra de búsqueda inline — protagonista en tienda individual.
                Tamaño grande (py-3 + text-base) cuando es tienda individual:
                el cliente entra a buscar producto, no a navegar el menú. */}
            <div
              className={cn(
                "relative min-w-0",
                isTenantStore ? "flex-[2] mx-3" : "flex-1 mx-2",
              )}
              ref={inlineSearchRef}
            >
              <Search
                className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none",
                  isTenantStore ? "h-5 w-5" : "h-4 w-4",
                )}
                style={{ color: scrolled ? "var(--color-muted)" : "rgba(255,255,255,0.55)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setInlineSearchFocused(true)}
                onKeyDown={(e) => { if (e.key === "Enter") { handleSearchSubmit(); setInlineSearchFocused(false); } if (e.key === "Escape") { setInlineSearchFocused(false); setSearchQuery(""); } }}
                placeholder="Buscar arroz, leche, cerveza…"
                autoComplete="off"
                className={cn(
                  "w-full rounded-xl font-medium outline-none transition-all",
                  isTenantStore ? "pl-11 pr-10 py-3 text-base" : "pl-9 pr-8 py-2 text-sm",
                  scrolled
                    ? "bg-gray-100 text-[var(--text-primary)] placeholder:text-muted focus:ring-2 focus:ring-primary/30"
                    : "bg-white/15 text-white border border-white/25 placeholder:text-white/50 focus:border-white/50 focus:bg-white/20"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setInlineSearchFocused(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text-primary)]"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {inlineSearchFocused && (suggestions.length > 0 || searchQuery.length === 0) && (
                <div className="absolute top-full mt-2 w-full min-w-72 bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] overflow-hidden z-50 max-h-96 overflow-y-auto">
                  {/* Sugerencias al escribir — con imagen, precio y stock */}
                  {suggestions.length > 0 && (
                    <div className="pt-2 pb-1">
                      <p className="px-4 pt-1 pb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted">Sugerencias</p>
                      {suggestions.map((item) => (
                        <button
                          key={item.id}
                          onMouseDown={() => { handleSearchSelect(item.name); setInlineSearchFocused(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 text-left transition-colors"
                        >
                          {item.image ? (
                            <Image src={item.image} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover bg-gray-100 dark:bg-surface shrink-0 border border-[var(--rule-base)]" unoptimized={item.image.startsWith("data:")} />
                          ) : (
                            <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-surface flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-sm block truncate"><HighlightMatch text={item.name} query={searchQuery} /></span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-bold text-primary">S/{Number(item.price).toFixed(2)}</span>
                              {(item.stock ?? 0) > 0 ? (
                                <span className={cn("text-[length:var(--ts-2xs)] font-semibold px-1.5 py-0.5 rounded-full", (item.stock ?? 0) <= 5 ? "bg-amber-100 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-400")}>
                                  {(item.stock ?? 0) <= 5 ? `¡Solo ${item.stock}!` : "Disponible"}
                                </span>
                              ) : (
                                <span className="text-[length:var(--ts-2xs)] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-[var(--data-error-700)] dark:bg-red-900/30 dark:text-red-400">Agotado</span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Panel de bienvenida — aparece cuando no hay texto */}
                  {searchQuery.length === 0 && (
                    <>
                      {/* Búsquedas recientes */}
                      {recentSearches.length > 0 && (
                        <div className="px-4 pt-3 pb-2 border-t border-[var(--rule-base)] first:border-t-0">
                          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2 inline-flex items-center gap-1.5"><Flame className="h-3 w-3" aria-hidden /> Recientes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {recentSearches.slice(0, 4).map(term => (
                              <button
                                key={term}
                                onMouseDown={() => { handleSearchSelect(term); setInlineSearchFocused(false); }}
                                className="px-2.5 py-1 rounded-full bg-primary/5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/15 transition-colors"
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Categorías */}
                      <div className="px-4 pt-3 pb-3 border-t border-[var(--rule-base)] first:border-t-0">
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-3">Categorías</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {filteredCategories.slice(0, 8).map(cat => {
                            const CIcon = cat.icon;
                            return (
                              <button
                                key={cat.id}
                                onMouseDown={() => { setInlineSearchFocused(false); handleCategoryClick(cat.id); }}
                                className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-left"
                              >
                                {/* Sin caja-icono en tienda individual. */}
                                {!isTenantStore && (
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 shrink-0">
                                    <CIcon className="h-4 w-4" strokeWidth={1.5} />
                                  </span>
                                )}
                                <span className="truncate text-sm font-extrabold tracking-tight">{cat.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Productos populares */}
                      {trendingProducts.length > 0 && (
                        <div className="px-4 pt-2 pb-3 border-t border-[var(--rule-base)]">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-3 flex items-center gap-1.5">
                            <Flame className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.75} /> Populares ahora
                          </p>
                          <div className="space-y-1">
                            {trendingProducts.slice(0, 3).map(p => (
                              <button
                                key={p.id}
                                onMouseDown={() => { handleSearchSelect(p.name); setInlineSearchFocused(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/8 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] text-left"
                              >
                                {p.image && (
                                  <Image src={p.image} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover bg-gray-100 shrink-0" unoptimized={p.image.startsWith("data:")} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="font-bold text-sm block truncate">{p.name}</span>
                                  <span className="text-xs text-muted font-semibold">S/{Number(p.price).toFixed(2)}</span>
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
                  ? "h-11 w-11 bg-amber-100 dark:bg-amber-900/40 text-[var(--data-warning-600)] dark:text-amber-400 shadow-[var(--shadow-lg)] shadow-md/30 hover:bg-amber-200"
                  : scrolled
                    ? "h-9 w-9 bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20"
                    : "h-9 w-9 bg-white/15 text-white hover:bg-white/25"
              )}
            >
              <PackageCheck className={cn("shrink-0", hasActiveOrder ? "h-5.5 w-5.5" : "h-5 w-5")} />
              {hasActiveOrder && (
                <>
                  <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]">
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
                  "flex items-center gap-2 rounded-full text-sm font-semibold transition-all duration-[var(--dur-fast)] px-3 py-2 ml-1",
                  scrolled
                    ? customer
                      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20"
                      : "bg-gray-100 text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:text-[var(--accent)]"
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
                <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--surface-raised)] rounded-xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] overflow-hidden animate-[fadeDown_0.15s_ease-out] z-50">
                  <div className="py-1.5">
                    <a
                      href={tenantPath("/mi-panel")}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                    >
                      <User className="h-4 w-4" />
                      <span className="flex-1">Mi panel</span>
                      <span
                        className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                        }}
                      >
                        Tienda
                      </span>
                    </a>
                    <button
                      onClick={() => { openAccountModal(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors text-left"
                    >
                      <UserCircle className="h-4 w-4" />
                      <span>Editar mis datos</span>
                    </button>
                    <a
                      href={tenantPath("/mis-pedidos")}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span>Mis pedidos</span>
                    </a>
                    {customer && (
                      <a
                        href={tenantPath("/puntos")}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                      >
                        <Trophy className="h-4 w-4 text-[var(--data-warning-500)]" />
                        <span className="flex-1">Mis puntos</span>
                        {loyalty && (
                          <span className="text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 px-2 py-0.5 rounded-full tabular-nums">
                            {loyalty.loyaltyPoints ?? 0}
                          </span>
                        )}
                      </a>
                    )}
                    <button
                      onClick={() => { setOrderStatusChanged(false); openOrderStatusModal(); setUserMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left",
                        hasActiveOrder
                          ? "bg-amber-50 dark:bg-amber-900/10 text-[var(--data-warning-700)] dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                          : "text-muted hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      )}
                    >
                      <div className="relative">
                        <PackageCheck className="h-4 w-4" />
                        {hasActiveOrder && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--data-warning-500)] animate-ping" />
                        )}
                      </div>
                      <span className="flex-1">Estado de mi pedido</span>
                      {hasActiveOrder && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-warning-500)] animate-pulse" />
                      )}
                    </button>
                    {customer && (
                      <>
                        <div className="mx-3 my-1 border-t border-[var(--rule-base)]" />
                        <button
                          onClick={() => {
                            clear();
                            setUserMenuOpen(false);
                            window.location.reload();
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--data-error-500)] hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left"
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


          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Search button — solo en mobile (desktop usa la barra grande de abajo) */}
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(
                "lg:hidden flex h-11 w-11 items-center justify-center rounded-full transition-all duration-[var(--dur-fast)]",
                scrolled
                  ? "text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "text-white/70 hover:text-white hover:bg-white/15"
              )}
              aria-label="Buscar productos"
              title="Buscar"
            >
              <Search className="h-4.5 w-4.5" />
            </button>

            {/* Notification bell + dropdown — wrapped en div relative para
                que el dropdown ancle al bell, no al header completo (era el bug
                de "el menú aparece en otro lugar"). */}
            {customer?.phone && (
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((p) => !p)}
                  className={cn(
                    "relative flex items-center justify-center h-11 w-11 rounded-full transition-all duration-[var(--dur-fast)]",
                    scrolled
                      ? "text-[var(--text-primary)] hover:bg-muted"
                      : "text-white/70 hover:text-white hover:bg-white/15"
                  )}
                  aria-label={`Notificaciones${_unreadCount > 0 ? ` (${_unreadCount} sin leer)` : ""}`}
                >
                  <Bell className="h-5 w-5" strokeWidth={2.25} />
                  {_unreadCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] px-1 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-extrabold text-white shadow-[var(--shadow-md)]"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--data-error-500) 0%, var(--data-error-600) 100%)",
                      }}
                    >
                      {_unreadCount > 9 ? "9+" : _unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification dropdown — premium redesign 2026-05-06 */}
                {notifOpen && (
                  <div
                    ref={notifRef}
                    className="absolute right-0 top-full mt-3 w-[24rem] max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden shadow-[var(--shadow-xl)] z-50 animate-[fadeUp_0.18s_ease-out]"
                    style={{
                      background: "var(--color-card)",
                      border:
                        "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 18%, var(--color-card-border))",
                    }}
                    role="dialog"
                    aria-label="Notificaciones"
                  >
                    {/* Header gradient */}
                    <div
                      className="relative px-5 py-4 overflow-hidden"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                      }}
                    >
                      <div
                        className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
                        style={{ background: "rgba(255,255,255,0.12)" }}
                      />
                      <div className="relative flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Bell className="h-5 w-5 text-white" strokeWidth={2.25} />
                          </div>
                          <div>
                            <h3 className="text-base font-extrabold text-white leading-tight">
                              Notificaciones
                            </h3>
                            <p className="text-xs text-white/85 font-bold">
                              {_unreadCount > 0
                                ? `${_unreadCount} sin leer`
                                : "Estás al día"}
                            </p>
                          </div>
                        </div>
                        {_unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              await fetch("/api/customer-notifications", {
                                method: "POST",
                                headers: csrfHeaders({ "Content-Type": "application/json" }),
                                body: JSON.stringify({ phone: customer.phone, markAllRead: true }),
                              }).catch((err) => {
                                // Fire-and-forget — UI ya se actualizó optimista
                                if (typeof console !== "undefined") {
                                   
                                  console.warn("[notif] markAllRead failed", String(err));
                                }
                              });
                              setUnreadCount(0);
                              setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
                            }}
                            className="inline-flex items-center gap-1 text-xs font-extrabold text-white px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors"
                            aria-label="Marcar todas como leídas"
                          >
                            <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                            Todas
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lista */}
                    {_notifs.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                          style={{
                            background:
                              "color-mix(in oklch, var(--color-primary, #00A0A0) 10%, transparent)",
                          }}
                        >
                          <Sparkles className="h-8 w-8 text-primary/60" strokeWidth={1.75} />
                        </div>
                        <p className="text-base font-extrabold text-[var(--text-primary)]">
                          Sin notificaciones
                        </p>
                        <p className="text-xs text-muted mt-1">
                          Cuando tengas avisos aparecerán acá
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        <ul className="p-2 space-y-1">
                          {_notifs.slice(0, 10).map((n) => {
                            const isUnread = !n.read;
                            // Color por tipo (mismo mapeo que la página /cuenta/notificaciones)
                            const typeColor =
                              n.type === "pedido"
                                ? "var(--accent)"
                                : n.type === "oferta"
                                  ? "var(--data-warning-500)"
                                  : n.type === "tienda"
                                    ? "var(--text-secondary)"
                                    : "var(--color-primary, #00A0A0)";
                            const TypeIcon =
                              n.type === "pedido"
                                ? Package
                                : n.type === "oferta"
                                  ? Tag
                                  : n.type === "tienda"
                                    ? Store
                                    : AlertCircle;
                            const inner = (
                              <div
                                className={cn(
                                  "flex items-start gap-3 p-3 rounded-2xl transition-all",
                                  isUnread
                                    ? "hover:-translate-y-0.5"
                                    : "hover:bg-gray-50 dark:hover:bg-surface",
                                )}
                                style={
                                  isUnread
                                    ? {
                                        background: `color-mix(in oklch, ${typeColor} 6%, transparent)`,
                                        border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
                                      }
                                    : undefined
                                }
                              >
                                <div
                                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
                                  style={{
                                    background: `color-mix(in oklch, ${typeColor} 14%, transparent)`,
                                  }}
                                >
                                  <TypeIcon
                                    className="h-5 w-5"
                                    style={{ color: typeColor }}
                                    strokeWidth={2.25}
                                  />
                                  {isUnread && (
                                    <span
                                      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 animate-pulse"
                                      style={{
                                        background: typeColor,
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        ["--tw-ring-color" as any]: "var(--color-card)",
                                      }}
                                    />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={cn(
                                      "text-sm leading-tight truncate",
                                      isUnread
                                        ? "font-extrabold text-[var(--text-primary)]"
                                        : "font-bold text-[var(--text-primary)]",
                                    )}
                                  >
                                    {n.title}
                                  </p>
                                  <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
                                    {n.body}
                                  </p>
                                  <p className="text-xs text-muted mt-1 tabular-nums opacity-70">
                                    {new Date(n.createdAt).toLocaleDateString("es-PE", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              </div>
                            );
                            return (
                              <li key={n.id}>
                                {n.link ? (
                                  <Link
                                    href={n.link}
                                    onClick={() => setNotifOpen(false)}
                                    className="block"
                                  >
                                    {inner}
                                  </Link>
                                ) : (
                                  inner
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Footer CTA */}
                    <div
                      className="px-3 py-3 border-t"
                      style={{
                        borderColor: "var(--color-card-border)",
                        background:
                          "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, transparent)",
                      }}
                    >
                      <Link
                        href="/cuenta/notificaciones"
                        onClick={() => setNotifOpen(false)}
                        className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-extrabold transition-all hover:-translate-y-0.5"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                          color: "white",
                          boxShadow:
                            "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)",
                        }}
                      >
                        Ver todas
                        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cart */}
            <button
              onClick={toggle}
              className={cn(
                "relative flex items-center justify-center h-12 w-12 rounded-full transition-all duration-[var(--dur-fast)]",
                scrolled
                  ? "bg-primary text-white shadow-[var(--shadow-lg)] hover:bg-primary-dark"
                  : "bg-white/20 backdrop-blur-sm text-white hover:bg-white/30"
              )}
              aria-label="Abrir carrito"
              data-testid="cart-button"
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
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--data-error-500)] text-[length:var(--ts-2xs)] font-bold text-white shadow-[var(--shadow-md)] animate-[cartBadgeBounce_0.3s_ease-out]"
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
                "lg:hidden relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-[var(--dur-fast)]",
                scrolled
                  ? hasActiveOrder
                    ? "text-[var(--data-warning-600)] hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    : "text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : hasActiveOrder
                    ? "text-amber-300 hover:bg-white/15"
                    : "text-white/70 hover:text-white hover:bg-white/15"
              )}
              aria-label="Estado de pedido"
              title="Estado de pedido"
            >
              <PackageCheck className="h-5 w-5" />
              {hasActiveOrder && (
                <span className="absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]">
                  {orderStatusChanged && (
                    <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping" />
                  )}
                </span>
              )}
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className={cn("lg:hidden h-11 w-11 flex items-center justify-center rounded-lg transition-colors",
                scrolled ? "text-[var(--text-primary)] hover:bg-gray-100" : "text-white hover:bg-white/10")}
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Category quick-strip — solo mobile/tablet (en desktop hay sidebar lateral en /tienda) */}
        <div className="relative z-[1] px-3 pb-3 pt-1 lg:hidden">
          <button
            type="button"
            onClick={() => scrollCategoryStrip("left")}
            className={cn(
              "absolute left-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-[var(--shadow-md)] transition-all lg:hidden",
              scrolled ? "border-gray-200 text-primary" : "border-white/35 text-white bg-black/20 backdrop-blur",
              canScrollCategoriesLeft ? "opacity-100" : "pointer-events-none opacity-30"
            )}
            aria-label="Mover categorías a la izquierda"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div ref={categoryStripRef} className="scrollbar-hide flex gap-2 overflow-x-auto px-8 lg:justify-center lg:px-0">
            {filteredCategories.map(cat => {
              const CIcon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold transition-all",
                    scrolled
                      ? "bg-white text-[var(--text-primary)] hover:bg-gray-50 border border-gray-200"
                      : "bg-white/12 text-white hover:bg-white/20 border border-white/20 backdrop-blur-sm"
                  )}
                >
                  {/* Tienda individual: limpio sin íconos decorativos. */}
                  {!isTenantStore && <CIcon className="h-4 w-4" strokeWidth={1.75} />}
                  {cat.label}
                </button>
              );
            })}
            <Link
              href={tenantPath("/tienda")}
              onClick={() => {}}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                scrolled
                  ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                  : "bg-white/12 text-white hover:bg-white/20 border border-white/20 backdrop-blur-sm"
              )}
            >
              <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
              Ver todos
            </Link>
          </div>

          <button
            type="button"
            onClick={() => scrollCategoryStrip("right")}
            className={cn(
              "absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-[var(--shadow-md)] transition-all lg:hidden",
              scrolled ? "border-gray-200 text-primary" : "border-white/35 text-white bg-black/20 backdrop-blur",
              canScrollCategoriesRight ? "opacity-100" : "pointer-events-none opacity-30"
            )}
            aria-label="Mover categorías a la derecha"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          role="navigation"
          aria-label="Menú principal"
          className="lg:hidden bg-[var(--surface-raised)] border-t dark:border-[var(--rule-base)] shadow-[var(--shadow-xl)] overflow-hidden animate-[fadeDown_0.3s_ease-out] pb-[env(safe-area-inset-bottom)]"
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
                  className="w-full pl-10 pr-10 py-3 rounded-2xl text-sm font-medium bg-gray-100 text-[var(--text-primary)] placeholder:text-muted outline-none focus:ring-2 focus:ring-primary/30"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text-primary)]"
                    aria-label="Limpiar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute top-full mt-1.5 w-full bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] overflow-hidden z-50 max-h-72 overflow-y-auto">
                    {suggestions.map((item) => (
                      <button
                        key={item.id}
                        onMouseDown={() => { handleSearchSelect(item.name); setMobileOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 text-left transition-colors"
                      >
                        {item.image ? (
                          <Image src={item.image} alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-cover bg-gray-100 shrink-0" unoptimized={item.image.startsWith("data:")} />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface flex items-center justify-center shrink-0">
                            <Package className="h-3.5 w-3.5 text-muted" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-sm block truncate"><HighlightMatch text={item.name} query={searchQuery} /></span>
                          <span className="text-xs font-bold text-primary">S/{Number(item.price).toFixed(2)}</span>
                        </div>
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
                      ? "bg-amber-50 dark:bg-amber-900/10 text-[var(--data-warning-700)] dark:text-amber-400 hover:bg-amber-100"
                      : "bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10"
                  )}
                >
                  <PackageCheck className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">Estado de mi pedido</span>
                  {hasActiveOrder && <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)] animate-pulse" />}
                </button>
                <button
                  onClick={() => { openCustomerModal("profile"); setMobileOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] font-medium hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                >
                  <UserCircle className="h-5 w-5" />
                  <span>{customer ? `Mi cuenta \u2014 ${customer.name?.split(" ")[0] ?? "Mi cuenta"}` : "Mi cuenta"}</span>
                </button>
                <a
                  href={tenantPath("/mis-pedidos")}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] font-medium hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                >
                  <ClipboardList className="h-5 w-5" />
                  <span>Mis pedidos</span>
                </a>

                {/* Loyalty — mobile with tier animation */}
                {loyalty && customer && (
                  <a
                    href={tenantPath("/puntos")}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "relative flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors overflow-hidden",
                      loyalty.loyaltyTier === "oro" || loyalty.loyaltyTier === "diamante"
                        ? "bg-amber-50 dark:bg-amber-900/15 text-[var(--data-warning-700)] dark:text-amber-400 hover:bg-amber-100"
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
                      {loyalty.loyaltyPoints} puntos · Nivel {loyalty.loyaltyTier}
                    </span>
                  </a>
                )}
                {customer && (
                  <button
                    onClick={() => {
                      clear();
                      setMobileOpen(false);
                      window.location.reload();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--data-error-500)] font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
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
          <div className="bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
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
                  className="flex-1 text-lg text-[var(--text-primary)] bg-transparent outline-none placeholder:text-muted"
                  autoComplete="off"
                />
                {/* X4: Voice search button */}
                <button
                  onClick={startVoiceSearch}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    listening
                      ? "bg-red-100 dark:bg-red-900/30 text-[var(--data-error-500)] animate-pulse"
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
                <div className="mt-3 border-t border-[var(--rule-base)] pt-3 space-y-1">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2">Sugerencias</p>
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSearchSelect(item.name)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 transition-colors text-left"
                    >
                      {item.image ? (
                        <Image src={item.image} alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-cover bg-gray-100 shrink-0" unoptimized={item.image.startsWith("data:")} />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface flex items-center justify-center shrink-0">
                          <Package className="h-3.5 w-3.5 text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm block truncate"><HighlightMatch text={item.name} query={searchQuery} /></span>
                        <span className="text-xs font-bold text-primary">S/{Number(item.price).toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results state */}
              {searchQuery.trim().length >= 2 && suggestions.length === 0 && (
                <div className="mt-3 border-t border-[var(--rule-base)] pt-4 text-center">
                  <p className="text-sm font-bold text-[var(--text-primary)]">No encontramos &ldquo;{searchQuery.trim()}&rdquo;</p>
                  <p className="text-xs text-muted mt-1">Prueba con otro término o explora nuestras categorías</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-3">
                    {filteredCategories.slice(0, 4).map(cat => {
                      const CIcon = cat.icon;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => { setSearchOpen(false); handleCategoryClick(cat.id); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-primary)] hover:border-primary hover:text-primary transition-colors"
                        >
                          <CIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AC4: Trending / recent searches */}
              {searchQuery.length === 0 && recentSearches.length > 0 && (
                <div className="mt-3 border-t border-[var(--rule-base)] pt-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2 inline-flex items-center gap-1.5"><Flame className="h-3 w-3" aria-hidden /> Búsquedas recientes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map(term => (
                      <button
                        key={term}
                        onClick={() => handleSearchSelect(term)}
                        className="px-3 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/15 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending products — popular items being added to cart */}
              {searchQuery.length === 0 && trendingProducts.length > 0 && (
                <div className="mt-3 border-t border-[var(--rule-base)] pt-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
                    <Flame className="h-3 w-3 text-[var(--accent)]" strokeWidth={1.75} /> Productos populares ahora
                  </p>
                  <div className="space-y-1">
                    {trendingProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSearchSelect(p.name)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/5 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors text-left"
                      >
                        {p.image && (
                          <Image src={p.image} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover bg-gray-100 shrink-0" unoptimized={p.image.startsWith("data:")} />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-xs block truncate">{p.name}</span>
                          <span className="text-[length:var(--ts-2xs)] text-muted">S/{Number(p.price).toFixed(2)}</span>
                        </div>
                        <Flame className="h-3 w-3 text-[var(--accent)] shrink-0" strokeWidth={1.75} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick categories */}
              {searchQuery.length === 0 && (
                <div className="mt-3 border-t border-[var(--rule-base)] pt-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2">Categorías populares</p>
                  <div className="flex flex-wrap gap-2">
                    {filteredCategories.map((cat) => {
                      const CIcon = cat.icon;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => { setSearchOpen(false); handleCategoryClick(cat.id); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface dark:bg-surface border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:border-primary hover:text-primary transition-colors"
                        >
                          <CIcon className="h-4 w-4" strokeWidth={1.75} />
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Voice ordering confirmation toast */}
      {voiceResult && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--accent-600,var(--accent))] text-white px-5 py-3 rounded-xl shadow-[var(--shadow-md)] text-sm font-semibold">
          {voiceResult.qty}x {voiceResult.product} agregado al carrito
        </div>
      )}
    </header>
  );
}

