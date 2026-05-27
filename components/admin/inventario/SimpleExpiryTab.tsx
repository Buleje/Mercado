"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle, Clock, Download, Loader2,
  Package, Search, ShieldCheck,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Batch = {
  id: string;
  lote: string;
  productName: string;
  productCategory: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  supplierName: string;
  entryDate: string;
  costUnit: number;
};

type Urgency = "vencido" | "critico" | "pronto" | "bien";

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function getUrgency(days: number): Urgency {
  if (days < 0) return "vencido";
  if (days <= 7) return "critico";
  if (days <= 30) return "pronto";
  return "bien";
}

const URGENCY_CONFIG: Record<Urgency, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  vencido: { label: "Vencido", color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", icon: AlertTriangle },
  critico: { label: "Vence esta semana", color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30", icon: AlertTriangle },
  pronto:  { label: "Vence pronto", color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", icon: Clock },
  bien:    { label: "Vigente", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle },
};

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SimpleExpiryTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Urgency | "todos">("todos");
  const [reviewed, setReviewed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("expiry-reviewed");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    fetch("/api/batches")
      .then(r => r.json())
      .then((d: unknown) => setBatches(Array.isArray(d) ? d : []))
      .catch((err) => console.warn("[SimpleExpiryTab] /api/batches failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const markReviewed = (id: string) => {
    setReviewed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("expiry-reviewed", JSON.stringify([...next])); } catch { /* empty */ }
      return next;
    });
  };

  const enriched = useMemo(() => {
    return batches.map(b => {
      const days = daysUntil(b.expiryDate);
      const urgency = getUrgency(days);
      return { ...b, days, urgency };
    }).sort((a, b) => a.days - b.days);
  }, [batches]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filter !== "todos") list = list.filter(b => b.urgency === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b => b.productName.toLowerCase().includes(q) || b.lote.toLowerCase().includes(q));
    }
    return list;
  }, [enriched, search, filter]);

  // Stats
  const stats = useMemo(() => ({
    vencidos: enriched.filter(b => b.urgency === "vencido").length,
    criticos: enriched.filter(b => b.urgency === "critico").length,
    prontos: enriched.filter(b => b.urgency === "pronto").length,
    bien: enriched.filter(b => b.urgency === "bien").length,
    total: enriched.length,
  }), [enriched]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando vencimientos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Vencidos" count={stats.vencidos} color="red" icon={AlertTriangle} onClick={() => setFilter(filter === "vencido" ? "todos" : "vencido")} active={filter === "vencido"} />
        <StatCard label="Esta semana" count={stats.criticos} color="orange" icon={AlertTriangle} onClick={() => setFilter(filter === "critico" ? "todos" : "critico")} active={filter === "critico"} />
        <StatCard label="Próximos 30d" count={stats.prontos} color="amber" icon={Clock} onClick={() => setFilter(filter === "pronto" ? "todos" : "pronto")} active={filter === "pronto"} />
        <StatCard label="Vigentes" count={stats.bien} color="emerald" icon={CheckCircle} onClick={() => setFilter(filter === "bien" ? "todos" : "bien")} active={filter === "bien"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto o lote..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => exportToCSV(filtered.map(b => ({
            lote: b.lote, producto: b.productName, cantidad: b.quantity,
            vence: fmtDate(b.expiryDate), dias: b.days, estado: URGENCY_CONFIG[b.urgency].label,
          })), `vencimientos_${new Date().toISOString().slice(0, 10)}.csv`)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
          <Package className="h-10 w-10 mb-2 opacity-40" />
          <p className="font-medium">{filter !== "todos" ? "Sin lotes en esta categoría" : "Sin lotes registrados"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => {
            const cfg = URGENCY_CONFIG[b.urgency];
            const Icon = cfg.icon;
            const isReviewed = reviewed.has(b.id);
            return (
              <div
                key={b.id}
                className={cn(
                  "rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all",
                  isReviewed ? "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30 opacity-60" :
                  b.urgency === "vencido" ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 bg-[var(--data-error-50)]/80 dark:bg-red-950/20" :
                  b.urgency === "critico" ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)]/50 dark:bg-orange-950/20" :
                  "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)]"
                )}
              >
                {/* Urgency icon */}
                <div className={cn("shrink-0 p-2 rounded-xl", cfg.bg)}>
                  <Icon className={cn("h-5 w-5", cfg.color)} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{b.productName}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cfg.bg, cfg.color)}>
                      {b.days < 0 ? `Venció hace ${Math.abs(b.days)} días` :
                       b.days === 0 ? "Vence hoy" :
                       `Vence en ${b.days} días`}
                    </span>
                    {isReviewed && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]">
                        ✓ Revisado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)] dark:text-muted">
                    <span>Lote: <strong>{b.lote}</strong></span>
                    <span>·</span>
                    <span>{b.quantity} {b.unit}</span>
                    <span>·</span>
                    <span>Vence: {fmtDate(b.expiryDate)}</span>
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => markReviewed(b.id)}
                  className={cn("shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors",
                    isReviewed
                      ? "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-surface"
                      : "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isReviewed ? "Desmarcar" : "Marcar revisado"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Stat Card Sub-component ────────────────────────────────────────────────────

function StatCard({ label, count, color, icon: Icon, onClick, active }: {
  label: string; count: number; color: string; icon: typeof AlertTriangle;
  onClick: () => void; active: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    red:     { bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", text: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" },
    orange:  { bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30", text: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]" },
    amber:   { bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", text: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]" },
    emerald: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" },
  };
  const c = colorMap[color] ?? colorMap.emerald;
  return (
    <button
      onClick={onClick}
      className={cn("rounded-xl p-4 text-left transition-all border-2",
        active ? c.border : "border-transparent",
        c.bg, "hover:scale-[1.02]"
      )}
    >
      <Icon className={cn("h-4 w-4 mb-1", c.text)} />
      <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">{label}</p>
      <p className={cn("text-2xl font-extrabold", c.text)}>{count}</p>
    </button>
  );
}
