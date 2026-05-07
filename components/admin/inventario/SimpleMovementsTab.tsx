"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle, ArrowUpCircle, Download, Loader2, Package,
  Search, TrendingDown, TrendingUp, RefreshCw,
  Undo2, Plus, ShoppingCart, Globe, Minus, AlertTriangle, ArrowLeftRight, HelpCircle,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

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

type Product = { id: number; name: string; unit: string };

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

// ── Component ──────────────────────────────────────────────────────────────────

export default function SimpleMovementsTab() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDir, setFilterDir] = useState<"all" | "in" | "out">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [movRes, prodRes] = await Promise.all([
        fetch("/api/inventory-movements"),
        fetch("/api/products"),
      ]);
      const movData = await movRes.json();
      const prodData = await prodRes.json();
      setMovements(Array.isArray(movData) ? movData : []);
      setProducts(
        Array.isArray(prodData)
          ? prodData.map((p: { id: number; name: string; unit?: string }) => ({
              id: Number(p.id),
              name: p.name,
              unit: p.unit ?? "und",
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
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.productName.toLowerCase().includes(q));
    }
    if (filterDir !== "all") {
      list = list.filter(m => m.dir === filterDir);
    }
    return list.slice(0, 200);
  }, [enriched, search, filterDir]);

  // Summary stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayMoves = enriched.filter(m => m.createdAt.startsWith(today));
    const entries = todayMoves.filter(m => m.dir === "in").reduce((s, m) => s + m.quantity, 0);
    const exits = todayMoves.filter(m => m.dir === "out").reduce((s, m) => s + m.quantity, 0);
    return { todayCount: todayMoves.length, entries, exits };
  }, [enriched]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando movimientos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4">
          <Package className="h-5 w-5 text-[var(--data-success-500)] mb-1" />
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Movimientos hoy</p>
          <p className="text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{stats.todayCount}</p>
        </div>
        <div className="rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4">
          <ArrowUpCircle className="h-5 w-5 text-[var(--data-success-500)] mb-1" />
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Entradas hoy</p>
          <p className="text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">+{stats.entries}</p>
        </div>
        <div className="rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/30 p-4">
          <ArrowDownCircle className="h-5 w-5 text-[var(--data-warning-500)] mb-1" />
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Salidas hoy</p>
          <p className="text-2xl font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">−{stats.exits}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] dark:border-card-border p-0.5">
          {([["all", "Todos"], ["in", "Entradas"], ["out", "Salidas"]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilterDir(v)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                filterDir === v ? "bg-primary text-white" : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-surface"
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => void loadData()}
          className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          title="Refrescar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          onClick={() => exportToCSV(filtered.map(m => ({
            fecha: fmtDate(m.createdAt), producto: m.productName,
            tipo: m.label, cantidad: m.dir === "in" ? `+${m.quantity}` : `-${m.quantity}`,
            stock_resultado: m.newStock,
          })), `movimientos_${new Date().toISOString().slice(0, 10)}.csv`)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Cuándo</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Qué pasó</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Cantidad</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Stock ahora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[var(--text-tertiary)] dark:text-muted">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">Sin movimientos</p>
                  </td>
                </tr>
              )}
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{fmtRelative(m.createdAt)}</p>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{fmtDate(m.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[var(--text-primary)] dark:text-foreground truncate max-w-[180px] block">{m.productName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                      m.dir === "in" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
                        : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]"
                    )}>
                      <m.Icon className="h-3 w-3" strokeWidth={1.75} />
                      {m.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-sm font-extrabold",
                      m.dir === "in" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                    )}>
                      {m.dir === "in" ? `+${m.quantity}` : `−${m.quantity}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-sm font-bold",
                      m.newStock === 0 ? "text-[var(--data-error-500)]" : m.newStock <= 5 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)] dark:text-foreground"
                    )}>
                      {m.newStock}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-[var(--rule-soft)] dark:border-card-border bg-gray-50 dark:bg-surface text-xs text-[var(--text-tertiary)]">
            Mostrando {filtered.length} de {enriched.length} movimientos
          </div>
        )}
      </div>
    </div>
  );
}
