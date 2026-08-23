"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Field } from "@/components/admin/shared/Field";
import { SectionTitle } from "@buleje/design-system";
import {
  AlertTriangle, CheckCircle, Clock, Download, Loader2,
  Search, ShieldCheck, Plus, X, Trash2, TrendingDown,
} from "@buleje/design-system/icons";
import { toast } from "sonner";
import { cn, exportToCSV } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ──────────────────────────────────────────────────────────────────────

type Batch = {
  id: string;
  lote: string;
  productName: string;
  productId?: number;
  productCategory?: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  supplierName?: string;
  entryDate?: string;
  costUnit: number;
};
type Product = { id: number; name: string; unit: string };
type Urgency = "vencido" | "critico" | "pronto" | "bien";

const fmtMoney = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
function daysUntil(iso: string): number { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000); }
function getUrgency(days: number): Urgency { if (days < 0) return "vencido"; if (days <= 7) return "critico"; if (days <= 30) return "pronto"; return "bien"; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } }

// Paleta de marca, sin saturar: vencido=coral, pronto/crítico=ámbar, vigente=turquesa.
const URGENCY_CFG: Record<Urgency, { label: string; chip: string; Icon: typeof AlertTriangle }> = {
  vencido: { label: "Vencido", chip: "bg-[var(--data-error-100)] text-[var(--data-error-600)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]", Icon: AlertTriangle },
  critico: { label: "Vence esta semana", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]", Icon: AlertTriangle },
  pronto:  { label: "Vence pronto", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]", Icon: Clock },
  bien:    { label: "Vigente", chip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]", Icon: CheckCircle },
};

const FIELD = "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const LABEL = "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";

// ── Component ──────────────────────────────────────────────────────────────────

export default function SimpleExpiryTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Urgency | "todos">("todos");
  const [showRegister, setShowRegister] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { const raw = localStorage.getItem("expiry-reviewed"); return raw ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); }
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, pRes] = await Promise.all([
        fetch("/api/batches?limit=200", { credentials: "include" }),
        fetch("/api/products", { credentials: "include" }),
      ]);
      const bJson = await bRes.json();
      // La API pagina: { data: [...] }. El código viejo leía un array y salía vacío.
      const arr: Batch[] = Array.isArray(bJson) ? bJson : (bJson?.data ?? bJson?.batches ?? []);
      setBatches(arr);
      const pJson = await pRes.json();
      setProducts(Array.isArray(pJson) ? pJson.map((p: { id: number; name: string; unit?: string }) => ({ id: Number(p.id), name: p.name, unit: p.unit ?? "und" })) : []);
    } catch (err) { console.warn("[SimpleExpiryTab] load failed:", err); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const markReviewed = (id: string) => {
    setReviewed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("expiry-reviewed", JSON.stringify([...next])); } catch { /* empty */ }
      return next;
    });
  };

  const darDeBaja = async (b: Batch) => {
    setConfirmId(null);
    try {
      if (b.productId) {
        await fetch("/api/inventory-movements", {
          method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
          body: JSON.stringify({ productId: b.productId, type: "merma", quantity: b.quantity, reference: `Vencimiento lote ${b.lote}`, notes: "Baja por vencimiento" }),
        });
      }
      const res = await fetch(`/api/batches?id=${b.id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!res.ok) { toast.error("No se pudo dar de baja"); return; }
      toast.success(b.productId ? `Baja registrada (merma de ${b.quantity} ${b.unit})` : "Lote eliminado");
      void load();
    } catch { toast.error("Sin conexión"); }
  };

  const enriched = useMemo(() => batches.map(b => {
    const days = daysUntil(b.expiryDate);
    return { ...b, days, urgency: getUrgency(days) };
  }).sort((a, b) => a.days - b.days), [batches]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filter !== "todos") list = list.filter(b => b.urgency === filter);
    if (search) { const q = search.toLowerCase(); list = list.filter(b => b.productName.toLowerCase().includes(q) || b.lote.toLowerCase().includes(q)); }
    return list;
  }, [enriched, search, filter]);

  const stats = useMemo(() => {
    const valorRiesgo = enriched.filter(b => b.urgency === "vencido" || b.urgency === "critico").reduce((s, b) => s + b.quantity * (b.costUnit || 0), 0);
    return {
      vencidos: enriched.filter(b => b.urgency === "vencido").length,
      criticos: enriched.filter(b => b.urgency === "critico").length,
      prontos: enriched.filter(b => b.urgency === "pronto").length,
      bien: enriched.filter(b => b.urgency === "bien").length,
      valorRiesgo,
    };
  }, [enriched]);

  if (loading) return <div className="flex items-center justify-center py-20 text-sm text-[var(--text-tertiary)]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando vencimientos…</div>;

  return (
    <div className="space-y-5">
      {/* KPIs — filtros clickeables + valor en riesgo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Vencidos" count={stats.vencidos} tone="error" active={filter === "vencido"} onClick={() => setFilter(filter === "vencido" ? "todos" : "vencido")} />
        <StatCard label="Esta semana" count={stats.criticos} tone="warning" active={filter === "critico"} onClick={() => setFilter(filter === "critico" ? "todos" : "critico")} />
        <StatCard label="Próximos 30d" count={stats.prontos} tone="warning" active={filter === "pronto"} onClick={() => setFilter(filter === "pronto" ? "todos" : "pronto")} />
        <StatCard label="Vigentes" count={stats.bien} tone="primary" active={filter === "bien"} onClick={() => setFilter(filter === "bien" ? "todos" : "bien")} />
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 ring-1 ring-[var(--data-error-500)]/15">
          <p className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400"><TrendingDown className="h-3.5 w-3.5" /> Valor en riesgo</p>
          <p className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", stats.valorRiesgo > 0 ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]")}>{fmtMoney(stats.valorRiesgo)}</p>
          <div className={cn("mt-2 h-1 rounded-full", stats.valorRiesgo > 0 ? "bg-[var(--data-error-500)]/50" : "bg-[var(--rule-soft)]")} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative h-10 min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto o lote…" className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary" />
        </div>
        {filter !== "todos" && (
          <button onClick={() => setFilter("todos")} className="inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-3.5 w-3.5" /> {URGENCY_CFG[filter].label}</button>
        )}
        <button onClick={() => exportToCSV(filtered.map(b => ({ lote: b.lote, producto: b.productName, cantidad: b.quantity, costo_unit: b.costUnit, valor: (b.quantity * (b.costUnit || 0)).toFixed(2), vence: fmtDate(b.expiryDate), dias: b.days, estado: URGENCY_CFG[b.urgency].label })), `vencimientos_${new Date().toISOString().slice(0, 10)}.csv`)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"><Download className="h-3.5 w-3.5" /> Excel</button>
        <button onClick={() => setShowRegister(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"><Plus className="h-4 w-4" strokeWidth={2.4} /> Registrar lote</button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 text-center">
          <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><CheckCircle className="h-6 w-6" /></span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">{filter !== "todos" ? "Sin lotes en esta categoría" : "Sin lotes con vencimiento"}</p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">Registra lotes con fecha de vencimiento para no perder mercadería.</p>
          <button onClick={() => setShowRegister(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90"><Plus className="h-4 w-4" strokeWidth={2.5} /> Registrar lote</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => {
            const cfg = URGENCY_CFG[b.urgency];
            const Icon = cfg.Icon;
            const isReviewed = reviewed.has(b.id);
            const danger = b.urgency === "vencido" || b.urgency === "critico";
            return (
              <div key={b.id} className={cn("flex flex-col gap-3 rounded-xl border bg-[var(--surface-raised)] p-4 transition-all sm:flex-row sm:items-center",
                isReviewed ? "border-[var(--rule-base)] opacity-60" : b.urgency === "vencido" ? "border-[var(--data-error-500)]/50" : b.urgency === "critico" ? "border-[var(--data-warning-500)]/50" : "border-[var(--rule-base)]")}>
                <div className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cfg.chip)}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold text-[var(--text-primary)]">{b.productName}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", cfg.chip)}>{b.days < 0 ? `Venció hace ${Math.abs(b.days)}d` : b.days === 0 ? "Vence hoy" : `Vence en ${b.days}d`}</span>
                    {isReviewed && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent)]"><ShieldCheck className="h-3 w-3" /> Revisado</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-tertiary)]">
                    <span>Lote <strong className="text-[var(--text-secondary)]">{b.lote}</strong></span>
                    <span>{b.quantity} {b.unit}</span>
                    <span>Vence {fmtDate(b.expiryDate)}</span>
                    {b.costUnit > 0 && <span className="font-mono">{fmtMoney(b.quantity * b.costUnit)} en juego</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {confirmId === b.id ? (
                    <>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">¿Dar de baja?</span>
                      <button onClick={() => darDeBaja(b)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--data-error-500)] px-2.5 text-xs font-bold text-white hover:brightness-110">Sí, baja</button>
                      <button onClick={() => setConfirmId(null)} className="inline-flex h-9 items-center rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">No</button>
                    </>
                  ) : (
                    <>
                      {danger && (
                        <button onClick={() => setConfirmId(b.id)} title="Dar de baja por vencimiento (merma)" className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--data-error-500)]/30 px-2.5 text-xs font-bold text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-red-950/20">
                          <Trash2 className="h-3.5 w-3.5" /> Dar de baja
                        </button>
                      )}
                      <button onClick={() => markReviewed(b.id)} className={cn("inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition-colors", isReviewed ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" : "border-[var(--accent)]/30 bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:brightness-95")}>
                        <ShieldCheck className="h-3.5 w-3.5" /> {isReviewed ? "Desmarcar" : "Revisado"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showRegister && <RegisterBatchModal products={products} onClose={() => setShowRegister(false)} onSaved={() => { setShowRegister(false); void load(); }} />}
    </div>
  );
}

function StatCard({ label, count, tone, active, onClick }: { label: string; count: number; tone: "error" | "warning" | "primary"; active: boolean; onClick: () => void }) {
  const text = tone === "error" ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : tone === "warning" ? "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" : "text-primary";
  const bar = tone === "error" ? "bg-[var(--data-error-500)]/50" : tone === "warning" ? "bg-[var(--data-warning-500)]" : "bg-primary";
  return (
    <button onClick={onClick} className={cn("rounded-xl border bg-[var(--surface-raised)] p-4 text-left transition-colors", active ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/25" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]")}>
      <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", count > 0 ? text : "text-[var(--text-primary)]")}>{count}</p>
      <div className={cn("mt-2 h-1 rounded-full", count > 0 ? bar : "bg-[var(--rule-soft)]")} />
    </button>
  );
}

// ── Modal: registrar lote con vencimiento ────────────────────────────────────
function RegisterBatchModal({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [productId, setProductId] = useState<number | "">("");
  const [psearch, setPsearch] = useState("");
  const [lote, setLote] = useState("");
  const [qty, setQty] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = products.find(p => p.id === productId) ?? null;
  const matches = useMemo(() => { const q = psearch.toLowerCase(); return (q ? products.filter(p => p.name.toLowerCase().includes(q)) : products).slice(0, 8); }, [products, psearch]);

  const save = async () => {
    if (!selected) { toast.error("Elige un producto"); return; }
    if (!expiry) { toast.error("Pon la fecha de vencimiento"); return; }
    if ((Number(qty) || 0) <= 0) { toast.error("Pon la cantidad"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/batches", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          lote: lote.trim() || `L-${new Date(expiry).toISOString().slice(0, 10)}`,
          productName: selected.name, productId: selected.id, quantity: Number(qty), unit: selected.unit,
          entryDate: new Date().toISOString(), expiryDate: new Date(expiry).toISOString(),
          costUnit: cost ? Number(cost) : 0, supplierName: supplier.trim(),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e?.error ?? "No se pudo registrar"); return; }
      toast.success("Lote registrado"); onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 px-6 py-4 backdrop-blur">
          <div><SectionTitle as="h2" className="text-lg font-bold leading-tight text-[var(--text-primary)]">Registrar lote</SectionTitle><p className="text-xs text-[var(--text-tertiary)]">Mercadería con fecha de vencimiento</p></div>
          <button onClick={onClose} aria-label="Cerrar" className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <span className={LABEL}>Producto</span>
            {selected ? (
              <button type="button" onClick={() => { setProductId(""); setPsearch(""); }} className="flex w-full items-center justify-between rounded-lg border border-[var(--accent)] bg-primary/10 px-3.5 py-2.5 text-left">
                <span className="text-sm font-bold text-[var(--text-primary)]">{selected.name}</span>
                <span className="text-xs font-bold text-[var(--text-tertiary)]">cambiar</span>
              </button>
            ) : (<>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" /><input value={psearch} onChange={e => setPsearch(e.target.value)} placeholder="Buscar producto…" className={cn(FIELD, "pl-9")} autoFocus /></div>
              {matches.length > 0 && (
                <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--rule-base)]">
                  {matches.map(p => <button key={p.id} type="button" onClick={() => setProductId(p.id)} className="flex w-full items-center justify-between border-b border-[var(--rule-soft)] px-3 py-2 text-left last:border-0 hover:bg-[var(--surface-sunken)]"><span className="truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</span><span className="shrink-0 text-xs text-[var(--text-tertiary)]">{p.unit}</span></button>)}
                </div>
              )}
            </>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° de lote" labelClassName={LABEL}><input value={lote} onChange={e => setLote(e.target.value)} placeholder="auto" className={FIELD} /></Field>
            <Field label="Cantidad" labelClassName={LABEL}><input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" className={FIELD} /></Field>
            <Field label="Vence el *" labelClassName={LABEL}><input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={FIELD} /></Field>
            <Field label="Costo unitario (S/)" labelClassName={LABEL}><input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" className={FIELD} /></Field>
            <Field label="Proveedor (opcional)" labelClassName={LABEL} className="col-span-2"><input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Distribuidora…" className={FIELD} /></Field>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="button" onClick={save} disabled={saving} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-primary/90 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}{saving ? "Guardando…" : "Registrar lote"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
