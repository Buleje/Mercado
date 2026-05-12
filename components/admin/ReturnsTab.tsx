"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { RotateCcw, Plus, Loader2, Check, X, Package, Camera, CreditCard, Image as ImageIcon } from "@buleje/design-system/icons";
import type { Sale } from "@/types/erp";
import { csrfHeaders } from "@/lib/csrf-client";

type ReturnItem = { id?: string; productId: number; productName: string; quantity: number; price: number; unit: string };
type Return = { id: string; saleId?: string; orderId?: string; reason: string; total: number; photoUrl?: string; customerPhone?: string; creditApplied?: boolean; items: ReturnItem[]; createdAt: string };

export default function ReturnsTab() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [applyCredit, setApplyCredit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creditSuccess, setCreditSuccess] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/returns").then(r => r.ok ? r.json() : []).then(d => setReturns(Array.isArray(d) ? d : d?.returns ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = async () => {
    setShowForm(true);
    setPhotoDataUrl(null);
    setCustomerPhone("");
    setApplyCredit(false);
    setCreditSuccess(false);
    const res = await fetch("/api/sales?limit=50");
    if (res.ok) setSales(await res.json());
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const selectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnItems((sale.items ?? []).map(i => ({ productId: Number(i.productId ?? 0), productName: i.name ?? "", quantity: 0, price: i.price ?? 0, unit: i.unit ?? "und" })));
  };

  const handleCreate = async () => {
    const items = returnItems.filter(i => i.quantity > 0);
    if (!items.length || !reason.trim()) return;
    setSubmitting(true);
    const body: Record<string, unknown> = {
      reason, items,
      photoUrl: photoDataUrl ?? undefined,
      customerPhone: customerPhone.trim() || undefined,
      applyCredit: applyCredit && !!customerPhone.trim(),
    };
    if (selectedSale) body.saleId = selectedSale.id;
    const res = await fetch("/api/returns", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (res.ok) {
      const data = await res.json();
      setCreditSuccess(data.creditApplied === true);
      load();
      setShowForm(false);
      setSelectedSale(null);
      setReturnItems([]);
      setReason("");
      setPhotoDataUrl(null);
      setCustomerPhone("");
      setApplyCredit(false);
    }
    setSubmitting(false);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><RotateCcw className="h-6 w-6 text-primary" />Devoluciones</SectionTitle>
        <button onClick={openForm} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition"><Plus className="h-4 w-4" />Nueva Devolución</button>
      </div>

      {creditSuccess && (
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-sm font-bold px-2 sm:px-4 py-2 sm:py-3 rounded-xl flex flex-wrap items-center gap-2">
          <Check className="h-4 w-4" /> Crédito aplicado al saldo del cliente correctamente.
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 space-y-4">
          {!selectedSale ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">Seleccionar venta a devolver:</p>
              {sales.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">No hay ventas recientes</p>}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {sales.map(s => (
                  <button key={s.id} onClick={() => selectSale(s)} className="w-full text-left p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg hover:bg-gray-50 dark:hover:bg-surface transition">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold">Venta #{String(s.id).slice(-6)}</span>
                      <span className="text-[var(--data-success-500)] font-bold">S/{Number(s.total).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">{new Date(s.createdAt).toLocaleString()} • {s.items?.length ?? 0} productos</p>
                  </button>
                ))}
              </div>
              <button onClick={() => { setSelectedSale({ id: "", items: [], total: 0, createdAt: "" }); setReturnItems([{ productId: 0, productName: "", quantity: 1, price: 0, unit: "und" }]); }} className="text-sm text-primary font-bold hover:underline">Devolución sin venta asociada →</button>
            </div>
          ) : (
            <div className="space-y-6">
              {selectedSale.id && <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">Venta #{String(selectedSale.id).slice(-6)} — Selecciona cantidades a devolver:</p>}
              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-3 text-sm">
                    <Package className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                    <span className="flex-1 truncate">{item.productName || `Producto #${idx + 1}`}</span>
                    <span className="text-[var(--text-tertiary)]">S/{item.price}</span>
                    <input type="number" min={0} value={item.quantity} onChange={e => { const v = [...returnItems]; v[idx] = { ...v[idx], quantity: Number(e.target.value) }; setReturnItems(v); }} className="w-16 px-2 py-1 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-center text-sm" />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Motivo *</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Producto dañado, vencido, etc." className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-sm" />
              </div>

              {/* Photo evidence */}
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" /> Foto del producto (opcional)
                </label>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                <button type="button" onClick={() => photoInputRef.current?.click()} className="mt-1 flex flex-wrap items-center gap-2 px-3 py-2 border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg text-sm text-[var(--text-secondary)] dark:text-muted hover:border-primary hover:text-primary transition w-full justify-center">
                  <ImageIcon className="h-4 w-4" />{photoDataUrl ? "Cambiar foto" : "Seleccionar / tomar foto"}
                </button>
                {photoDataUrl && (
                  <div className="mt-2 relative inline-block">
                    <Image src={photoDataUrl} alt="Evidencia" width={96} height={96} className="object-cover rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)]" unoptimized />
                    <button type="button" onClick={() => setPhotoDataUrl(null)} className="absolute -top-1.5 -right-1.5 bg-[var(--data-error-500)] text-white rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                )}
              </div>

              {/* Customer credit */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" /> Crédito al cliente (opcional)
                </label>
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Teléfono del cliente" className="w-full px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-sm" />
                {customerPhone.trim() && (
                  <label className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)] dark:text-muted cursor-pointer">
                    <input type="checkbox" checked={applyCredit} onChange={e => setApplyCredit(e.target.checked)} className="rounded" />
                    Acreditar S/{returnItems.filter(i => i.quantity > 0).reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)} al saldo del cliente
                  </label>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={handleCreate} disabled={submitting || !reason.trim() || !returnItems.some(i => i.quantity > 0)} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50"><Check className="h-4 w-4" />{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Procesar"}</button>
                <button onClick={() => { setShowForm(false); setSelectedSale(null); }} className="flex flex-wrap items-center gap-2 bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold"><X className="h-4 w-4" />Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {returns.length === 0 && <p className="text-center text-[var(--text-tertiary)] dark:text-muted py-8">No hay devoluciones registradas</p>}
        {returns.map(r => (
          <div key={r.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">Dev #{r.id.slice(-6)}</p>
                  {r.creditApplied && (
                    <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-2 py-0.5 rounded-full border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                      <CreditCard className="h-3 w-3" /> Crédito aplicado
                    </span>
                  )}
                </div>
                {r.saleId && <p className="text-xs text-[var(--text-tertiary)]">Venta: #{r.saleId.slice(-6)}</p>}
                {r.orderId && <p className="text-xs text-[var(--text-tertiary)]">Pedido: #{r.orderId.slice(-6)}</p>}
                {r.customerPhone && <p className="text-xs text-[var(--text-tertiary)]">Cliente: {r.customerPhone}</p>}
              </div>
              {r.photoUrl && (
                <Image src={r.photoUrl} alt="Evidencia" width={64} height={64} className="object-cover rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0 cursor-pointer" onClick={() => window.open(r.photoUrl)} />
              )}
              <div className="text-right shrink-0">
                <p className="font-extrabold text-[var(--data-error-500)]">-S/{Number(r.total).toFixed(2)}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{new Date(r.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-2 italic">&ldquo;{r.reason}&rdquo;</p>
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

