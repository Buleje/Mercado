"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Scale, FileText, AlertTriangle, CheckCircle, Clock, Calendar, Download, Search, Building2, RefreshCw, Bell } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { ComplianceItem } from "@/app/api/compliance/route";

const STATUS_CONFIG = {
  "vigente":     { label: "Vigente",           icon: CheckCircle,    color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", border: "border-[var(--rule-base)] dark:border-card-border" },
  "por-vencer":  { label: "Por vencer",         icon: Calendar,       color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",             border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30" },
  "vencido":     { label: "Vencido",            icon: AlertTriangle,  color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",                 border: "border-[var(--data-error)] dark:border-[var(--data-error)]/30" },
  "pendiente":   { label: "Pendiente",          icon: Clock,          color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",          border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]/30" },
};

const CATEGORY_LABELS: Record<string, string> = {
  sunat: "SUNAT", municipal: "Municipal", sanitario: "Sanitario", seguridad: "Seg. Civil",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string | null) {
  return iso && iso !== "—"
    ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}

export default function ComplianceTab() {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compliance");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items ?? []);
      setIsDemo(!!data.demo);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus !== "all") list = list.filter(o => o.status === filterStatus);
    if (filterCategory !== "all") list = list.filter(o => o.category === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => o.title.toLowerCase().includes(q) || o.entity.toLowerCase().includes(q));
    }
    return list;
  }, [items, filterStatus, filterCategory, search]);

  const vigente   = items.filter(o => o.status === "vigente").length;
  const porVencer = items.filter(o => o.status === "por-vencer" || o.status === "pendiente").length;
  const vencidos  = items.filter(o => o.status === "vencido").length;

  // Alertas críticas: vencidos + por vencer en <7 días
  const alertas = items.filter(o => o.status === "vencido" || (o.status === "por-vencer" && daysUntil(o.nextDue) <= 7));

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Scale className="h-6 w-6 text-primary" /> Cumplimiento Regulatorio
            {isDemo && <span className="text-xs font-normal text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">SUNAT · Municipalidad · Defensa Civil · Sanidad</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface text-[var(--text-tertiary)]">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(filtered.map(o => ({ obligacion: o.title, entidad: o.entity, categoria: o.category, frecuencia: o.frequency, proximo_vencimiento: fmtDate(o.nextDue), estado: o.status, ultimo_presentado: fmtDate(o.lastFiled) })), "cumplimiento")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Alertas críticas */}
      {!loading && alertas.length > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)]/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-[var(--data-error)]" />
            <span className="font-bold text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">Atención requerida ({alertas.length})</span>
          </div>
          <div className="space-y-1">
            {alertas.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
                <span className="font-bold">{a.title}</span>
                <span className="text-[var(--data-error)]">·</span>
                <span>{a.status === "vencido" ? "Vencido" : `Vence en ${daysUntil(a.nextDue)} días (${fmtDate(a.nextDue)})`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total obligaciones", value: items.length, color: "text-[var(--data-success)]" },
          { label: "Vigentes",           value: vigente,       color: "text-[var(--data-success)]" },
          { label: "Pendientes / próx.", value: porVencer,     color: "text-[var(--data-warning)]" },
          { label: "Vencidos",           value: vencidos,      color: vencidos > 0 ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            {loading
              ? <div className="h-7 w-12 bg-[var(--surface-sunken)] dark:bg-surface rounded animate-pulse mt-1" />
              : <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm"
            placeholder="Buscar obligación o entidad…" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", "vigente", "por-vencer", "pendiente", "vencido"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors",
                filterStatus === s ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
              {s === "all" ? "Todos" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", "sunat", "municipal", "sanitario", "seguridad"].map(c => (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors",
                filterCategory === c ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
              {c === "all" ? "Categorías" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)]">
          <Scale className="h-10 w-10 mb-2" />
          <p className="text-sm">Sin obligaciones para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const S = STATUS_CONFIG[o.status];
            const SIcon = S.icon;
            const days = daysUntil(o.nextDue);
            return (
              <div key={o.id} className={cn("bg-white dark:bg-card rounded-xl border p-4 sm:p-5", S.border)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground">{o.title}</CardTitle>
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5", S.color)}>
                        <SIcon className="h-2.5 w-2.5" /> {S.label}
                      </span>
                      <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted">
                        {CATEGORY_LABELS[o.category] ?? o.category}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-2">{o.description}</p>
                    <div className="flex items-center gap-3 sm:gap-5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex-wrap">
                      <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{o.entity}</span>
                      <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{o.frequency}</span>
                      <span className={cn("font-semibold", days <= 7 && days >= 0 ? "text-[var(--data-warning)]" : days < 0 ? "text-[var(--data-error)]" : "text-[var(--text-secondary)]")}>
                        Próx. venc.: {fmtDate(o.nextDue)}{days <= 30 && days >= 0 ? ` (en ${days} días)` : days < 0 ? ` (hace ${Math.abs(days)} días)` : ""}
                      </span>
                      <span>Último: {fmtDate(o.lastFiled)}</span>
                    </div>
                    {o.documents.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {o.documents.map(d => (
                          <span key={d} className="text-[length:var(--ts-2xs)] bg-gray-50 dark:bg-surface text-[var(--text-secondary)] dark:text-muted px-2 py-0.5 rounded flex items-center gap-0.5">
                            <FileText className="h-2.5 w-2.5" />{d}
                          </span>
                        ))}
                      </div>
                    )}
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
