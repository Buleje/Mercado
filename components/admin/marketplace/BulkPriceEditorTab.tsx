"use client";

import { DataTable, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Search, X, Upload, Download, CheckCircle, XCircle,
  Loader2, AlertTriangle, ImageOff, ToggleLeft, ToggleRight,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BulkProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  active: boolean;
  image?: string | null;
}

interface PendingChange {
  price?: number;
  stock?: number;
  active?: boolean;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold",
      type === "success" ? "bg-primary/10 text-white" : "bg-[var(--data-error)] text-white"
    )}>
      {type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ConfirmModal migrado a AdminModal — ver uso en JSX abajo.

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BulkPriceEditorTab() {
  const [products, setProducts] = useState<BulkProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [changes, setChanges] = useState<Map<number, PendingChange>>(new Map());
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Carga inicial de productos
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/marketplace/products?limit=500");
        if (!res.ok) throw new Error("Error al cargar productos");
        const data = await res.json();
        const list: BulkProduct[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        setProducts(list);
      } catch (e) {
        // Fallback: mock data if API is down (endpoint exists at /api/marketplace/products)
        const mock: BulkProduct[] = Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `Producto ${i + 1}`,
          category: ["abarrotes", "bebidas", "limpieza"][i % 3],
          price: parseFloat((Math.random() * 20 + 2).toFixed(2)),
          stock: Math.floor(Math.random() * 100),
          active: true,
          image: null,
        }));
        setProducts(mock);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const categories = ["todas", ...Array.from(new Set(products.map((p) => p.category)))];

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "todas" && p.category !== categoryFilter) return false;
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (!isNaN(min) && p.price < min) return false;
    if (!isNaN(max) && p.price > max) return false;
    return true;
  });

  const changeCount = changes.size;

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const applyChange = (id: number, field: keyof PendingChange, value: number | boolean) => {
    setChanges((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? {};
      next.set(id, { ...cur, [field]: value });
      return next;
    });
  };

  // Exportar CSV
  const exportCsv = () => {
    const rows = [["ID", "Nombre", "Categoría", "Precio", "Stock", "Activo"]];
    products.forEach((p) => {
      const ch = changes.get(p.id) ?? {};
      rows.push([
        String(p.id),
        p.name,
        p.category,
        String(ch.price ?? p.price),
        String(ch.stock ?? (p.stock ?? "")),
        String(ch.active ?? p.active),
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "productos-bodega.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importar CSV (parser simple sin PapaParse)
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split("\n").slice(1); // saltar header
        const newChanges = new Map(changes);
        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
          const id = parseInt(cols[0]);
          const price = parseFloat(cols[3]);
          const stock = parseInt(cols[4]);
          const active = cols[5]?.toLowerCase() === "true";
          if (isNaN(id)) continue;
          const existing = newChanges.get(id) ?? {};
          newChanges.set(id, {
            ...existing,
            ...(!isNaN(price) ? { price } : {}),
            ...(!isNaN(stock) ? { stock } : {}),
            active,
          });
        }
        setChanges(newChanges);
        showToast(`CSV importado. ${newChanges.size} productos con cambios.`, "success");
      } catch {
        showToast("Error al leer el CSV", "error");
      }
    };
    reader.readAsText(file);
    // Reset input para permitir reimportar el mismo archivo
    e.target.value = "";
  };

  // Aplicar cambios al endpoint
  const applyChanges = useCallback(async () => {
    if (changeCount === 0) return;
    setApplying(true);
    setProgress(10);
    try {
      const updates = Array.from(changes.entries()).map(([id, ch]) => ({ id, ...ch }));
      const res = await fetch("/api/marketplace/products/bulk-edit", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ updates }),
      });
      setProgress(90);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Error al aplicar cambios");
      }
      // Actualizar el estado local con los cambios aplicados
      setProducts((prev) =>
        prev.map((p) => {
          const ch = changes.get(p.id);
          if (!ch) return p;
          return {
            ...p,
            price: ch.price ?? p.price,
            stock: ch.stock ?? p.stock,
            active: ch.active ?? p.active,
          };
        })
      );
      setChanges(new Map());
      setProgress(100);
      showToast(`${changeCount} cambios aplicados correctamente`, "success");
    } catch (e) {
      showToast(String(e) || "Error al aplicar cambios", "error");
    } finally {
      setApplying(false);
      setShowConfirm(false);
      setTimeout(() => setProgress(0), 800);
    }
  }, [changes, changeCount]);

  if (loading) {
    return (
      <LoadingState />
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00A0A0]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
          )}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="py-2.5 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00A0A0]"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === "todas" ? "Todas las categorías" : c}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Precio mín"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="w-28 py-2.5 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00A0A0]"
        />
        <input
          type="number"
          placeholder="Precio máx"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="w-28 py-2.5 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00A0A0]"
        />

        <div className="flex gap-2 ml-auto">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <Upload className="h-4 w-4" /> Importar CSV
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button
            onClick={() => changeCount > 0 && setShowConfirm(true)}
            disabled={changeCount === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#00A0A0] text-white text-sm font-medium hover:bg-[#00a090] disabled:opacity-40"
          >
            Aplicar cambios {changeCount > 0 && `(${changeCount})`}
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      {progress > 0 && (
        <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#00A0A0] transition-all duration-[var(--dur-base)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Aviso de error de carga */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)] rounded-xl text-sm text-[var(--data-warning)] dark:text-[var(--data-warning)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Usando datos de ejemplo — {error}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className="min-w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface-canvas)] border-b border-[var(--rule-base)]">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-[var(--rule-base)]"
                />
              </th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">ID</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Imagen</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Nombre</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Categoría</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Precio actual</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Nuevo precio</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Stock</th>
              <th className="px-4 py-3 text-left text-[var(--text-tertiary)] font-medium">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                  No hay productos con esos filtros
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const ch = changes.get(p.id) ?? {};
                const isChanged = changes.has(p.id);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "hover:bg-[var(--surface-sunken)]/50 transition-colors",
                      isChanged && "bg-[var(--data-warning-50)]/50 dark:bg-[var(--data-warning)]/10",
                      selected.has(p.id) && "bg-teal-50/50 dark:bg-teal-900/10",
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded border-[var(--rule-base)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-tertiary)]">{p.id}</td>
                    <td className="px-4 py-3">
                      {p.image ? (
                        <Image
                          src={p.image}
                          alt={p.name}
                          width={32}
                          height={32}
                          className="rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                          <ImageOff className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] max-w-[200px] truncate">{p.name}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{p.category}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">S/ {p.price.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={p.price.toFixed(2)}
                        value={ch.price !== undefined ? ch.price : ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) applyChange(p.id, "price", v);
                          else if (e.target.value === "") {
                            setChanges((prev) => {
                              const next = new Map(prev);
                              const cur = next.get(p.id);
                              if (cur) {
                                const { price: _p, ...rest } = cur;
                                void _p;
                                if (Object.keys(rest).length === 0) next.delete(p.id);
                                else next.set(p.id, rest);
                              }
                              return next;
                            });
                          }
                        }}
                        className="w-24 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00A0A0]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        placeholder={p.stock !== null ? String(p.stock) : "—"}
                        value={ch.stock !== undefined ? ch.stock : ""}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (!isNaN(v)) applyChange(p.id, "stock", v);
                        }}
                        className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00A0A0]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => applyChange(p.id, "active", !(ch.active ?? p.active))}
                        className="flex items-center"
                        aria-label="Alternar activo"
                      >
                        {(ch.active ?? p.active) ? (
                          <ToggleRight className="h-6 w-6 text-[#00A0A0]" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-[var(--text-tertiary)]" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        {filtered.length} productos · {selected.size} seleccionados · {changeCount} con cambios pendientes
      </p>

      <AdminModal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirmar cambios" variant="centered-sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Se aplicarán <span className="font-semibold text-[#00A0A0]">{changeCount}</span> cambios a productos.
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={applying}
              className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={applyChanges}
              disabled={applying}
              className="flex-1 py-2.5 rounded-lg bg-[#00A0A0] text-white text-sm font-medium hover:bg-[#00a090] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {applying && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </button>
          </div>
        </div>
      </AdminModal>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
