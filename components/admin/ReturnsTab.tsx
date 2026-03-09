"use client";

import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Plus, Loader2, Check, X, Package } from "lucide-react";

type ReturnItem = { id?: string; productId: number; productName: string; quantity: number; price: number; unit: string };
type Return = { id: string; saleId?: string; orderId?: string; reason: string; total: number; items: ReturnItem[]; createdAt: string };
type Sale = { id: string; items: { productId: number; name: string; quantity: number; price: number; unit: string }[]; total: number; createdAt: string };

export default function ReturnsTab() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    fetch("/api/returns").then(r => r.json()).then(setReturns).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = async () => {
    setShowForm(true);
    const res = await fetch("/api/sales?limit=50");
    if (res.ok) setSales(await res.json());
  };

  const selectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnItems(sale.items.map(i => ({ productId: i.productId, productName: i.name, quantity: 0, price: i.price, unit: i.unit })));
  };

  const handleCreate = async () => {
    const items = returnItems.filter(i => i.quantity > 0);
    if (!items.length || !reason.trim()) return;
    const body: Record<string, unknown> = { reason, items };
    if (selectedSale) body.saleId = selectedSale.id;
    const res = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { load(); setShowForm(false); setSelectedSale(null); setReturnItems([]); setReason(""); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><RotateCcw className="h-6 w-6 text-primary" />Devoluciones</h2>
        <button onClick={openForm} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition"><Plus className="h-4 w-4" />Nueva Devolución</button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 space-y-4">
          {!selectedSale ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-gray-600 dark:text-muted">Seleccionar venta a devolver:</p>
              {sales.length === 0 && <p className="text-sm text-gray-400">No hay ventas recientes</p>}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {sales.map(s => (
                  <button key={s.id} onClick={() => selectSale(s)} className="w-full text-left p-3 border border-gray-200 dark:border-card-border rounded-xl hover:bg-gray-50 dark:hover:bg-surface transition">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold">Venta #{s.id.slice(-6)}</span>
                      <span className="text-emerald-600 font-bold">S/{s.total.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()} • {s.items.length} productos</p>
                  </button>
                ))}
              </div>
              <button onClick={() => { setSelectedSale({ id: "", items: [], total: 0, createdAt: "" }); setReturnItems([{ productId: 0, productName: "", quantity: 1, price: 0, unit: "und" }]); }} className="text-sm text-primary font-bold hover:underline">Devolución sin venta asociada →</button>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedSale.id && <p className="text-sm font-bold text-gray-600 dark:text-muted">Venta #{selectedSale.id.slice(-6)} — Selecciona cantidades a devolver:</p>}
              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <Package className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="flex-1 truncate">{item.productName || `Producto #${idx + 1}`}</span>
                    <span className="text-gray-400">S/{item.price}</span>
                    <input type="number" min={0} value={item.quantity} onChange={e => { const v = [...returnItems]; v[idx] = { ...v[idx], quantity: Number(e.target.value) }; setReturnItems(v); }} className="w-16 px-2 py-1 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-center text-sm" />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Motivo *</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Producto dañado, vencido, etc." className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition"><Check className="h-4 w-4" />Procesar</button>
                <button onClick={() => { setShowForm(false); setSelectedSale(null); }} className="flex items-center gap-2 bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted px-4 py-2 rounded-xl text-sm font-bold"><X className="h-4 w-4" />Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {returns.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-8">No hay devoluciones registradas</p>}
        {returns.map(r => (
          <div key={r.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-sm text-gray-900 dark:text-foreground">Dev #{r.id.slice(-6)}</p>
                {r.saleId && <p className="text-xs text-gray-400">Venta: #{r.saleId.slice(-6)}</p>}
                {r.orderId && <p className="text-xs text-gray-400">Pedido: #{r.orderId.slice(-6)}</p>}
              </div>
              <div className="text-right">
                <p className="font-extrabold text-red-600">-S/{r.total.toFixed(2)}</p>
                <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-muted mt-2 italic">&ldquo;{r.reason}&rdquo;</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.items.map((item, i) => (
                <span key={i} className="text-xs bg-gray-100 dark:bg-surface px-2 py-1 rounded-lg">{item.productName} x{item.quantity}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
