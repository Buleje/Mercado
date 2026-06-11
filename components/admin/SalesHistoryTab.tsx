"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  History, Search, Download, Filter, X, Loader2,
  Store, ShoppingCart, Globe, User, Phone, ChevronRight, RefreshCw,
  Printer, Wallet, CreditCard, Banknote, Receipt, Calendar,
  Package, CheckCircle2, Clock, AlertCircle,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import ProductImagePlaceholder from "@/components/store/ProductImagePlaceholder";
import { cn } from "@/lib/utils";
import { extractIgv } from "@/lib/tax";
import { exportToExcel } from "@/lib/export-excel";
import { escapeHtml } from "@/lib/safe-html";

// ── Types ────────────────────────────────────────────────────────────────────

type Source = "pos" | "tienda" | "marketplace";

interface SaleItemLine {
  name: string;
  quantity: number;
  price: number;
  unit: string;
  /** URL de imagen del producto — opcional; el payload actual no la incluye. */
  imageUrl?: string | null;
}

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
  items: SaleItemLine[];
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
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
};

// Mapa método de pago → icono + label
function paymentMeta(payment: string): { iconKey: "credit" | "wallet" | "cash" | "receipt"; label: string } {
  const p = payment.toLowerCase();
  if (p.includes("tarjeta") || p.includes("card") || p.includes("visa") || p.includes("mastercard"))
    return { iconKey: "credit", label: payment };
  if (p.includes("yape") || p.includes("plin") || p.includes("transferencia") || p.includes("billetera"))
    return { iconKey: "wallet", label: payment };
  if (p.includes("efectivo") || p.includes("cash") || p.includes("—") || p === "")
    return { iconKey: "cash", label: payment || "Efectivo" };
  return { iconKey: "receipt", label: payment };
}

/** Renderiza el icono correcto según la clave de pago. */
function PaymentIcon({ iconKey, className }: { iconKey: "credit" | "wallet" | "cash" | "receipt"; className?: string }) {
  if (iconKey === "credit") return <CreditCard className={className} />;
  if (iconKey === "wallet") return <Wallet className={className} />;
  if (iconKey === "cash") return <Banknote className={className} />;
  return <Receipt className={className} />;
}

// Mapa de status → variante visual
function statusVariant(status: string): "success" | "error" | "warning" | "default" {
  const s = status.toLowerCase();
  if (s === "completada" || s === "entregado") return "success";
  if (s === "cancelado" || s === "cancelled") return "error";
  if (s === "pendiente" || s === "pending") return "warning";
  return "default";
}

/** Renderiza el icono correcto según el estado. */
function StatusIcon({ variant, className }: { variant: "success" | "error" | "warning" | "default"; className?: string }) {
  if (variant === "success") return <CheckCircle2 className={className} />;
  if (variant === "error") return <AlertCircle className={className} />;
  if (variant === "warning") return <Clock className={className} />;
  return <Receipt className={className} />;
}

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
                          {/* Mini-strip de thumbnails (hasta 3) */}
                          {t.items.length > 0 && (
                            <div className="flex items-center gap-1 mb-1">
                              {t.items.slice(0, 3).map((item, idx) => (
                                <div
                                  key={idx}
                                  className="relative h-7 w-7 rounded-md overflow-hidden shrink-0 border border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
                                  title={item.name}
                                >
                                  {item.imageUrl ? (
                                    <Image
                                      src={item.imageUrl}
                                      alt={item.name}
                                      fill
                                      sizes="28px"
                                      className="object-cover"
                                    />
                                  ) : (
                                    <ProductImagePlaceholder
                                      size={14}
                                      showLabel={false}
                                      className="rounded-md"
                                    />
                                  )}
                                </div>
                              ))}
                              {t.items.length > 3 && (
                                <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] leading-none ml-0.5">
                                  +{t.items.length - 3}
                                </span>
                              )}
                            </div>
                          )}
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

/**
 * ProductThumb — thumbnail 48×48 con fallback al placeholder del DS.
 * Definido inline (no necesita archivo propio a esta escala).
 */
function ProductThumb({ imageUrl, name }: { imageUrl?: string | null; name: string }) {
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !imageUrl || imgError;
  return (
    <div className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
      {showPlaceholder ? (
        <ProductImagePlaceholder size={20} showLabel={false} />
      ) : (
        <Image
          src={imageUrl!}
          alt={name}
          fill
          sizes="48px"
          className="object-cover"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}

function DetailModal({ item, onClose }: { item: TransactionItem; onClose: () => void }) {
  const meta = SOURCE_META[item.source];
  const ChannelIcon = meta.icon;
  const { iconKey: payIconKey, label: payLabel } = paymentMeta(item.payment);
  const statusVar = statusVariant(item.status);

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

  // QA Brandon 2026-06-10 #5: los precios YA incluyen IGV — antes esta suma
  // se mostraba como "Subtotal" (confuso contablemente: era el total).
  // Desglosamos igual que el POS: Subtotal (base sin IGV) + IGV = Total.
  const totalConIgv = item.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const { base: subtotal, igv } = extractIgv(totalConIgv);

  return (
    <div
      className="modal-backdrop p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-lg)] ring-1 ring-[var(--rule-base)] max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header con hero total ──────────────────────────────────────── */}
        <div className={cn(
          "relative px-6 pt-5 pb-4 border-b border-[var(--rule-soft)]",
          "bg-linear-to-br",
          item.source === "pos"
            ? "from-emerald-50/60 to-transparent dark:from-emerald-500/8 dark:to-transparent"
            : item.source === "tienda"
              ? "from-sky-50/60 to-transparent dark:from-sky-500/8 dark:to-transparent"
              : "from-amber-50/60 to-transparent dark:from-amber-500/8 dark:to-transparent"
        )}>
          {/* Fila superior: canal badge + cerrar */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border",
              item.source === "pos"
                ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                : item.source === "tienda"
                  ? "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30"
                  : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
            )}>
              <ChannelIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
              {meta.label}
            </span>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors shrink-0"
            >
              <X className="h-5 w-5 text-[var(--text-tertiary)]" />
            </button>
          </div>

          {/* Total hero */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-0.5">
                Total cobrado
              </p>
              <p className="text-4xl font-extrabold tabular-nums text-[var(--text-primary)] leading-none">
                S/ {item.total.toFixed(2)}
              </p>
            </div>
            <div className="text-right space-y-1 pb-0.5">
              <div className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold",
                statusBadgeClass(item.status)
              )}>
                <StatusIcon variant={statusVar} className="h-3.5 w-3.5" />
                {item.status.replace(/_/g, " ")}
              </div>
            </div>
          </div>

          {/* Meta-fila: fecha · pago · ID */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateTime(item.createdAt)}
            </span>
            <span className="flex items-center gap-1 capitalize">
              <PaymentIcon iconKey={payIconKey} className="h-3.5 w-3.5" />
              {payLabel}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Receipt className="h-3.5 w-3.5" />
              <span className="truncate max-w-[120px]" title={item.id}>{item.id}</span>
            </span>
          </div>
        </div>

        {/* ── Body scrollable ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--rule-soft)]">

          {/* Cliente */}
          {(item.customerName || item.customerPhone) && (
            <div className="px-6 py-4">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
                Cliente
              </p>
              <div className="flex items-center gap-3">
                {/* Avatar inicial */}
                <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 ring-2 ring-primary/20">
                  <span className="text-base font-extrabold text-primary leading-none uppercase">
                    {(item.customerName ?? "?")[0]}
                  </span>
                </div>
                <div>
                  <p className="text-base font-bold text-[var(--text-primary)]">
                    {item.customerName ?? "Sin nombre"}
                  </p>
                  {item.customerPhone && (
                    <div className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                      <Phone className="h-3.5 w-3.5" />
                      {item.customerPhone}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Productos con thumbnail */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                Productos
              </p>
              <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full">
                {item.itemCount} unid.
              </span>
            </div>
            <div className="space-y-2">
              {item.items.map((lineItem, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-xl bg-[var(--surface-canvas)] dark:bg-white/[0.03] border border-[var(--rule-soft)] hover:border-[var(--rule-base)] transition-colors"
                >
                  {/* Thumbnail 48×48 */}
                  <ProductThumb imageUrl={lineItem.imageUrl} name={lineItem.name} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                      {lineItem.name}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] tabular-nums mt-0.5">
                      {lineItem.quantity} {lineItem.unit} × S/{lineItem.price.toFixed(2)}
                    </p>
                  </div>

                  {/* Subtotal línea */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
                      S/{(lineItem.price * lineItem.quantity).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen totales */}
          <div className="px-6 py-4">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
              Resumen
            </p>
            <div className="space-y-2">
              {/* QA Brandon 2026-06-10 #5: desglose IGV como en el POS —
                  Subtotal = base sin IGV; antes se mostraba el total con IGV
                  bajo la etiqueta "Subtotal" (confusión contable). */}
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Subtotal (sin IGV)</span>
                <span className="font-semibold text-[var(--text-primary)] tabular-nums">S/ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">IGV (18%)</span>
                <span className="font-semibold text-[var(--text-primary)] tabular-nums">S/ {igv.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <PaymentIcon iconKey={payIconKey} className="h-4 w-4" />
                  Método de pago
                </span>
                <span className="font-semibold text-[var(--text-primary)] capitalize">{payLabel}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <Package className="h-4 w-4" />
                  Productos distintos
                </span>
                <span className="font-semibold text-[var(--text-primary)]">{item.items.length}</span>
              </div>
              {/* Total final */}
              <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-[var(--rule-base)]">
                <span className="text-base font-bold text-[var(--text-primary)]">Total</span>
                <span className="text-3xl font-extrabold text-primary tabular-nums leading-none">
                  S/ {item.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={printTicket}
            className="flex-1 h-12 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Printer className="h-5 w-5" />
            Imprimir ticket
          </button>
        </div>
      </div>
    </div>
  );
}
