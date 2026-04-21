"use client";
import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Download, Eye, X, ChevronLeft, ChevronRight, CalendarOff } from "@buleje/design-system/icons";
import { exportToExcel } from "@/lib/export-excel";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";

type DailySummary = {
  id: string;
  fecha: string;
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  efectivoContado: number | null;
  efectivoEsperado: number;
  diferenciaCaja: number;
  fiadosCobrados: number;
  fiadosNuevos: number;
  fiadosVencidos: number;
  mejorHora: string | null;
  productoTop: string | null;
  stockAlertas: string | null;
  notas: string | null;
  creadoPor: string;
  createdAt: string;
};

type HistoryResponse = {
  items: DailySummary[];
  total: number;
  page: number;
  limit: number;
};

function formatFecha(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(n: number | null | undefined) {
  if (n == null) return "N/A";
  return `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function HistorialCierresTab() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DailySummary | null>(null);
  const LIMIT = 30;

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cierre-diario/history?page=${p}&limit=${LIMIT}`);
      if (res.ok) {
        const json: HistoryResponse = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  const handleExport = () => {
    if (!data?.items.length) return;
    const rows = data.items.map((s) => ({
      Fecha: formatFecha(s.fecha),
      "Total Ventas": Number(s.totalVentas),
      "Cantidad Ventas": s.cantidadVentas,
      "Ticket Promedio": Number(s.ticketPromedio),
      "Efectivo Contado": s.efectivoContado != null ? Number(s.efectivoContado) : "N/A",
      "Efectivo Esperado": Number(s.efectivoEsperado),
      "Diferencia Caja": Number(s.diferenciaCaja),
      "Fiados Cobrados": Number(s.fiadosCobrados),
      "Fiados Nuevos": Number(s.fiadosNuevos),
      "Fiados Vencidos": s.fiadosVencidos,
      "Mejor Hora": s.mejorHora ?? "",
      "Producto Top": s.productoTop ?? "",
      Notas: s.notas ?? "",
      "Creado Por": s.creadoPor,
    }));
    exportToExcel(rows as Record<string, unknown>[], `historial-cierres-pag${page}`, "Cierres");
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">
            Historial de Cierres
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
            {data ? `${data.total} cierres registrados` : "Cargando..."}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!data?.items.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Descargar Excel
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={4} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl" />
      ) : !data?.items.length ? (
        <EmptyState
          icon={CalendarOff}
          title="Sin cierres de caja"
          description="No hay cierres de caja registrados aún. Usa el botón «Cerrar día» en la barra superior para crear el primer cierre."
        />
      ) : (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                  <th className="text-right px-4 py-3 font-semibold text-[var(--text-secondary)] dark:text-muted">Ventas</th>
                  <th className="text-right px-4 py-3 font-semibold text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">Caja</th>
                  <th className="text-right px-4 py-3 font-semibold text-[var(--text-secondary)] dark:text-muted">Diferencia</th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const dif = Number(s.diferenciaCaja);
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--rule-soft)] dark:border-card-border last:border-0 hover:bg-gray-50 dark:hover:bg-accent transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)] dark:text-foreground whitespace-nowrap">
                        {formatFecha(s.fecha)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                        {formatMoney(s.totalVentas)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">
                        {formatMoney(s.efectivoContado)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${
                          dif > 0 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" :
                          dif < 0 ? "text-[var(--data-error)]" :
                          "text-[var(--text-secondary)] dark:text-foreground"
                        }`}>
                          {s.efectivoContado != null ? (
                            <>{dif >= 0 ? "+" : ""}S/ {dif.toFixed(2)}</>
                          ) : (
                            <span className="text-[var(--text-tertiary)] dark:text-muted">N/A</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setDetail(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-base)] dark:border-card-border">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <span className="text-xs text-[var(--text-secondary)] dark:text-muted">
                P&aacute;gina {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {detail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="modal-backdrop" onClick={() => setDetail(null)} />
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border w-full max-w-lg max-h-[85vh] overflow-y-auto z-10 mx-4"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule-base)] dark:border-card-border sticky top-0 bg-white dark:bg-card">
                <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">
                  Cierre &mdash; {formatFecha(detail.fecha)}
                </CardTitle>
                <button
                  onClick={() => setDetail(null)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Ventas */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-primary">Ventas</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Total vendido</p>
                      <p className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">{formatMoney(detail.totalVentas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">N&ordm; de ventas</p>
                      <p className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">{detail.cantidadVentas}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Ticket promedio</p>
                      <p className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">{formatMoney(detail.ticketPromedio)}</p>
                    </div>
                    {detail.mejorHora && (
                      <div>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Mejor hora</p>
                        <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">{detail.mejorHora}</p>
                      </div>
                    )}
                  </div>
                  {detail.productoTop && (
                    <p className="text-sm text-[var(--text-secondary)] dark:text-muted">M&aacute;s vendido: <strong>{detail.productoTop}</strong></p>
                  )}
                </div>

                <div className="h-px bg-gray-100 dark:bg-card-border" />

                {/* Caja */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">Caja</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Contado</p>
                      <p className="text-base font-bold text-[var(--text-primary)] dark:text-foreground">{formatMoney(detail.efectivoContado)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Esperado</p>
                      <p className="text-base font-bold text-[var(--text-primary)] dark:text-foreground">{formatMoney(detail.efectivoEsperado)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Diferencia</p>
                      {detail.efectivoContado != null ? (
                        <p className={`text-base font-bold ${
                          Number(detail.diferenciaCaja) >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]"
                        }`}>
                          {Number(detail.diferenciaCaja) >= 0 ? "+" : ""}S/ {Number(detail.diferenciaCaja).toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-base text-[var(--text-tertiary)] dark:text-muted">N/A</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-card-border" />

                {/* Fiados */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)]">Fiados</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Cobrados</p>
                      <p className="text-base font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">{formatMoney(detail.fiadosCobrados)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Nuevos</p>
                      <p className="text-base font-bold text-[var(--data-warning)]">{formatMoney(detail.fiadosNuevos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Vencidos</p>
                      <p className={`text-base font-bold ${detail.fiadosVencidos > 0 ? "text-[var(--data-error)]" : "text-[var(--text-secondary)] dark:text-foreground"}`}>
                        {detail.fiadosVencidos}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stock alerts */}
                {detail.stockAlertas && (
                  <>
                    <div className="h-px bg-gray-100 dark:bg-card-border" />
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">Alertas de stock</p>
                      <div className="text-sm text-[var(--text-secondary)] dark:text-muted space-y-1">
                        {(() => {
                          try {
                            const items = JSON.parse(detail.stockAlertas as string) as Array<{ nombre: string; stock: number; stockMin: number }>;
                            return items.map((item, i) => (
                              <div key={i} className="flex justify-between">
                                <span className="truncate mr-2">{item.nombre}</span>
                                <span className="font-bold text-[var(--data-error)] shrink-0">{item.stock}/{item.stockMin}</span>
                              </div>
                            ));
                          } catch {
                            return <p>{detail.stockAlertas}</p>;
                          }
                        })()}
                      </div>
                    </div>
                  </>
                )}

                {/* Notes */}
                {detail.notas && (
                  <>
                    <div className="h-px bg-gray-100 dark:bg-card-border" />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1">Notas</p>
                      <p className="text-sm text-[var(--text-primary)] dark:text-foreground whitespace-pre-wrap">{detail.notas}</p>
                    </div>
                  </>
                )}

                {/* Footer */}
                <div className="pt-2 text-xs text-[var(--text-tertiary)] dark:text-muted">
                  Creado por: {detail.creadoPor} &middot; {new Date(detail.createdAt).toLocaleString("es-PE")}
                </div>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
