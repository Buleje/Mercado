"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Users, Smartphone, Tablet, Monitor, RefreshCw, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";

type VisitorRow = {
  id: string;
  name: string;
  devices: string[];
  userAgent: string | null;
  createdAt: string;
};

type PageData = {
  data: VisitorRow[];
  total: number;
  page: number;
  limit: number;
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  celular: <Smartphone className="w-3.5 h-3.5 inline mr-1" />,
  tablet: <Tablet className="w-3.5 h-3.5 inline mr-1" />,
  computadora: <Monitor className="w-3.5 h-3.5 inline mr-1" />,
};

const DEVICE_COLORS: Record<string, string> = {
  celular: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  tablet: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  computadora: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-[var(--accent)]/20 dark:text-[var(--text-primary)]",
};

export default function VisitantesTab() {
  const [data, setData] = useState<VisitorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visitor-welcome?page=${p}&limit=${LIMIT}`);
      if (!res.ok) throw new Error();
      const json: PageData = await res.json();
      setData(json.data);
      setTotal(json.total);
      setPage(json.page);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  // Stats
  const deviceCounts = data.reduce<Record<string, number>>((acc, row) => {
    row.devices.forEach((d) => { acc[d] = (acc[d] ?? 0) + 1; });
    return acc;
  }, {});

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-lg font-bold text-foreground">Visitantes Nuevos</SectionTitle>
          <p className="text-sm text-muted">Formulario de bienvenida completado por primera vez</p>
        </div>
        <button
          onClick={() => load(page)}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-card"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-2 text-muted text-xs mb-1">
            <Users className="h-3.5 w-3.5" /> Total visitantes
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{total}</p>
        </div>
        {(["celular", "tablet", "computadora"] as const).map((d) => (
          <div key={d} className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 text-muted text-xs mb-1 capitalize">
              {DEVICE_ICONS[d]} {d}
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{deviceCounts[d] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted gap-3">
            <Users className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aún no hay visitantes registrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 dark:bg-surface text-left text-xs text-muted">
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Nombre</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Dispositivos</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell">Navegador</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border last:border-0 hover:bg-gray-50/50 dark:hover:bg-surface/50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-surface/20"}`}
                  >
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.devices.map((d) => (
                          <span
                            key={d}
                            className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DEVICE_COLORS[d] ?? "bg-gray-100 text-[var(--text-secondary)]"}`}
                          >
                            {DEVICE_ICONS[d]}{d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell">
                      <span className="text-xs text-muted truncate max-w-50 block" title={row.userAgent ?? ""}>
                        {row.userAgent
                          ? row.userAgent.replace(/ \(.*\)/, "").slice(0, 60)
                          : "—"}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-muted whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-t border-border">
            <span className="text-xs text-muted">
              Página {page} de {totalPages} · {total} registros
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg border border-border hover:bg-card disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg border border-border hover:bg-card disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
