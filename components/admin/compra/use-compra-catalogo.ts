"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  needsReorder,
  type PurchaseProduct as Product,
  type PurchaseSupplier as Supplier,
  type PurchaseSortBy as SortBy,
  type PurchaseViewMode as ViewMode,
} from "@/lib/types/purchases";

const ITEMS_PER_PAGE = 24;
export const CACHE_PRODUCTOS = "poc-products-cache";
export const CACHE_PROVEEDORES = "poc-suppliers-cache";

/** Catálogo del Punto de compra: productos, proveedores, filtros y páginas. */
export function useCompraCatalogo() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("stock");
  const [soloReponer, setSoloReponer] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Audit 2026-05-17: los productos del inventario se ven sólo al habilitar
  // «Usar artículos de mi inventario»; la preferencia queda en el navegador.
  const [showInventario, setShowInventario] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("poc-show-inventario") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("poc-show-inventario", showInventario ? "1" : "0"); } catch { /* quota */ }
  }, [showInventario]);

  // ── Fetch products (stale-while-revalidate via localStorage) ─────────────────
  const fetchProducts = useCallback(async () => {
    const TTL = 5 * 60 * 1000; // 5 min
    try {
      const cached = localStorage.getItem(CACHE_PRODUCTOS);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Product[]; ts: number };
        if (Array.isArray(data) && data.length > 0) {
          setProducts(data);
          setLoading(false);
          if (Date.now() - ts < TTL) return; // cache fresco, no revalidar
        }
      }
    } catch { /* ignore */ }
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const json = await res.json();
      const raw: Product[] = Array.isArray(json) ? json : json.products ?? [];
      const filtered = raw.filter((p) => p.active !== false);
      setProducts(filtered);
      try { localStorage.setItem(CACHE_PRODUCTOS, JSON.stringify({ data: filtered, ts: Date.now() })); } catch { /* quota */ }
    } catch {
      // Silencioso — keep cache
    }
  }, []);

  // ── Fetch suppliers (stale-while-revalidate, TTL 30min) ──────────────────────
  const fetchSuppliers = useCallback(async () => {
    const TTL = 30 * 60 * 1000;
    try {
      const cached = localStorage.getItem(CACHE_PROVEEDORES);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Supplier[]; ts: number };
        if (Array.isArray(data) && data.length > 0) {
          setSuppliers(data);
          if (Date.now() - ts < TTL) return;
        }
      }
    } catch { /* ignore */ }
    try {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const json = await res.json();
      const raw: Supplier[] = json.suppliers ?? (Array.isArray(json) ? json : []);
      setSuppliers(raw);
      try { localStorage.setItem(CACHE_PROVEEDORES, JSON.stringify({ data: raw, ts: Date.now() })); } catch { /* quota */ }
    } catch {
      // Silencioso
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    Promise.all([fetchProducts(), fetchSuppliers()]).finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [fetchProducts, fetchSuppliers]);

  /** Suma un producto recién creado al catálogo (y a la copia del navegador). */
  const agregarProducto = useCallback((p: Product) => {
    setProducts((prev) => {
      const next = [...prev.filter((x) => x.id !== p.id), p];
      try { localStorage.setItem(CACHE_PRODUCTOS, JSON.stringify({ data: next, ts: Date.now() })); } catch { /* quota */ }
      return next;
    });
  }, []);

  /** Suma un proveedor recién creado (y a la copia del navegador). */
  const agregarProveedor = useCallback((s: Supplier) => {
    setSuppliers((prev) => {
      const next = [...prev, s];
      try { localStorage.setItem(CACHE_PROVEEDORES, JSON.stringify({ data: next, ts: Date.now() })); } catch { /* quota */ }
      return next;
    });
  }, []);

  // ── Debounce búsqueda ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const categories = useMemo(
    () => ["Todos", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))],
    [products],
  );

  const filtered = useMemo(() => {
    let list = [...products];
    if (soloReponer) list = list.filter((p) => needsReorder(p));
    if (category !== "Todos") list = list.filter((p) => p.category === category);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(debouncedSearch));
    }
    list.sort((a, b) => {
      if (sortBy === "stock") return (a.stock ?? 0) - (b.stock ?? 0);
      if (sortBy === "price") return (a.costPrice ?? a.price) - (b.costPrice ?? b.price);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [products, soloReponer, category, debouncedSearch, sortBy]);

  useEffect(() => { setPage(1); }, [category, debouncedSearch, sortBy, soloReponer]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, page]);
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const needsReorderCount = useMemo(() => products.filter((p) => needsReorder(p)).length, [products]);

  // Conteo por categoría para evitar O(n*m) en los pills
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: products.length };
    products.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
    return counts;
  }, [products]);

  return {
    products, suppliers, agregarProducto, agregarProveedor, loading,
    search, setSearch, category, setCategory, viewMode, setViewMode, sortBy, setSortBy,
    soloReponer, setSoloReponer, showInventario, setShowInventario, page, setPage,
    categories, categoryCounts, filtered, paginatedProducts, totalPages, needsReorderCount,
  };
}

export type CompraCatalogo = ReturnType<typeof useCompraCatalogo>;
