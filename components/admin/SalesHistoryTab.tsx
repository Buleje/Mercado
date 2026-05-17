"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  History, Search, Download, Filter, X, Loader2,
  Store, ShoppingCart, Globe, User, Phone, ChevronRight, RefreshCw,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { escapeHtml } from "@/lib/safe-html";

// ── Types ────────────────────────────────────────────────────────────────────

type Source = "pos" | "tienda" | "marketplace";

interface TransactionItem {
  id: string;
  source: Source;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  payment: string;
  status: string;
  itemCount: number;
  itemsPreview: string;
  items: { name: string; quantity: number; price: number; unit: string }[];
}

interface TransactionsResponse {
  items: TransactionItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  kpis: {
    count: number;
    sum: number;
    avg: number;
    bySource: { pos: number; tienda: number; marketplace: number };
  };
}

type SourceFilter = "all" | Source;

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToInputDate(iso: string): string {
  return iso.slice(0, 10);
}

const SOURCE_META: Record<Source, { label: string; icon: typeof Store; cls: string }> = {
  pos: {
    label: "POS",
    icon: ShoppingCart,
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  tienda: {
    label: "Tienda online",
    icon: Store,
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  marketplace: {
    label: "Marketplace",
    icon: Globe,
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
};

// Mapa de status → color (compatible con Order statuses + Sale "completada")
function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "completada" || s === "entregado") return "bg-[var(--accent-soft)] text-[var(--data-success-500)]";
  if (s === "cancelado" || s === "cancelled") return "bg-[var(--data-error-50)] text-[var(--data-error-500)]";
  if (s === "pendiente" || s === "pending") return "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]";
  if (s === "confirmado" || s === "en_camino") return "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
  return "bg-gray-100 text-[var(--text-secondary)] dark:bg-white/5";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesHistoryTab() {
  // Filtros — default últimos 30 días
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoToInputDate(d.toISOString());
  });
  const [to, setTo] = useState<string>(() => todayISO());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Data
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detalle modal
  const [selected, setSelected] = useState<TransactionItem | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset page cuando cambia algún filtro
  useEffect(() => {
    setPage(1);
  }, [from, to, sourceFilter, debouncedQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
        source: sourceFilter,
        page: String(page),
        limit: String(LIMIT),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as TransactionsResponse;
      if (
        json &&
        Array.isArray(json.items) &&
        typeof json.total === "number"
      ) {
        setData(json);
      } else {
        setData(null);
        setError("Respuesta inválida del servidor");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, sourceFilter, debouncedQuery, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // KPIs derivados
  const kpis = data?.kpis ?? { count: 0, sum: 0, avg: 0, bySource: { pos: 0, tienda: 0, marketplace: 0 } };

  // Export Excel del set completo (re-fetch sin paginación)
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const handleExport = useCallback(async () => {
    // Brandon 2026-05-17 (audit A11): guard reentrant + AbortController.
    // Antes doble-click disparaba 2 loops paralelos (hasta 100 fetches).
    // El setState no funciona como mutex porque setExporting(true) es async,
    // por eso usamos un ref síncrono.
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setError(null);
    const ctrl = new AbortController();
    exportAbortRef.current = ctrl;
    try {
      const params = new URLSearchParams({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
        source: sourceFilter,
        page: "1",
        limit: "100",
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const rows: TransactionItem[] = [];
      let p = 1;
      while (true) {
        if (ctrl.signal.aborted) throw new Error("Exportación cancelada");
        params.set("page", String(p));
        const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} al cargar página ${p}`);
        const json = (await res.json()) as TransactionsResponse;
        if (!Array.isArray(json.items)) throw new Error("Respuesta inválida del servidor");
        rows.push(...json.items);
        if (!json.hasMore || p >= 50) break;
        p += 1;
      }

      const exportData = rows.map((r) => ({
        Fecha: formatDateTime(r.createdAt),
        Fuente: SOURCE_META[r.source].label,
        ID: r.id,
        Cliente: r.customerName ?? "—",
        Telefono: r.customerPhone ?? "—",
        Items: r.itemCount,
        Detalle: r.itemsPreview,
        Pago: r.payment,
        Estado: r.status,
        Total: r.total,
      }));
      await exportToExcel(exportData, `historial-ventas-${from}_${to}.xlsx`, "Ventas");
    } catch (e) {
      // Brandon 2026-05-17 (audit A11 + M8): error visible. Antes `catch {}`
      // silenciaba fallos de red, Excel offline, y respuestas inválidas — el
      // botón volvía a estado normal sin descarga y el usuario no entendía.
      const isAbort = e instanceof Error && (e.name === "AbortError" || e.message === "Exportación cancelada");
      if (!isAbort) {
        setError(e instanceof Error ? e.message : "Error al exportar");
      }
    } finally {
      exportingRef.current = false;
      exportAbortRef.current = null;
      setExporting(false);
    }
  }, [from, to, sourceFilter, debouncedQuery]);

  // Cancelar export en unmount o cuando cambian los filtros mid-export
  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="space-y-4 sm:space-y-5">
      <AdminModuleHeader
        eyebrow="Operaciones · Registro consolidado"
        title="Historial de ventas"
        description="Todas las ventas en un solo lugar: POS, tienda online y marketplace. Filtra por fecha, fuente y cliente."
        icon={History}
      />

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total vendido" value={fmt(kpis.sum)} accent="text-primary" />
        <KpiCard label="Operaciones" value={String(kpis.count)} accent="text-[var(--text-primary)]" />
        <KpiCard label="Ticket promedio" value={fmt(kpis.avg)} accent="text-[var(--text-primary)]" />
        <KpiCard
          label="Fuentes activas"
          value={`${kpis.bySource.pos} POS · ${kpis.bySource.tienda} Tienda · ${kpis.bySource.marketplace} Mkt`}
          accent="text-[var(--text-secondary)]"
          textSize="text-xs"
        />
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          {/* Búsqueda */}
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ID, cliente o teléfono"
                className="w-full pl-10 pr-9 h-12 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-white/5 text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Rango de fechas */}
          <div className="flex gap-2 w-full sm:w-auto">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Desde</label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="h-12 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Hasta</label>
              <input
                type="date"
                value={to}
                min={from}
                max={todayISO()}
                onChange={(e) => setTo(e.target.value)}
                className="h-12 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              title="Refrescar"
              className="h-12 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-white/5 text-[var(--text-secondary)] hover:border-primary/40 hover:text-primary disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || items.length === 0}
              className="h-12 px-4 rounded-xl border-2 border-primary/40 bg-primary/5 text-primary text-sm font-bold hover:bg-primary/10 disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Excel
            </button>
          </div>
        </div>

        {/* Chips de fuente */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--rule-soft)]">
          <Chip
            active={sourceFilter === "all"}
            onClick={() => setSourceFilter("all")}
            label="Todas"
            icon={Filter}
          />
          <Chip
            active={sourceFilter === "pos"}
            onClick={() => setSourceFilter("pos")}
            label={`POS ${kpis.bySource.pos > 0 ? `(${kpis.bySource.pos})` : ""}`}
            icon={ShoppingCart}
          />
          <Chip
            active={sourceFilter === "tienda"}
            onClick={() => setSourceFilter("tienda")}
            label={`Tienda ${kpis.bySource.tienda > 0 ? `(${kpis.bySource.tienda})` : ""}`}
            icon={Store}
          />
          <Chip
            active={sourceFilter === "marketplace"}
            onClick={() => setSourceFilter("marketplace")}
            label={`Marketplace ${kpis.bySource.marketplace > 0 ? `(${kpis.bySource.marketplace})` : ""}`}
            icon={Globe}
          />
        </div>
      </div>

      {/* ── Tabla / lista ────────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
        {error && (
          <div className="px-4 py-3 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 border-b border-[var(--data-error-500)]/30">
            <p className="text-sm text-[var(--data-error-500)] font-semibold">
              {error} · <button onClick={() => void fetchData()} className="underline">Reintentar</button>
            </p>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <History className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-base font-semibold text-[var(--text-primary)] mb-1">Sin transacciones</p>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
              No hay ventas en el rango seleccionado. Ajusta la fecha o el filtro de fuente.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] dark:bg-white/[0.03]">
                  <tr className="text-left">
                    <Th>Fecha</Th>
                    <Th>Fuente</Th>
                    <Th>Cliente</Th>
                    <Th>Items</Th>
                    <Th>Pago</Th>
                    <Th>Estado</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="w-10"></Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => {
                    const meta = SOURCE_META[t.source];
                    const Icon = meta.icon;
                    return (
                      <tr
                        key={`${t.source}-${t.id}`}
                        onClick={() => setSelected(t)}
                        className="border-t border-[var(--rule-soft)] dark:border-white/5 cursor-pointer hover:bg-[var(--surface-sunken)]/40"
                      >
                        <Td>{formatDateTime(t.createdAt)}</Td>
                        <Td>
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold", meta.cls)}>
                            <Icon className="h-3 w-3" strokeWidth={2} />
                            {meta.label}
                          </span>
                        </Td>
                        <Td className="max-w-[180px]">
                          <p className="font-semibold text-[var(--text-primary)] truncate">{t.customerName ?? "—"}</p>
                          {t.customerPhone && (
                            <p className="text-xs text-[var(--text-tertiary)] truncate">{t.customerPhone}</p>
                          )}
                        </Td>
                        <Td className="max-w-[220px]">
                          <p className="text-[var(--text-secondary)] truncate" title={t.itemsPreview}>{t.itemsPreview}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{t.itemCount} producto{t.itemCount === 1 ? "" : "s"}</p>
                        </Td>
                        <Td className="capitalize">{t.payment}</Td>
                        <Td>
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold capitalize", statusBadgeClass(t.status))}>
                            {t.status.replace(/_/g, " ")}
                          </span>
                        </Td>
                        <Td className="text-right font-extrabold tabular-nums text-primary">{fmt(t.total)}</Td>
                        <Td>
                          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-[var(--rule-soft)] dark:divide-white/5">
              {items.map((t) => {
                const meta = SOURCE_META[t.source];
                const Icon = meta.icon;
                return (
                  <button
                    key={`m-${t.source}-${t.id}`}
                    onClick={() => setSelected(t)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--surface-sunken)]/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold", meta.cls)}>
                        <Icon className="h-3 w-3" strokeWidth={2} />
                        {meta.label}
                      </span>
                      <span className="text-lg font-extrabold text-primary tabular-nums">{fmt(t.total)}</span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {t.customerName ?? "Sin cliente"}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{t.itemsPreview}</p>
                    <div className="flex items-center justify-between mt-1.5 text-xs text-[var(--text-tertiary)]">
                      <span>{formatDateTime(t.createdAt)}</span>
                      <span className={cn("px-1.5 py-0.5 rounded-md font-semibold capitalize", statusBadgeClass(t.status))}>
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Paginación */}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)] dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
            <p className="text-xs text-[var(--text-tertiary)]">
              Página {page} de {totalPages} · {total} {total === 1 ? "transacción" : "transacciones"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore || loading}
                className="px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal detalle ────────────────────────────────────────────────── */}
      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function KpiCard({ label, value, accent, textSize = "text-xl" }: { label: string; value: string; accent: string; textSize?: string }) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className={cn("font-extrabold tabular-nums", accent, textSize)}>{value}</p>
    </div>
  );
}

function Chip({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon: typeof Filter }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors",
        active
          ? "bg-primary text-white border-primary"
          : "bg-white dark:bg-white/5 text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary/40 hover:text-primary"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

function DetailModal({ item, onClose }: { item: TransactionItem; onClose: () => void }) {
  const meta = SOURCE_META[item.source];
  const Icon = meta.icon;

  // Cerrar con Escape
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const printTicket = () => {
    if (typeof window === "undefined") return;
    const w = window.open("", "_blank", "width=320,height=600");
    if (!w) return;

    // Brandon 2026-05-17 (audit C2): escapeHtml en TODO valor user-provided.
    // Antes: ${item.customerName} interpolado crudo en document.write → XSS
    // si el nombre del cliente fue capturado con un payload <script>alert()
    // </script> en alguna entrada legacy. Ahora todos los strings pasan por
    // escapeHtml() de lib/safe-html.ts.
    const itemsHtml = item.items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.name)}</td><td style="text-align:right">${i.quantity} × ${Number(i.price).toFixed(2)}</td></tr>`,
      )
      .join("");

    const fechaStr = new Date(item.createdAt).toLocaleString("es-PE");
    const html = `
      <html><head><title>Ticket ${escapeHtml(item.id)}</title>
      <style>
        body { font-family: monospace; padding: 8px; font-size: 12px; }
        h2 { text-align: center; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; }
        .total { font-size: 16px; font-weight: bold; border-top: 1px dashed #000; margin-top: 6px; padding-top: 6px; text-align: right; }
        .meta { text-align: center; color: #666; }
      </style>
      </head><body>
      <h2>${escapeHtml(meta.label.toUpperCase())}</h2>
      <p class="meta">${escapeHtml(fechaStr)}</p>
      <p class="meta">ID: ${escapeHtml(item.id)}</p>
      ${item.customerName ? `<p>Cliente: ${escapeHtml(item.customerName)}</p>` : ""}
      ${item.customerPhone ? `<p>Tel: ${escapeHtml(item.customerPhone)}</p>` : ""}
      <hr/>
      <table>${itemsHtml}</table>
      <div class="total">TOTAL: S/ ${Number(item.total).toFixed(2)}</div>
      <p>Pago: ${escapeHtml(item.payment)}</p>
      <p>Estado: ${escapeHtml(item.status)}</p>
      <script>window.print();</script>
      </body></html>
    `;
    w.document.write(html);
    w.document.close();
  };

  const subtotal = item.items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  return (
    <div
      className="modal-backdrop p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", meta.cls)}>
              <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg font-bold">Detalle de venta</CardTitle>
              <p className="text-sm text-[var(--text-tertiary)] truncate">
                {meta.label} · {formatDateTime(item.createdAt)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] font-mono truncate mt-0.5">{item.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 rounded-lg transition-colors shrink-0"
          >
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Cliente */}
          {(item.customerName || item.customerPhone) && (
            <div className="rounded-xl bg-[var(--surface-alt)] dark:bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">Cliente</p>
              <div className="flex items-center gap-2 mb-1">
                <User className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-base font-semibold text-[var(--text-primary)]">{item.customerName ?? "Sin nombre"}</span>
              </div>
              {item.customerPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <span className="text-sm text-[var(--text-secondary)]">{item.customerPhone}</span>
                </div>
              )}
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
              Productos · {item.items.length}
            </p>
            <div className="rounded-xl border border-[var(--rule-base)] divide-y divide-[var(--rule-soft)] overflow-hidden">
              {item.items.map((i, idx) => (
                <div key={idx} className="px-3 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-white/[0.02]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{i.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
                      {i.quantity} × S/ {i.price.toFixed(2)} ({i.unit})
                    </p>
                  </div>
                  <p className="text-base font-bold text-[var(--text-primary)] tabular-nums shrink-0">
                    S/ {(i.price * i.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="rounded-xl bg-[var(--surface-alt)] dark:bg-white/5 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Subtotal</span>
              <span className="font-semibold text-[var(--text-primary)] tabular-nums">S/ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Pago</span>
              <span className="font-semibold text-[var(--text-primary)] capitalize">{item.payment}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Estado</span>
              <span className={cn("px-2 py-0.5 rounded-md text-xs font-semibold capitalize", statusBadgeClass(item.status))}>
                {item.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-[var(--rule-base)]">
              <span className="text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Total</span>
              <span className="text-2xl font-extrabold text-primary tabular-nums">S/ {item.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={printTicket}
            className="flex-1 h-12 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-5 w-5" />
            Imprimir ticket
          </button>
        </div>
      </div>
    </div>
  );
}
