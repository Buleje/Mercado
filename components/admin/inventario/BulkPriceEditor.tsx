'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

type ProductRow = {
  id: number;
  name: string;
  category: string;
  price: number;
  costPrice: number | null;
  newPrice: number;
  selected: boolean;
  changed: boolean;
};

export default function BulkPriceEditor() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [toast, setToast] = useState('');
  const [pctInput, setPctInput] = useState('');
  const [marginInput, setMarginInput] = useState('');
  const [showActions, setShowActions] = useState(false);

  // Load products
  useEffect(() => {
    fetch('/api/products?limit=2000&active=true')
      .then(r => r.json())
      .then(data => {
        const list = (data.products || data || []).map((p: { id: number; name: string; category: string; price: number; costPrice: number | null }) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          costPrice: p.costPrice,
          newPrice: p.price,
          selected: false,
          changed: false,
        }));
        setProducts(list);
      })
      .catch(() => setToast('Error al cargar productos'))
      .finally(() => setLoading(false));
  }, []);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return Array.from(cats).sort();
  }, [products]);

  // Filtered list
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (catFilter && p.category !== catFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, search, catFilter]);

  const selectedCount = products.filter(p => p.selected).length;
  const changedProducts = products.filter(p => p.changed);

  // Calculate margin
  const calcMargin = (price: number, cost: number | null) => {
    if (!cost || cost <= 0 || price <= 0) return null;
    return ((price - cost) / price) * 100;
  };

  const marginColor = (margin: number | null) => {
    if (margin === null) return 'text-gray-400';
    if (margin < 10) return 'text-red-600';
    if (margin < 20) return 'text-amber-600';
    return 'text-green-600';
  };

  // Update single product price
  const updatePrice = useCallback((id: number, newPrice: number) => {
    setProducts(prev => prev.map(p =>
      p.id === id
        ? { ...p, newPrice, changed: Math.abs(newPrice - p.price) > 0.001 }
        : p
    ));
  }, []);

  // Toggle select
  const toggleSelect = useCallback((id: number) => {
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, selected: !p.selected } : p
    ));
  }, []);

  // Select all filtered
  const selectAllFiltered = useCallback(() => {
    const filteredIds = new Set(filtered.map(p => p.id));
    const allSelected = filtered.every(p => p.selected);
    setProducts(prev => prev.map(p =>
      filteredIds.has(p.id) ? { ...p, selected: !allSelected } : p
    ));
  }, [filtered]);

  // Mass actions
  const subirPorcentaje = useCallback(() => {
    const pct = parseFloat(pctInput);
    if (isNaN(pct)) return;
    const multiplier = 1 + pct / 100;
    setProducts(prev => prev.map(p => {
      if (!p.selected) return p;
      const np = Math.round(p.price * multiplier * 100) / 100;
      return { ...p, newPrice: np, changed: Math.abs(np - p.price) > 0.001 };
    }));
    setPctInput('');
  }, [pctInput]);

  const redondear = useCallback(() => {
    setProducts(prev => prev.map(p => {
      if (!p.selected) return p;
      const np = Math.round(p.newPrice * 2) / 2; // Round to nearest 0.50
      return { ...p, newPrice: np, changed: Math.abs(np - p.price) > 0.001 };
    }));
  }, []);

  const igualarMargen = useCallback(() => {
    const targetMargin = parseFloat(marginInput);
    if (isNaN(targetMargin) || targetMargin <= 0 || targetMargin >= 100) return;
    setProducts(prev => prev.map(p => {
      if (!p.selected || !p.costPrice || p.costPrice <= 0) return p;
      // price = cost / (1 - margin/100)
      const np = Math.round(p.costPrice / (1 - targetMargin / 100) * 100) / 100;
      return { ...p, newPrice: np, changed: Math.abs(np - p.price) > 0.001 };
    }));
    setMarginInput('');
  }, [marginInput]);

  const deshacerCambios = useCallback(() => {
    setProducts(prev => prev.map(p => ({ ...p, newPrice: p.price, changed: false })));
  }, []);

  // Save changes
  const guardarCambios = async () => {
    if (changedProducts.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/products/bulk-price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: changedProducts.map(p => ({
            productId: p.id,
            newPrice: p.newPrice,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');

      // Update original prices to reflect saved state
      setProducts(prev => prev.map(p => {
        if (p.changed) return { ...p, price: p.newPrice, changed: false, selected: false };
        return p;
      }));
      setToast(`${data.updated} precios actualizados`);
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error al guardar');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Stats
  const avgMarginBefore = useMemo(() => {
    const withCost = changedProducts.filter(p => p.costPrice && p.costPrice > 0);
    if (withCost.length === 0) return null;
    const sum = withCost.reduce((s, p) => s + ((p.price - (p.costPrice ?? 0)) / p.price) * 100, 0);
    return Math.round(sum / withCost.length);
  }, [changedProducts]);

  const avgMarginAfter = useMemo(() => {
    const withCost = changedProducts.filter(p => p.costPrice && p.costPrice > 0);
    if (withCost.length === 0) return null;
    const sum = withCost.reduce((s, p) => s + ((p.newPrice - (p.costPrice ?? 0)) / p.newPrice) * 100, 0);
    return Math.round(sum / withCost.length);
  }, [changedProducts]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
          {toast}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-card-border rounded-lg bg-white dark:bg-card text-gray-900 dark:text-foreground text-sm"
        />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-card-border rounded-lg bg-white dark:bg-card text-gray-900 dark:text-foreground text-sm"
        >
          <option value="">Todas las categorias</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-card-border">
                <th className="py-2 px-2 text-left">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(p => p.selected)}
                    onChange={selectAllFiltered}
                    className="w-4 h-4 rounded border-gray-300 text-[#00B4A6] focus:ring-[#00B4A6]"
                  />
                </th>
                <th className="py-2 px-2 text-left text-gray-600 dark:text-muted font-medium">Producto</th>
                <th className="py-2 px-2 text-right text-gray-600 dark:text-muted font-medium">Costo</th>
                <th className="py-2 px-2 text-right text-gray-600 dark:text-muted font-medium">Precio actual</th>
                <th className="py-2 px-2 text-right text-gray-600 dark:text-muted font-medium">Margen</th>
                <th className="py-2 px-2 text-right text-gray-600 dark:text-muted font-medium">Nuevo precio</th>
                <th className="py-2 px-2 text-right text-gray-600 dark:text-muted font-medium">Nuevo margen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(p => {
                const currentMargin = calcMargin(p.price, p.costPrice);
                const newMargin = calcMargin(p.newPrice, p.costPrice);

                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
                      p.changed ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
                    }`}
                  >
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={p.selected}
                        onChange={() => toggleSelect(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-[#00B4A6] focus:ring-[#00B4A6]"
                      />
                    </td>
                    <td className="py-2 px-2 text-gray-900 dark:text-foreground truncate max-w-[200px]">{p.name}</td>
                    <td className="py-2 px-2 text-right text-gray-500 dark:text-muted">
                      {p.costPrice != null ? `S/${p.costPrice.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-900 dark:text-foreground font-medium">
                      S/{p.price.toFixed(2)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${marginColor(currentMargin)}`}>
                      {currentMargin != null ? `${currentMargin.toFixed(0)}%` : '-'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        value={p.newPrice}
                        onChange={e => updatePrice(p.id, parseFloat(e.target.value) || 0)}
                        step={0.10}
                        min={0}
                        className={`w-24 px-2 py-1 border rounded text-right text-sm bg-white dark:bg-card text-gray-900 dark:text-foreground ${
                          p.changed ? 'border-amber-400' : 'border-gray-300 dark:border-card-border'
                        }`}
                      />
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${marginColor(newMargin)}`}>
                      {newMargin != null ? `${newMargin.toFixed(0)}%` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="text-center py-2 text-xs text-gray-500 dark:text-muted border-t border-gray-200 dark:border-card-border">
            Mostrando 200 de {filtered.length} productos
          </div>
        )}
      </div>

      {/* Mass actions bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-muted">
              {selectedCount} seleccionados
            </span>
            <button
              onClick={() => setShowActions(!showActions)}
              className="text-sm text-[#00B4A6] font-medium hover:underline"
            >
              {showActions ? 'Ocultar acciones' : 'Acciones masivas'}
            </button>
          </div>

          {showActions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Subir % */}
              <div className="flex gap-1">
                <input
                  type="number"
                  value={pctInput}
                  onChange={e => setPctInput(e.target.value)}
                  placeholder="%"
                  className="w-20 px-2 py-1.5 border border-gray-300 dark:border-card-border rounded-lg text-sm bg-white dark:bg-card text-gray-900 dark:text-foreground"
                />
                <button
                  onClick={subirPorcentaje}
                  disabled={!pctInput}
                  className="flex-1 px-3 py-1.5 bg-[#00B4A6] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#009690] transition-colors"
                >
                  Subir %
                </button>
              </div>

              {/* Redondear */}
              <button
                onClick={redondear}
                className="px-3 py-1.5 border border-gray-300 dark:border-card-border text-gray-700 dark:text-muted rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
              >
                Redondear a S/0.50
              </button>

              {/* Igualar margen */}
              <div className="flex gap-1">
                <input
                  type="number"
                  value={marginInput}
                  onChange={e => setMarginInput(e.target.value)}
                  placeholder="%"
                  className="w-20 px-2 py-1.5 border border-gray-300 dark:border-card-border rounded-lg text-sm bg-white dark:bg-card text-gray-900 dark:text-foreground"
                />
                <button
                  onClick={igualarMargen}
                  disabled={!marginInput}
                  className="flex-1 px-3 py-1.5 bg-[#f97316] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#e8964f] transition-colors"
                >
                  Igualar margen
                </button>
              </div>

              {/* Deshacer */}
              <button
                onClick={deshacerCambios}
                className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
              >
                Deshacer cambios
              </button>
            </div>
          )}
        </div>
      )}

      {/* Save bar */}
      {changedProducts.length > 0 && (
        <div className="bg-[#00B4A6]/5 border border-[#00B4A6]/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-muted">
              <strong>{changedProducts.length}</strong> productos se actualizaran
              {avgMarginBefore != null && avgMarginAfter != null && (
                <span className="ml-2">
                  | Margen promedio: {avgMarginBefore}% → {avgMarginAfter}%
                </span>
              )}
            </div>
            <button
              onClick={guardarCambios}
              disabled={saving}
              className="px-6 py-2 bg-[#00B4A6] text-white rounded-lg font-medium hover:bg-[#009690] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Aplicar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
