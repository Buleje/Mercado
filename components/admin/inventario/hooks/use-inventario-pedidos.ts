import { useMemo } from "react";
import type { DbProduct } from "@/lib/jsondb";
import { claveCategoria } from "@/components/admin/inventario/inventario-compartido";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";
import { useInventarioImagenes } from "@/components/admin/inventario/hooks/use-inventario-imagenes";
import { useInventarioMasivo } from "@/components/admin/inventario/hooks/use-inventario-masivo";

/** Órdenes de compra, lector de barras, auto-reorden e indicadores. Parte de `useInventario`. */
export function useInventarioPedidos(previo: ReturnType<typeof useInventarioEstado> & ReturnType<typeof useInventarioCarga> & ReturnType<typeof useInventarioImagenes> & ReturnType<typeof useInventarioMasivo>) {
  const {
    products, setShowAdd, setAddForm, setShowScanner, setScanLoading,
    autoReorderConfigs, setAutoReorderConfigs, setShowAutoReorder, arThreshold, setArThreshold, arQty,
    setArQty,
  } = previo;

  /* `generateOC` / `generateBulkOC` se fueron el 10-10: mandaban `supplierId: ""`
     y la orden exige proveedor (FK), así que nunca crearon una. El aviso de
     reposición lleva a Compras › Sugerencias, que la arma por proveedor. */

  const handleBarcodeScan = async (code: string) => {
    setShowScanner(false);
    setScanLoading(true);
    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.found) {
        setAddForm(f => ({
          ...f,
          name: data.name || f.name,
          image: data.image || f.image,
          unit: data.unit || f.unit,
          barcode: data.barcode || code,
        }));
      } else {
        setAddForm(f => ({ ...f, barcode: code }));
      }
      setShowAdd(true);
    } catch {
      setAddForm(f => ({ ...f, barcode: code }));
      setShowAdd(true);
    }
    setScanLoading(false);
  };

  // Mejora 5 nueva: Save auto-reorder config
  const saveAutoReorder = (productId: number) => {
    const threshold = parseInt(arThreshold, 10) || 5;
    const qty = parseInt(arQty, 10) || 10;
    const updated = { ...autoReorderConfigs, [productId]: { threshold, qty, supplierId: "" } };
    setAutoReorderConfigs(updated);
    localStorage.setItem("auto-reorder-configs", JSON.stringify(updated));
    setShowAutoReorder(null);
    setArThreshold("");
    setArQty("");
  };

  const removeAutoReorder = (productId: number) => {
    const updated = { ...autoReorderConfigs };
    delete updated[productId];
    setAutoReorderConfigs(updated);
    localStorage.setItem("auto-reorder-configs", JSON.stringify(updated));
  };

  const autoReorderCount = Object.keys(autoReorderConfigs).length;

  // ── Stats ──────────────────────────────────────────────────────────────────

  // Brandon 2026-06-01 (fix KPI "Bajo stock"): usa default stockMin 5 (igual que
  // `lowStockProducts` y el chip "Pocas existencias") en vez de exigir stockMin
  // definido. Antes un producto con stock 0 SIN stockMin nunca contaba como bajo
  // → el KPI mostraba "Stock saludable" aunque hubiera productos agotados.
  // Excluye stock no gestionado (undefined) y productos inactivos.
  const isLowStock = (p: DbProduct) =>
    Boolean(p.active) && p.stock != null && p.stock <= (p.stockMin ?? 5);

  const isExpiringSoon = (p: DbProduct) => {
    // GET /api/products manda `expiresAt` (columna de Prisma); `expiryDate` es
    // el nombre del form. Leyendo sólo `expiryDate` el KPI quedaba en 0.
    const expiry = (p as DbProduct & { expiryDate?: string; expiresAt?: string | null }).expiryDate
      ?? (p as DbProduct & { expiresAt?: string | null }).expiresAt;
    if (!expiry) return false;
    const expiryDate = new Date(expiry);
    const now = new Date();
    const diffDays = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  };

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.active).length;
  const lowStockCount = products.filter(isLowStock).length;
  const expiringSoonCount = products.filter(isExpiringSoon).length;
  // Valuación a COSTO REAL (unificado 2026-06-04, fuente única lib/chart-helpers):
  // solo productos con costPrice cargado — NUNCA fabricar price*0.7 (inflaba e
  // inconsistía con el dashboard de Inicio, que ya usa costo real). Para SUNAT
  // el inventario se valúa al costo de adquisición real.
  const totalStockValue = products.reduce(
    (s, p) => (p.costPrice != null ? s + (p.stock ?? 0) * p.costPrice : s), 0
  );

  // ── Mejora P-7: Detectar productos duplicados por similitud de nombre ────

  const duplicateWarning = useMemo(() => {
    const slice = products.slice(0, 100);
    const dupes: { a: string; b: string }[] = [];
    for (let i = 0; i < slice.length; i++) {
      for (let j = i + 1; j < slice.length; j++) {
        const la = slice[i].name.toLowerCase().trim();
        const lb = slice[j].name.toLowerCase().trim();
        if (la === lb || ((la.includes(lb) || lb.includes(la)) && la.length / lb.length > 0.7 && la.length / lb.length < 1.4)) {
          dupes.push({ a: slice[i].name, b: slice[j].name });
        }
      }
      if (dupes.length >= 5) break;
    }
    return dupes;
  }, [products]);

  // ── Mejora P-8: Margen promedio por categoria ─────────────────────────────

  const categoryMargins = useMemo(() => {
    const catMap = new Map<string, { sum: number; count: number }>();
    for (const p of products) {
      if (!p.active || !p.costPrice || p.costPrice <= 0 || p.price <= 0) continue;
      const cat = claveCategoria(p.category); // «abarrotes» y «Abarrotes», una sola
      const ex = catMap.get(cat) || { sum: 0, count: 0 };
      ex.sum += ((p.price - p.costPrice) / p.price) * 100;
      ex.count++;
      catMap.set(cat, ex);
    }
    const result: { cat: string; margin: number }[] = [];
    for (const [cat, data] of catMap) {
      if (data.count >= 3) result.push({ cat, margin: data.sum / data.count });
    }
    return result.sort((a, b) => b.margin - a.margin);
  }, [products]);

  // ── Mejora QW-10i: Top 5 productos más rentables (por margen %) ─────────
  const topRentables = useMemo(() => {
    return products
      .filter(p => p.active && p.costPrice && p.costPrice > 0 && p.price > 0 && p.price > p.costPrice)
      .map(p => ({ id: p.id, margin: ((p.price - p.costPrice!) / p.price) * 100 }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5)
      .map(p => p.id);
  }, [products]);

  // ── Mejora QW-10j: Productos con costo > precio (pérdida) ─────────────
  const inconsistentes = useMemo(() => {
    return products.filter(p => p.costPrice && p.price && p.costPrice > p.price);
  }, [products]);

  return {
    handleBarcodeScan, saveAutoReorder, removeAutoReorder,
    autoReorderCount, isLowStock, isExpiringSoon, totalProducts, activeProducts, lowStockCount,
    expiringSoonCount, totalStockValue, duplicateWarning, categoryMargins, topRentables,
    inconsistentes,
  };
}
