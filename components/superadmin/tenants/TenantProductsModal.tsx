"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  X, Package, Loader2, Search, AlertTriangle,
  CheckCircle2, XCircle, ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProductItem {
  id: number;
  name: string;
  barcode: string | null;
  price: number;
  stock: number;
  category: string | null;
  unit: string | null;
  image: string | null;
  active: boolean;
}

interface TenantProductsModalProps {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
  tenantName: string;
}

export function TenantProductsModal({
  open,
  onClose,
  tenantSlug,
  tenantName,
}: TenantProductsModalProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(tenantSlug)}/products`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError("Error al cargar productos");
        return;
      }
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (open) {
      loadProducts();
      setSearch("");
    }
  }, [open, loadProducts]);

  const filtered = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase())) ||
          (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
      )
    : products;

  const activeCount = products.filter((p) => p.active).length;
  const inactiveCount = products.filter((p) => !p.active).length;
  const lowStockCount = products.filter((p) => p.stock <= 5 && p.stock > 0).length;
  const outOfStockCount = products.filter((p) => p.stock <= 0).length;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 sm:inset-auto sm:top-[5%] sm:left-1/2 sm:-translate-x-1/2 sm:w-[90vw] sm:max-w-3xl sm:max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Productos de {tenantName}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {products.length} producto{products.length !== 1 ? "s" : ""} en total
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Stats */}
            {!loading && !error && products.length > 0 && (
              <div className="grid grid-cols-4 gap-2 px-6 py-3 bg-gray-50 dark:bg-gray-800/30">
                <div className="text-center">
                  <div className="text-sm font-bold text-green-600">{activeCount}</div>
                  <div className="text-[10px] text-gray-400">Activos</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-400">{inactiveCount}</div>
                  <div className="text-[10px] text-gray-400">Inactivos</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-amber-500">{lowStockCount}</div>
                  <div className="text-[10px] text-gray-400">Stock bajo</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-red-500">{outOfStockCount}</div>
                  <div className="text-[10px] text-gray-400">Sin stock</div>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, código o categoría..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 border-0 outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-12 text-red-500">
                  <AlertTriangle className="h-8 w-8 mb-2" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Package className="h-8 w-8 mb-2" />
                  <p className="text-sm">
                    {search ? "Sin resultados para la búsqueda" : "Esta tienda no tiene productos"}
                  </p>
                </div>
              )}

              {!loading && !error && filtered.length > 0 && (
                <div className="space-y-2">
                  {filtered.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      {/* Image */}
                      <div className="relative w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                        {p.image ? (
                          <Image
                            src={p.image}
                            alt={p.name}
                            fill
                            sizes="40px"
                            className="object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {p.name}
                          </span>
                          {p.active ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                          {p.barcode && <span>Cód: {p.barcode}</span>}
                          {p.category && <span>• {p.category}</span>}
                          {p.unit && <span>• {p.unit}</span>}
                        </div>
                      </div>

                      {/* Price + Stock */}
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-white">
                          S/{p.price.toFixed(2)}
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            p.stock <= 0
                              ? "text-red-500"
                              : p.stock <= 5
                              ? "text-amber-500"
                              : "text-green-600"
                          }`}
                        >
                          {p.stock <= 0 ? "Sin stock" : `${p.stock} unid.`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {search && filtered.length !== products.length
                  ? `${filtered.length} de ${products.length} producto${products.length !== 1 ? "s" : ""}`
                  : `${products.length} producto${products.length !== 1 ? "s" : ""}`}
              </span>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
