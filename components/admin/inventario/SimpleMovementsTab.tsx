"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle, ArrowUpCircle, Download, Loader2, Package,
  Search, RefreshCw, ArrowLeftRight,
  Undo2, Plus, ShoppingCart, Globe, Minus, AlertTriangle, HelpCircle, X,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { toast } from "sonner";
import { cn, exportToCSV } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from "@/components/admin/shared/Field";

// ── Types ──────────────────────────────────────────────────────────────────────

type Movement = {
  id: string;
  productId: number;
  productName?: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  createdAt: string;
};

type Product = { id: number; name: string; unit: string; stock: number };

// ── Config ─────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; Icon: LucideIcon; dir: "in" | "out" }> = {
  compra:           { label: "Compra",        Icon: Package, dir: "in" },
  devolucion:       { label: "Devolución",    Icon: Undo2, dir: "in" },
  ajuste_positivo:  { label: "Ajuste (+)",    Icon: Plus, dir: "in" },
  venta:            { label: "Venta",         Icon: ShoppingCart, dir: "out" },
  venta_online:     { label: "Venta online",  Icon: Globe, dir: "out" },
  ajuste_negativo:  { label: "Ajuste (−)",    Icon: Minus, dir: "out" },
  merma:            { label: "Pérdida/Merma", Icon: AlertTriangle, dir: "out" },
  transferencia:    { label: "Transferencia", Icon: ArrowLeftRight, dir: "out" },
};

// Tipos que el usuario puede registrar a mano (ventas vienen del POS).
const ENTRADA_TYPES = [
  { v: "compra", label: "Compra (reposición)" },
  { v: "devolucion", label: "Devolución de cliente" },
  { v: "ajuste_positivo", label: "Ajuste (+) — sobró stock" },
] as const;
const SALIDA_TYPES = [
  { v: "ajuste_negativo", label: "Ajuste (−) — faltó stock" },
  { v: "merma", label: "Pérdida / merma / vencido" },
  { v: "transferencia", label: "Transferencia / salida" },
] as const;

const FIELD = "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const LABEL = "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

type Period = "hoy" | "7d" | "30d" | "todo";
const PERIOD_MS: Record<Period, number> = { hoy: 0, "7d": 7 * 86400_000, "30d": 30 * 86400_000, todo: Infinity };

// ── Component ──────────────────────────────────────────────────────────────────

export default function SimpleMovementsTab() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDir, setFilterDir] = useState<"all" | "in" | "out">("all");
  const [period, setPeriod] = useState<Period>("7d");
  const [showRegister, setShowRegister] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [movRes, prodRes] = await Promise.all([
        fetch("/api/inventory-movements", { credentials: "include" }),
        fetch("/api/products", { credentials: "include" }),
      ]);
      const movData = await movRes.json();
      const prodData = await prodRes.json();
      setMovements(Array.isArray(movData) ? movData : []);
      setProducts(
        Array.isArray(prodData)
          ? prodData.map((p: { id: number; name: string; unit?: string; stock?: number | null }) => ({
              id: Number(p.id), name: p.name, unit: p.unit ?? "und", stock: Number(p.stock ?? 0),
            }))
          : []
      );
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const productMap = useMemo(() => {
    const map = new Map<number, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const enriched = useMemo(() => {
    return movements
      .map(m => {
        const prod = productMap.get(m.productId);
        const meta = TYPE_LABELS[m.type] ?? { label: m.type, Icon: HelpCircle, dir: "out" as const };
        return { ...m, productName: m.productName ?? prod?.name ?? `#${m.productId}`, unit: prod?.unit ?? "und", ...meta };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [movements, productMap]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (period !== "todo") {
      const since = period === "hoy" ? new Date(new Date().toISOString().slice(0, 10)).getTime() : Date.now() - PERIOD_MS[period];
      list = list.filter(m => new Date(m.createdAt).getTime() >= since);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.productName.toLowerCase().includes(q));
    }
    if (filterDir !== "all") list = list.filter(m => m.dir === filterDir);
    return list.slice(0, 300);
  }, [enriched, search, filterDir, period]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayMoves = enriched.filter(m => m.createdAt.startsWith(today));
    const entries = todayMoves.filter(m => m.dir === "in").reduce((s, m) => s + m.quantity, 0);
    const exits = todayMoves.filter(m => m.dir === "out").reduce((s, m) => s + m.quantity, 0);
    return { todayCount: todayMoves.length, entries, exits, net: entries - exits };
  }, [enriched]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando movimientos...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs — paleta de marca, font-mono, barra fina */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Movimientos hoy" value={String(stats.todayCount)} bar="muted" />
        <KpiCard label="Entradas hoy" value={`+${stats.entries}`} tone="primary" bar="primary" />
        <KpiCard label="Salidas hoy" value={`−${stats.exits}`} tone="warning" bar="warning" />
        <KpiCard label="Neto hoy" value={`${stats.net >= 0 ? "+" : "−"}${Math.abs(stats.net)}`} tone={stats.net >= 0 ? "primary" : "error"} bar={stats.net >= 0 ? "primary" : "error"} highlight />
      </div>

      {/* Toolbar — todo en una fila */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative h-10 min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary" />
        </div>
        <div className="flex h-10 items-center gap-1 rounded-lg bg-[var(--surface-sunken)] p-1">
          {(["hoy", "7d", "30d", "todo"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors", period === p ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>{p === "hoy" ? "Hoy" : p === "todo" ? "Todo" : p}</button>
          ))}
        </div>
        <div className="flex h-10 items-center gap-1 rounded-lg bg-[var(--surface-sunken)] p-1">
          {([["all", "Todos"], ["in", "Entradas"], ["out", "Salidas"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilterDir(v)} className={cn("rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors", filterDir === v ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>{l}</button>
          ))}
        </div>
        <button onClick={() => void loadData()} title="Refrescar" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"><RefreshCw className="h-4 w-4" /></button>
        <button onClick={() => exportToCSV(filtered.map(m => ({ fecha: fmtDate(m.createdAt), producto: m.productName, tipo: m.label, cantidad: m.dir === "in" ? `+${m.quantity}` : `-${m.quantity}`, stock_resultado: m.newStock })), `movimientos_${new Date().toISOString().slice(0, 10)}.csv`)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"><Download className="h-3.5 w-3.5" /> Excel</button>
        <button onClick={() => setShowRegister(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"><Plus className="h-4 w-4" strokeWidth={2.4} /> Registrar movimiento</button>
      </div>

      {/* Ledger */}
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
              <tr>
                {["Cuándo", "Producto", "Movimiento", "Cantidad", "Stock"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]", i >= 3 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-14 text-center text-[var(--text-tertiary)]">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="font-medium">Sin movimientos en este periodo</p>
                  <button onClick={() => setShowRegister(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-white hover:bg-primary/90"><Plus className="h-3.5 w-3.5" /> Registrar el primero</button>
                </td></tr>
              )}
              {filtered.map(m => (
                <tr key={m.id} className="transition-colors hover:bg-[var(--surface-sunken)]/40">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{fmtRelative(m.createdAt)}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(m.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3"><span className="block max-w-[200px] truncate font-semibold text-[var(--text-primary)]">{m.productName}</span></td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", m.dir === "in" ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]")}>
                      <m.Icon className="h-3 w-3" strokeWidth={1.75} /> {m.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right"><span className={cn("font-mono text-sm font-bold tabular-nums", m.dir === "in" ? "text-primary" : "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]")}>{m.dir === "in" ? `+${m.quantity}` : `−${m.quantity}`}</span></td>
                  <td className="px-4 py-3 text-right"><span className={cn("font-mono text-sm font-bold tabular-nums", m.newStock === 0 ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : m.newStock <= 5 ? "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{m.newStock}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2 text-xs text-[var(--text-tertiary)]">Mostrando {filtered.length} de {enriched.length} movimientos</div>
        )}
      </div>

      {showRegister && <RegisterMovementModal products={products} onClose={() => setShowRegister(false)} onSaved={() => { setShowRegister(false); void loadData(); }} />}
    </div>
  );
}

function KpiCard({ label, value, tone = "neutral", bar = "muted", highlight }: {
  label: string; value: string; tone?: "neutral" | "primary" | "warning" | "error"; bar?: "primary" | "muted" | "warning" | "error"; highlight?: boolean;
}) {
  const valueColor = tone === "primary" ? "text-primary" : tone === "warning" ? "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" : tone === "error" ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]";
  const barColor = bar === "primary" ? "bg-primary" : bar === "warning" ? "bg-[var(--data-warning-500)]" : bar === "error" ? "bg-[var(--data-error-500)]/50" : "bg-[var(--rule-soft)]";
  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4", highlight && "ring-1 ring-[var(--accent)]/25")}>
      <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", valueColor)}>{value}</p>
      <div className={cn("mt-2 h-1 rounded-full", barColor)} />
    </div>
  );
}

// ── Modal: registrar entrada/salida ──────────────────────────────────────────
function RegisterMovementModal({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [dir, setDir] = useState<"in" | "out">("in");
  const [productId, setProductId] = useState<number | "">("");
  const [type, setType] = useState<string>("compra");
  const [qty, setQty] = useState("");
  const [reference, setReference] = useState("");
  const [notes] = useState("");
  const [psearch, setPsearch] = useState("");
  const [saving, setSaving] = useState(false);

  const types = dir === "in" ? ENTRADA_TYPES : SALIDA_TYPES;
  const selected = products.find(p => p.id === productId) ?? null;
  const qn = Number(qty) || 0;
  const newStock = selected ? Math.max(0, dir === "in" ? selected.stock + qn : selected.stock - qn) : null;
  const matches = useMemo(() => {
    const q = psearch.toLowerCase();
    return (q ? products.filter(p => p.name.toLowerCase().includes(q)) : products).slice(0, 8);
  }, [products, psearch]);

  const setDirAndType = (d: "in" | "out") => { setDir(d); setType(d === "in" ? "compra" : "ajuste_negativo"); };

  const save = async () => {
    if (!productId) { toast.error("Elige un producto"); return; }
    if (qn <= 0) { toast.error("Pon una cantidad válida"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/inventory-movements", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ productId, type, quantity: qn, reference: reference.trim() || undefined, notes: notes.trim() || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e?.error ?? "No se pudo registrar"); return; }
      toast.success(dir === "in" ? "Entrada registrada" : "Salida registrada");
      onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold leading-tight text-[var(--text-primary)]">Registrar movimiento</h2>
            <p className="text-xs text-[var(--text-tertiary)]">Entrada o salida de stock con motivo</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          {/* Entrada / Salida */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirAndType("in")} className={cn("flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors", dir === "in" ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}><ArrowUpCircle className="h-4 w-4" /> Entrada</button>
            <button type="button" onClick={() => setDirAndType("out")} className={cn("flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors", dir === "out" ? "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}><ArrowDownCircle className="h-4 w-4" /> Salida</button>
          </div>

          {/* Producto */}
          <Field label="Producto" labelClassName={LABEL}>
            {(id) => (<>
            {selected ? (
              <button type="button" onClick={() => { setProductId(""); setPsearch(""); }} className="flex w-full items-center justify-between rounded-lg border border-[var(--accent)] bg-primary/10 px-3.5 py-2.5 text-left">
                <span className="text-sm font-bold text-[var(--text-primary)]">{selected.name}</span>
                <span className="text-xs font-bold text-[var(--text-tertiary)]">stock {selected.stock} {selected.unit} · cambiar</span>
              </button>
            ) : (<>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input id={id} value={psearch} onChange={e => setPsearch(e.target.value)} placeholder="Buscar producto…" className={cn(FIELD, "pl-9")} autoFocus />
              </div>
              {matches.length > 0 && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--rule-base)]">
                  {matches.map(p => (
                    <button key={p.id} type="button" onClick={() => { setProductId(p.id); }} className="flex w-full items-center justify-between border-b border-[var(--rule-soft)] px-3 py-2 text-left last:border-0 hover:bg-[var(--surface-sunken)]">
                      <span className="truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</span>
                      <span className="shrink-0 text-xs font-bold text-[var(--text-tertiary)]">{p.stock} {p.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </>)}
            </>)}
          </Field>

          {/* Motivo + cantidad */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Motivo" labelClassName={LABEL}><select value={type} onChange={e => setType(e.target.value)} className={FIELD}>{types.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}</select></Field>
            <Field label="Cantidad" labelClassName={LABEL}><input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" className={FIELD} /></Field>
          </div>
          <Field label="Referencia / motivo (opcional)" labelClassName={LABEL}><input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° factura, proveedor, observación…" className={FIELD} /></Field>

          {/* Preview */}
          {selected && qn > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
              <span className="text-sm font-bold text-[var(--text-secondary)]">Stock: {selected.stock} → <span className={cn(dir === "in" ? "text-primary" : "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]")}>{newStock}</span> {selected.unit}</span>
              <span className={cn("font-mono text-lg font-bold tabular-nums", dir === "in" ? "text-primary" : "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]")}>{dir === "in" ? `+${qn}` : `−${qn}`}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="button" onClick={save} disabled={saving} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
              {saving ? "Guardando…" : "Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
