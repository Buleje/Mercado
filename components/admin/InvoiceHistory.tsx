"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import {
  FileText, Search, RefreshCw,
  Loader2, ChevronLeft, ChevronRight,
  XCircle } from "@buleje/design-system/icons";

// ── Types ────────────────────────────────────────────────────────────────────

interface InvoiceRecord {
  id: string;
  tipo: "boleta" | "factura";
  serie: string;
  número: string;
  numeroCompleto: string;
  clienteNombre: string;
  clienteDoc: string;
  fecha: string;
  total: number;
  igv: number;
  estado: "emitido" | "anulado" | "pendiente";
}

type EstadoFilter = "todos" | "emitido" | "anulado" | "pendiente";
type TipoFilter = "todos" | "boleta" | "factura";

const ITEMS_PER_PAGE = 20;

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Estado badge ─────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: InvoiceRecord["estado"] }) {
  const styles = {
    emitido:
      "bg-[var(--accent-soft)] text-[var(--data-success)] border-[var(--data-success)]/30 dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)] dark:border-[var(--data-success)]/30",
    anulado:
      "bg-[var(--data-error-50)] text-[var(--data-error)] border-[var(--data-error)] dark:bg-red-950/20 dark:text-[var(--data-error)] dark:border-[var(--data-error)]/30",
    pendiente:
      "bg-[var(--data-warning-50)] text-[var(--data-warning)] border-[var(--data-warning)] dark:bg-amber-950/20 dark:text-[var(--data-warning)] dark:border-[var(--data-warning)]/30",
  };

  const labels = { emitido: "Emitido", anulado: "Anulado", pendiente: "Pendiente" };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[length:var(--ts-xs)] font-bold ${styles[estado]}`}
    >
      {labels[estado]}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function InvoiceHistory() {
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("todos");
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (estadoFilter !== "todos") params.set("estado", estadoFilter);
      if (tipoFilter !== "todos") params.set("tipo", tipoFilter);
      if (searchTerm) params.set("q", searchTerm);
      params.set("page", String(page));
      params.set("limit", String(ITEMS_PER_PAGE));

      const res = await fetch(`/api/invoices?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar comprobantes");

      const data = await res.json();
      setRecords(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
    } catch {
      setError("No se pudieron cargar los comprobantes");
      setRecords([]);
    }
    setLoading(false);
  }, [estadoFilter, tipoFilter, searchTerm, page]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [estadoFilter, tipoFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(records.length / ITEMS_PER_PAGE));
  const paginatedRecords = records.slice(0, ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">
            Historial de Comprobantes
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
            Boletas y facturas emitidas
          </p>
        </div>
        <button
          onClick={fetchRecords}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-surface text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-surface/80 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, número..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm text-[var(--text-primary)] dark:text-foreground placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>

        {/* Tipo */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1">
          {(["todos", "boleta", "factura"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipoFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tipoFilter === t
                  ? "bg-white dark:bg-card text-primary "
                  : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]"
              }`}
            >
              {t === "todos" ? "Todos" : t === "boleta" ? "Boletas" : "Facturas"}
            </button>
          ))}
        </div>

        {/* Estado */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1">
          {(["todos", "emitido", "anulado", "pendiente"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEstadoFilter(e)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                estadoFilter === e
                  ? "bg-white dark:bg-card text-primary "
                  : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]"
              }`}
            >
              {e === "todos" ? "Todos" : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="text-center py-8">
          <XCircle className="h-8 w-8 text-[var(--data-error)] mx-auto mb-2" />
          <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)] font-semibold">{error}</p>
          <button
            onClick={fetchRecords}
            className="mt-2 text-xs font-bold text-primary hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-10 w-10 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted font-semibold">
            No hay comprobantes registrados
          </p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">
            Los comprobantes emitidos aparecerán aquí
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-secondary)] dark:text-muted uppercase border-b border-[var(--rule-base)] dark:border-card-border">
                  <th className="text-left py-2 px-2 font-bold">Tipo</th>
                  <th className="text-left py-2 px-2 font-bold">Serie-Número</th>
                  <th className="text-left py-2 px-2 font-bold">Cliente</th>
                  <th className="text-left py-2 px-2 font-bold">Fecha</th>
                  <th className="text-right py-2 px-2 font-bold">Total</th>
                  <th className="text-center py-2 px-2 font-bold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-[var(--rule-soft)] dark:border-card-border/50 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors"
                  >
                    <td className="py-2.5 px-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[length:var(--ts-xs)] font-bold ${
                          record.tipo === "factura"
                            ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {record.tipo === "factura" ? "Factura" : "Boleta"}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono font-bold text-[var(--text-primary)] dark:text-foreground">
                      {record.numeroCompleto}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="text-[var(--text-primary)] dark:text-foreground font-semibold">
                        {record.clienteNombre}
                      </div>
                      {record.clienteDoc && (
                        <div className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                          {record.clienteDoc}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-[var(--text-secondary)] dark:text-muted">
                      {fmtDate(record.fecha)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                      {fmt(record.total)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <EstadoBadge estado={record.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {paginatedRecords.map((record) => (
              <div
                key={record.id}
                className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[length:var(--ts-xs)] font-bold ${
                      record.tipo === "factura"
                        ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {record.tipo === "factura" ? "Factura" : "Boleta"}
                  </span>
                  <EstadoBadge estado={record.estado} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-[var(--text-primary)] dark:text-foreground">
                    {record.numeroCompleto}
                  </span>
                  <span className="font-extrabold text-primary">{fmt(record.total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] dark:text-muted">
                  <span>{record.clienteNombre}</span>
                  <span>{fmtDate(record.fecha)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
              {records.length} comprobante{records.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-surface disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-surface disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
