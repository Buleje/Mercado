"use client";

import { useState, useEffect } from "react";
import { Package, Loader2, Plus, Trash2, ToggleLeft, ToggleRight, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/erp";

type BundleItem = { productId: string; quantity: number; productName?: string; productPrice?: number };
type Bundle = { id: string; name: string; description: string; price: number; image: string; active: boolean; items: BundleItem[]; createdAt: string };

export default function BundlesTab() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [prodSearch, setProdSearch] = useState("");

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/bundles").then(r => r.ok ? r.json() : []),
      fetch("/api/products").then(r => r.ok ? r.json() : []),
    ]).then(([bun, prods]) => {
      if (active) {
        setBundles(bun);
        setProducts(prods);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tick]);

  const getProduct = (id: string) => products.find(p => p.id === id);

  const itemsTotal = items.reduce((s, i) => {
    const p = getProduct(i.productId);
    return s + (p ? p.price * i.quantity : 0);
  }, 0);

  const addItem = (productId: string) => {
    if (items.find(i => i.productId === productId)) return;
    setItems(prev => [...prev, { productId, quantity: 1 }]);
    setProdSearch("");
  };

  const removeItem = (productId: string) => setItems(prev => prev.filter(i => i.productId !== productId));

  const updateQty = (productId: string, qty: number) => {
    if (qty < 1) return;
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
  };

  const resetForm = () => {
    setName(""); setDescription(""); setPrice(""); setImage(""); setItems([]); setProdSearch("");
  };

  const save = async () => {
    if (!name || !price || items.length === 0) return;
    setSaving(true);
    const res = await fetch("/api/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, price: Number(price), image: image || undefined, items }),
    });
    if (res.ok) {
      resetForm();
      setShowForm(false);
      setTick(v => v + 1);
    }
    setSaving(false);
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/bundles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setTick(v => v + 1);
  };

  const remove = async (id: string) => {
    await fetch(`/api/bundles/${id}`, { method: "DELETE" });
    setTick(v => v + 1);
  };

  const filteredProducts = prodSearch
    ? products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()) && !items.find(i => i.productId === p.id))
    : [];

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Package className="h-6 w-6 text-primary" />Combos y Paquetes</h2>
        <button onClick={() => setShowForm(true)} className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition flex flex-wrap items-center gap-2"><Plus className="h-4 w-4" />Nuevo Combo</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">{bundles.length}</p>
          <p className="text-xs text-gray-400">Total Combos</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-600">{bundles.filter(b => b.active).length}</p>
          <p className="text-xs text-gray-400">Activos</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-gray-400">{bundles.filter(b => !b.active).length}</p>
          <p className="text-xs text-gray-400">Inactivos</p>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="bg-white dark:bg-card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-3 sm:p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Crear Combo</h3>
              <button onClick={() => { setShowForm(false); resetForm(); }}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del combo" className="w-full px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción (opcional)" className="w-full px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Precio combo" className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
              </div>
              <input value={image} onChange={e => setImage(e.target.value)} placeholder="URL imagen (opcional)" className="flex-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>

            {/* Product picker */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 dark:text-foreground">Productos del combo</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Buscar producto para agregar..." className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
              </div>
              {filteredProducts.length > 0 && (
                <div className="border border-gray-200 dark:border-card-border rounded-xl max-h-32 overflow-y-auto divide-y divide-gray-100 dark:divide-card-border">
                  {filteredProducts.slice(0, 8).map(p => (
                    <button key={p.id} onClick={() => addItem(p.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-surface flex justify-between">
                      <span>{p.name}</span><span className="text-gray-400">S/{p.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map(i => {
                    const p = getProduct(i.productId);
                    if (!p) return null;
                    return (
                      <div key={i.productId} className="flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-surface rounded-lg px-3 py-2">
                        <span className="text-sm font-bold flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-gray-400">S/{p.price.toFixed(2)}</span>
                        <input type="number" min={1} value={i.quantity} onChange={e => updateQty(i.productId, Number(e.target.value))} className="w-14 text-center text-sm border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-card py-1" />
                        <button onClick={() => removeItem(i.productId)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-card-border">
                    <span className="text-gray-400">Precio individual:</span>
                    <span className="font-bold line-through text-gray-400">S/{itemsTotal.toFixed(2)}</span>
                  </div>
                  {Number(price) > 0 && itemsTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600 font-bold">Ahorro:</span>
                      <span className="font-extrabold text-emerald-600">S/{(itemsTotal - Number(price)).toFixed(2)} ({((1 - Number(price) / itemsTotal) * 100).toFixed(0)}%)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={save} disabled={saving || !name || !price || items.length === 0} className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition disabled:opacity-50 flex flex-wrap items-center justify-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}Crear Combo
            </button>
          </div>
        </div>
      )}

      {/* Bundle cards */}
      {bundles.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900 dark:text-foreground">Sin combos creados</p>
          <p className="text-sm text-gray-400">Crea tu primer combo para ofrecer descuentos a tus clientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {bundles.map(b => {
            const individual = b.items.reduce((s, i) => {
              const p = getProduct(i.productId);
              return s + (p ? p.price * i.quantity : (i.productPrice ?? 0) * i.quantity);
            }, 0);
            return (
              <div key={b.id} className={cn("bg-white dark:bg-card border rounded-2xl overflow-hidden", b.active ? "border-gray-200 dark:border-card-border" : "border-gray-100 dark:border-card-border opacity-60")}>
                {b.image && <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${b.image})` }} />}
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-gray-900 dark:text-foreground">{b.name}</p>
                      {b.description && <p className="text-xs text-gray-400">{b.description}</p>}
                    </div>
                    <button onClick={() => toggleActive(b.id, b.active)} title={b.active ? "Desactivar" : "Activar"}>
                      {b.active ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-gray-300" />}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {b.items.map((i, idx) => {
                      const p = getProduct(i.productId);
                      return (
                        <p key={idx} className="text-xs text-gray-500">{i.quantity}x {p?.name ?? i.productName ?? i.productId}</p>
                      );
                    })}
                  </div>
                  <div className="flex items-end justify-between pt-2 border-t border-gray-100 dark:border-card-border">
                    <div>
                      <p className="text-xl sm:text-2xl font-extrabold text-primary">S/{b.price.toFixed(2)}</p>
                      {individual > 0 && <p className="text-xs text-gray-400 line-through">S/{individual.toFixed(2)}</p>}
                    </div>
                    <button onClick={() => remove(b.id)} className="p-2 text-gray-300 hover:text-red-500 transition"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

