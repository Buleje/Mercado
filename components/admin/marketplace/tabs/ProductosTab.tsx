"use client";
import { useState, useEffect } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { AlertCircle, Check, CheckCircle, ExternalLink, Eye, EyeOff, ImageOff, Megaphone, Minus, Package, PackageX, Pencil, RefreshCw, Search, Sparkles, TrendingDown, TrendingUp, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceProducts, type MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { KpiTile, SortIcon, TableSkeleton, CounterChip } from "@/components/admin/marketplace/shared";

// ─────────────────────────────────────────────
// Sub-tab: Productos
// ─────────────────────────────────────────────
type SortKey = "name" | "retailPrice" | "wholesalePrice" | "stock";

export function MarketplaceProductosTab() {
  const {
    products, loading, error, toggling, syncing, syncResult, bulkBusy, pricingId,
    load, handleSync, toggleActive, bulkSetActive, updatePrice, updateOferta, createBoost, stopBoost,
  } = useMarketplaceProducts();
  const { store } = useMarketplaceTienda();
  const storeSlug = store.slug;
  const storeId = store.id ?? "";

  // Brandon mayo 2026 v7 — Nivel A + B:
  // A: búsqueda, filtros estado/stock, KPI strip, imagen, sticky header, link público.
  // B: selección múltiple + bulk publish/despublicar, sort por columna, filtro
  //    por categoría, editar precio retail/mayorista inline.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "publicados" | "inactivos">("todos");
  const [stockFilter, setStockFilter] = useState<"todos" | "ok" | "critico" | "sin-stock">("todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingPrice, setEditingPrice] = useState<{ id: string; field: "retailPrice" | "wholesalePrice" | "discountPrice"; value: string } | null>(null);
  // Brandon mayo 2026 v7 (Nivel C): modal para destacar producto en marketplace.
  const [boostingProduct, setBoostingProduct] = useState<MarketplaceProduct | null>(null);

  if (loading) return <TableSkeleton />;

  const counters = {
    publicados: products.filter((p) => p.isActive).length,
    inactivos: products.filter((p) => !p.isActive).length,
    sinStock: products.filter((p) => p.stock <= 0).length,
    stockCritico: products.filter((p) => p.stock > 0 && p.stock <= 5).length,
  };

  // Lista única de categorías presentes en el catálogo — para el filtro.
  const availableCategories = Array.from(
    new Set(products.map((p) => p.category).filter((c): c is string => !!c)),
  ).sort();

  const filteredUnsorted = products.filter((p) => {
    if (statusFilter === "publicados" && !p.isActive) return false;
    if (statusFilter === "inactivos" && p.isActive) return false;
    if (stockFilter === "ok" && p.stock <= 5) return false;
    if (stockFilter === "critico" && (p.stock <= 0 || p.stock > 5)) return false;
    if (stockFilter === "sin-stock" && p.stock > 0) return false;
    if (categoryFilter !== "todos" && p.category !== categoryFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hit =
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false);
      if (!hit) return false;
    }
    return true;
  });

  // Sort por columna activa.
  const filtered = [...filteredUnsorted].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * dir;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    return 0;
  });

  const allFilteredIds = filtered.map((p) => p.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const someSelected = allFilteredIds.some((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function clickHeader(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  async function handleBulk(isActive: boolean) {
    const ids = Array.from(selectedIds);
    const result = await bulkSetActive(ids, isActive);
    if (result.ok) {
      setSelectedIds(new Set());
    }
  }

  function startEditPrice(
    id: string,
    field: "retailPrice" | "wholesalePrice" | "discountPrice",
    current: number | null,
  ) {
    setEditingPrice({ id, field, value: current != null ? current.toFixed(2) : "" });
  }

  async function commitEditPrice() {
    if (!editingPrice) return;
    const num = Number(editingPrice.value);
    /* La oferta admite vacío: significa "sin rebaja" y se manda como `null`.
       Los precios no — un retail vacío no es un precio, es un descarte. */
    if (editingPrice.field === "discountPrice") {
      const vacio = editingPrice.value.trim() === "";
      if (!vacio && (!Number.isFinite(num) || num <= 0)) { setEditingPrice(null); return; }
      const result = await updateOferta(editingPrice.id, { discountPrice: vacio ? null : num });
      // Si el backend rechazó (la oferta no baja el precio), se deja el valor
      // tipeado en pantalla: el error ya se muestra arriba y así se corrige.
      if (result.ok) setEditingPrice(null);
      return;
    }
    if (!Number.isFinite(num) || num < 0) {
      setEditingPrice(null);
      return;
    }
    const result = await updatePrice(editingPrice.id, { [editingPrice.field]: num });
    if (result.ok) setEditingPrice(null);
  }

  async function quitarOferta(id: string) {
    await updateOferta(id, { discountPrice: null });
  }

  return (
    <div className="space-y-4">
      {/* ── KPI strip — pulso del marketplace al primer vistazo ─────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <CounterChip
          label="Publicados"
          value={counters.publicados}
          tone="success"
          onClick={() => {
            setStatusFilter(statusFilter === "publicados" ? "todos" : "publicados");
            setStockFilter("todos");
          }}
          active={statusFilter === "publicados"}
        />
        <CounterChip
          label="Inactivos"
          value={counters.inactivos}
          tone="neutral"
          onClick={() => {
            setStatusFilter(statusFilter === "inactivos" ? "todos" : "inactivos");
            setStockFilter("todos");
          }}
          active={statusFilter === "inactivos"}
        />
        <CounterChip
          label="Stock crítico"
          value={counters.stockCritico}
          tone="warning"
          onClick={() => {
            setStockFilter(stockFilter === "critico" ? "todos" : "critico");
            setStatusFilter("todos");
          }}
          active={stockFilter === "critico"}
        />
        <CounterChip
          label="Sin stock"
          value={counters.sinStock}
          tone="danger"
          onClick={() => {
            setStockFilter(stockFilter === "sin-stock" ? "todos" : "sin-stock");
            setStatusFilter("todos");
          }}
          active={stockFilter === "sin-stock"}
        />
      </div>

      {/* ── Toolbar: search + categoria + sync ─────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, SKU o categoría…"
            className="w-full h-10 pl-10 pr-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {availableCategories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-extrabold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors capitalize"
            aria-label="Filtrar por categoría"
          >
            <option value="todos">Todas las categorías</option>
            {availableCategories.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--accent)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} aria-hidden />
          {syncing ? "Sincronizando…" : "Sincronizar inventario"}
        </button>
      </div>

      {/* ── Bulk action bar — aparece cuando hay selección ─────────── */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10">
          <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent)]">
            <Check className="h-4 w-4" strokeWidth={3} />
            {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
            Aplicá la acción a todos a la vez:
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulk(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/25 text-xs font-extrabold disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" />
              Publicar {selectedCount}
            </button>
            <button
              type="button"
              onClick={() => handleBulk(false)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] text-xs font-extrabold disabled:opacity-50"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Despublicar
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center h-9 px-2 rounded-lg text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-success-500)]/10 border border-[var(--data-success-500)]/30 rounded-xl text-sm font-bold text-[var(--data-success-500)]">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {syncResult}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 rounded-xl text-sm font-bold text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {products.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin productos publicados</p>
          <p className="text-xs mt-1">Activa productos desde tu catálogo para mostrarlos en el marketplace.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold">Sin resultados con esos filtros</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("todos");
              setStockFilter("todos");
            }}
            className="mt-2 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-22rem)]">
            <DataTable className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] sticky top-0 z-10 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allSelected && someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos los productos visibles"
                      className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("name")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
                    >
                      Producto <SortIcon k="name" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("retailPrice")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Precio retail <SortIcon k="retailPrice" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    Oferta
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => clickHeader("wholesalePrice")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Mayorista <SortIcon k="wholesalePrice" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("stock")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Stock <SortIcon k="stock" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Estado</th>
                  <th className="text-center px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hidden lg:table-cell">Destacar</th>
                  <th className="px-3 py-3 w-12" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((p) => {
                  const stockTone = p.stock <= 0
                    ? "danger"
                    : p.stock <= 5
                      ? "warning"
                      : "success";
                  const isSel = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} className={cn(
                      "transition-colors",
                      isSel ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]/50",
                    )}>
                      <td className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Seleccionar ${p.name}`}
                          className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.image}
                                alt={p.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                                <ImageOff className="h-4 w-4 opacity-50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono truncate">
                              {p.sku || "—"}
                              {p.category && <span className="ml-2 text-[var(--text-secondary)] font-sans capitalize">· {p.category}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Retail price — editable inline + chip competencia */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <PriceCell
                            value={p.retailPrice}
                            isEditing={editingPrice?.id === p.id && editingPrice.field === "retailPrice"}
                            editValue={editingPrice?.id === p.id && editingPrice.field === "retailPrice" ? editingPrice.value : ""}
                            busy={pricingId === p.id}
                            onStartEdit={() => startEditPrice(p.id, "retailPrice", p.retailPrice)}
                            onChange={(v) => setEditingPrice((prev) => prev ? { ...prev, value: v } : prev)}
                            onCommit={commitEditPrice}
                            onCancel={() => setEditingPrice(null)}
                            alwaysBold
                          />
                          <CompetitionChip
                            myPrice={p.retailPrice}
                            avg={p.competitionAvgPrice ?? null}
                            count={p.competitionStoreCount ?? 0}
                          />
                        </div>
                      </td>
                      {/* Oferta — editable inline. El precio que se cobra sale
                          de `precioVigente()`: una vencida NO se aplica. */}
                      <td className="px-3 py-2.5 text-right">
                        <OfertaCell
                          lista={p.retailPrice}
                          oferta={p.discountPrice ?? null}
                          hasta={p.discountUntil ?? null}
                          isEditing={editingPrice?.id === p.id && editingPrice.field === "discountPrice"}
                          editValue={editingPrice?.id === p.id && editingPrice.field === "discountPrice" ? editingPrice.value : ""}
                          busy={pricingId === p.id}
                          onStartEdit={() => startEditPrice(p.id, "discountPrice", p.discountPrice ?? null)}
                          onChange={(v) => setEditingPrice((prev) => prev ? { ...prev, value: v } : prev)}
                          onCommit={commitEditPrice}
                          onCancel={() => setEditingPrice(null)}
                          onQuitar={() => void quitarOferta(p.id)}
                        />
                      </td>
                      {/* Mayorista — editable inline */}
                      <td className="px-3 py-2.5 text-right hidden md:table-cell">
                        <PriceCell
                          value={p.wholesalePrice}
                          isEditing={editingPrice?.id === p.id && editingPrice.field === "wholesalePrice"}
                          editValue={editingPrice?.id === p.id && editingPrice.field === "wholesalePrice" ? editingPrice.value : ""}
                          busy={pricingId === p.id}
                          onStartEdit={() => startEditPrice(p.id, "wholesalePrice", p.wholesalePrice)}
                          onChange={(v) => setEditingPrice((prev) => prev ? { ...prev, value: v } : prev)}
                          onCommit={commitEditPrice}
                          onCancel={() => setEditingPrice(null)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-[42px] h-7 px-2 rounded-full text-xs font-extrabold tabular-nums",
                          stockTone === "success" && "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
                          stockTone === "warning" && "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]",
                          stockTone === "danger" && "bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]",
                        )}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <button
                            onClick={() => toggleActive(p)}
                            disabled={toggling === p.id}
                            aria-pressed={p.isActive}
                            title={p.isActive ? "Despublicar del marketplace" : "Publicar en marketplace"}
                            className={cn(
                              "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-extrabold transition-colors min-w-[110px] justify-center",
                              p.isActive
                                ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/20"
                                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]",
                            )}
                          >
                            {toggling === p.id ? (
                              <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : p.isActive ? (
                              <><Eye className="h-3.5 w-3.5" /> Publicado</>
                            ) : (
                              <><EyeOff className="h-3.5 w-3.5" /> Inactivo</>
                            )}
                          </button>
                          {p.stock <= 0 && p.isActive && (
                            <span
                              className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-error-500)]"
                              title="Sin stock — los clientes no pueden comprar"
                            >
                              <PackageX className="h-3 w-3" />
                              Sin stock
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Columna destacar (sponsored boost) */}
                      <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                        {p.boost ? (
                          <button
                            type="button"
                            onClick={() => setBoostingProduct(p)}
                            title={`Boost activo · S/${p.boost.bidAmount}/día · Gastado S/${p.boost.totalSpentPen.toFixed(2)} / S/${p.boost.maxBudgetPen.toFixed(0)}`}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)] text-xs font-extrabold hover:bg-[var(--brand-secondary)]/25 transition-colors"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Destacado
                          </button>
                        ) : p.isActive && p.productId ? (
                          <button
                            type="button"
                            onClick={() => setBoostingProduct(p)}
                            title="Destacar este producto en el marketplace"
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] text-xs font-bold hover:border-[var(--brand-secondary)] hover:text-[var(--brand-secondary)] transition-colors"
                          >
                            <Megaphone className="h-3.5 w-3.5" />
                            Destacar
                          </button>
                        ) : (
                          <span className="text-[var(--text-tertiary)] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {p.isActive && storeSlug ? (
                          <a
                            href={`/marketplace/${storeSlug}#producto-${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en marketplace público"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-primary/10 hover:text-[var(--accent)] transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : (
                          <span className="inline-block h-8 w-8" aria-hidden />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
          {filtered.length < products.length && (
            <div className="border-t border-[var(--rule-base)] px-4 py-2 bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>
                Mostrando <strong className="tabular-nums">{filtered.length}</strong> de{" "}
                <strong className="tabular-nums">{products.length}</strong> productos
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("todos");
                  setStockFilter("todos");
                }}
                className="text-[var(--accent)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal "Destacar producto" — sponsored boost */}
      {boostingProduct && (
        <BoostModal
          product={boostingProduct}
          storeId={storeId}
          onClose={() => setBoostingProduct(null)}
          onCreate={async (payload) => {
            if (!boostingProduct.productId) return { ok: false };
            const r = await createBoost(boostingProduct.productId, storeId, payload);
            if (r.ok) setBoostingProduct(null);
            return r;
          }}
          onStop={async () => {
            if (!boostingProduct.boost) return { ok: false };
            const r = await stopBoost(boostingProduct.boost.id);
            if (r.ok) setBoostingProduct(null);
            return r;
          }}
        />
      )}
    </div>
  );
}

// ── Chip de comparación contra el promedio del marketplace ──────────────
function CompetitionChip({
  myPrice,
  avg,
  count,
}: {
  myPrice: number;
  avg: number | null;
  count: number;
}) {
  if (!avg || count === 0) return null;
  const diff = ((myPrice - avg) / avg) * 100;
  if (Math.abs(diff) < 3) {
    return (
      <span
        title={`En precio (promedio S/${avg.toFixed(2)} en ${count} tienda${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums"
      >
        <Minus className="h-3 w-3" />
        En precio
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span
        title={`Caro · ${diff.toFixed(0)}% sobre el promedio S/${avg.toFixed(2)} (${count} tienda${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)] tabular-nums"
      >
        <TrendingUp className="h-3 w-3" />
        {diff.toFixed(0)}% caro
      </span>
    );
  }
  return (
    <span
      title={`Barato · ${Math.abs(diff).toFixed(0)}% bajo el promedio S/${avg.toFixed(2)} (${count} tienda${count === 1 ? "" : "s"})`}
      className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] tabular-nums"
    >
      <TrendingDown className="h-3 w-3" />
      {Math.abs(diff).toFixed(0)}% barato
    </span>
  );
}

// ── Modal: destacar producto (SponsoredBoost) ───────────────────────────
function BoostModal({
  product,
  storeId,
  onClose,
  onCreate,
  onStop,
}: {
  product: MarketplaceProduct;
  storeId: string;
  onClose: () => void;
  onCreate: (payload: { bidAmount: number; days: number; maxBudgetPen: number }) => Promise<{ ok: boolean }>;
  onStop: () => Promise<{ ok: boolean }>;
}) {
  const existing = product.boost;
  const [bidAmount, setBidAmount] = useState<string>(existing ? String(existing.bidAmount) : "3");
  const [days, setDays] = useState<string>("7");
  const [maxBudget, setMaxBudget] = useState<string>(existing ? String(existing.maxBudgetPen) : "21");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const bidNum = Number(bidAmount);
  const daysNum = Number(days);
  const budgetNum = Number(maxBudget);
  const estimated = Number.isFinite(bidNum) && Number.isFinite(daysNum) ? bidNum * daysNum : 0;
  const canSubmit =
    !!storeId &&
    !!product.productId &&
    bidNum > 0 &&
    daysNum > 0 &&
    daysNum <= 90 &&
    budgetNum >= bidNum;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    await onCreate({ bidAmount: bidNum, days: daysNum, maxBudgetPen: budgetNum });
    setSubmitting(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-xl)] overflow-hidden"
      >
        <header className="flex items-start gap-3 px-6 py-5 border-b-2 border-[var(--rule-soft)]">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)] shrink-0">
            <Sparkles className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
              Marketplace · Boost
            </p>
            <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">
              {existing ? "Boost activo" : "Destacar producto"}
            </SectionTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed truncate">
              {product.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {existing ? (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Puja diaria" value={`S/ ${existing.bidAmount.toFixed(2)}`} />
              <KpiTile label="Gastado" value={`S/ ${existing.totalSpentPen.toFixed(2)}`} sub={`de S/ ${existing.maxBudgetPen.toFixed(0)}`} />
              <KpiTile label="Impresiones" value={existing.impressionsCount.toLocaleString("es-PE")} />
              <KpiTile label="Clicks" value={existing.clicksCount.toLocaleString("es-PE")} />
            </div>
            <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-3 text-xs text-[var(--text-secondary)]">
              Termina el{" "}
              <strong className="text-[var(--text-primary)]">
                {new Date(existing.endDate).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
              </strong>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Destacar tu producto en el marketplace. Aparece arriba en los listados de su categoría y muestra el badge <strong className="text-[var(--brand-secondary)]">Destacado</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField label="Puja diaria" prefix="S/" value={bidAmount} onChange={setBidAmount} hint="Mínimo S/ 1" />
              <NumberField label="Duración" suffix="días" value={days} onChange={setDays} hint="Máx 90" />
              <NumberField label="Tope total" prefix="S/" value={maxBudget} onChange={setMaxBudget} hint="Corta al llegar" />
            </div>
            <div className="rounded-xl bg-primary/10 border-2 border-[var(--accent)]/30 p-3 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Gasto estimado
              </span>
              <span className="text-xl font-extrabold tabular-nums text-[var(--accent)]">
                S/ {estimated.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <footer className="px-6 py-4 bg-[var(--surface-sunken)] border-t-2 border-[var(--rule-soft)] flex items-center justify-end gap-2">
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                setSubmitting(true);
                await onStop();
                setSubmitting(false);
              }}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] font-extrabold text-sm hover:bg-[var(--data-error-500)]/20 transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Detener boost
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-[var(--brand-secondary)] text-white font-extrabold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {submitting ? "Creando…" : "Destacar"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}


function NumberField({
  label,
  prefix,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-extrabold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]",
            prefix ? "pl-8 pr-3" : "px-3",
            suffix ? "pr-12" : "",
            "text-right tabular-nums",
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

// ── Celda de precio editable inline ──────────────────────────────────────
/**
 * OfertaCell — poner, cambiar o sacar la rebaja de un producto.
 *
 * Hasta ahora `discountPrice` no se podía cargar desde ninguna pantalla, así que
 * la vidriera tenía el tachado y el chip «-30%» listos para nada (148 productos,
 * 0 ofertas). Acá se carga.
 *
 * Muestra el % calculado mientras se tipea —igual que el S//m³ del libro
 * forestal— porque un 19.90 sobre 24.90 no dice nada y un «-20%» sí. Y distingue
 * la oferta VENCIDA de la vigente: el precio que se cobra sale de
 * `precioVigente()`, no de que el campo esté lleno.
 */
function OfertaCell({
  lista,
  oferta,
  hasta,
  isEditing,
  editValue,
  busy,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  onQuitar,
}: {
  lista: number;
  oferta: number | null;
  hasta: string | null;
  isEditing: boolean;
  editValue: string;
  busy: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onQuitar: () => void;
}) {
  if (isEditing) {
    const n = Number(editValue);
    // El % en vivo delata el dedazo: 199 en vez de 19.90 salta como "-699%".
    const pct = Number.isFinite(n) && n > 0 && lista > 0 ? Math.round(((lista - n) / lista) * 100) : null;
    return (
      <div className="inline-flex items-center gap-1 justify-end">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">S/</span>
        <input
          type="number"
          autoFocus
          min={0}
          step={0.5}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={onCommit}
          disabled={busy}
          aria-label="Precio de oferta"
          className="w-20 h-7 px-2 rounded-md border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-sm font-extrabold text-right tabular-nums outline-none"
        />
        {pct != null && (
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold tabular-nums",
            pct > 0 && pct < 100 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
          )}>
            {pct > 0 ? `-${pct}%` : "no baja"}
          </span>
        )}
      </div>
    );
  }

  if (oferta == null) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        title="Poner este producto en oferta"
        className="inline-flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
      >
        <Pencil className="h-3 w-3 opacity-60" aria-hidden /> —
      </button>
    );
  }

  const vencida = hasta != null && new Date(hasta).getTime() <= Date.now();
  const pct = lista > 0 ? Math.round(((lista - oferta) / lista) * 100) : 0;
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={onStartEdit}
          title="Click para editar la oferta"
          className="group inline-flex items-center gap-1.5 tabular-nums font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
        >
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" aria-hidden />
          S/ {oferta.toFixed(2)}
        </button>
        <button
          type="button"
          onClick={onQuitar}
          disabled={busy}
          title="Quitar la oferta"
          aria-label="Quitar la oferta"
          className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {/* Vencida ≠ cargada: el cliente paga el precio de lista igual. */}
      <span className={cn(
        "text-[length:var(--ts-2xs)] font-bold tabular-nums",
        vencida ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]",
      )}>
        {vencida ? "vencida · no se aplica" : `-${pct}%`}
      </span>
    </div>
  );
}

function PriceCell({
  value,
  isEditing,
  editValue,
  busy,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  alwaysBold = false,
}: {
  value: number;
  isEditing: boolean;
  editValue: string;
  busy: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  alwaysBold?: boolean;
}) {
  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1 justify-end">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">S/</span>
        <input
          type="number"
          autoFocus
          min={0}
          step={0.5}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={onCommit}
          disabled={busy}
          className="w-20 h-7 px-2 rounded-md border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-sm font-extrabold text-right tabular-nums outline-none"
        />
      </div>
    );
  }
  if (value <= 0 && !alwaysBold) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        title="Agregar precio mayorista"
        className="inline-flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
      >
        <Pencil className="h-3 w-3 opacity-60" aria-hidden /> —
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStartEdit}
      title="Click para editar"
      className={cn(
        "group inline-flex items-center gap-1.5 tabular-nums hover:text-[var(--accent)] transition-colors",
        alwaysBold
          ? "font-extrabold text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]",
      )}
    >
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" aria-hidden />
      S/ {value.toFixed(2)}
    </button>
  );
}

