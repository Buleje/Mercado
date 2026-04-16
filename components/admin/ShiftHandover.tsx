"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from "react";
import { ClipboardList, Clock, History, ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const STORAGE_KEY = "shift_handovers";

/* ── Types ── */
type ShiftRecord = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  cashierName: string;
  totalSales: number;
  saleCount: number;
  notes: string;
};

type SaleRecord = {
  id: string;
  total: number;
  cashierName: string;
  createdAt: string;
  items?: { productName: string; quantity: number }[];
};

/* ── Component ── */
export default function ShiftHandover() {
  const [handovers, setHandovers] = useState<ShiftRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"current" | "close" | "history">("current");
  const [notes, setNotes] = useState("");
  const [cashierName, setCashierName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Cargar historial de localStorage */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHandovers(JSON.parse(stored));
    } catch {
      /* silencio */
    }
  }, []);

  /* Cargar ventas del turno actual */
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setLoading(true);

    fetch(`/api/sales?date=${today}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        const rows: SaleRecord[] = Array.isArray(data) ? data : data?.sales ?? [];
        setSales(rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const todayStats = useMemo(() => {
    const total = sales.reduce((s, r) => s + r.total, 0);
    const count = sales.length;
    return { total, count };
  }, [sales]);

  const lastHandover = handovers[0];

  /* Cerrar turno */
  const handleClose = () => {
    if (!cashierName.trim()) return;
    const record: ShiftRecord = {
      id: crypto.randomUUID(),
      openedAt: new Date(Date.now() - 8 * 3600000).toISOString(), // asume 8h de turno
      closedAt: new Date().toISOString(),
      cashierName: cashierName.trim(),
      totalSales: todayStats.total,
      saleCount: todayStats.count,
      notes: notes.trim(),
    };
    const updated = [record, ...handovers].slice(0, 10);
    setHandovers(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setNotes("");
    setView("history");
  };

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#00B4A6]" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Entrega de Turno
          </h2>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800">
          {(["current", "close", "history"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                view === v
                  ? "bg-[#00B4A6] text-white"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              )}
            >
              {v === "current" ? "Turno actual" : v === "close" ? "Cerrar turno" : "Historial"}
            </button>
          ))}
        </div>
      </div>

      {/* Notas del turno anterior */}
      {lastHandover && view === "current" && (
        <div className="rounded-xl border border-[#f97316]/40 bg-[#f97316]/5 dark:bg-[#f97316]/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#f97316]" />
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Notas del turno anterior —{" "}
              <span className="font-bold">{lastHandover.cashierName}</span>
            </p>
          </div>
          {lastHandover.notes ? (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {lastHandover.notes}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              Sin notas para este turno.
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Cerrado:{" "}
            {new Date(lastHandover.closedAt ?? "").toLocaleString("es-PE", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>
      )}

      {/* Vista: Turno actual */}
      {view === "current" && (
        <>
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Cargando datos del turno...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ventas del turno</p>
                <p className="text-2xl font-bold text-[#00B4A6] dark:text-[#2dd4bf]">
                  {fmt(todayStats.total)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Transacciones</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {todayStats.count}
                </p>
              </div>
            </div>
          )}

          {!loading && sales.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ultimas ventas del turno
                </p>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-48 overflow-y-auto">
                {sales.slice(0, 10).map((s) => (
                  <div
                    key={s.id}
                    className="px-4 py-2.5 flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600 dark:text-gray-400 text-xs">
                      {new Date(s.createdAt).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {fmt(s.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Vista: Cerrar turno */}
      {view === "close" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Resumen de cierre
          </p>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-750 px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Ventas</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {fmt(todayStats.total)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-750 px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Transacciones</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {todayStats.count}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Tu nombre (cajero)
            </label>
            <input
              type="text"
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              placeholder="Ej: Maria Lopez"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Notas para el siguiente turno
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Ej: Queda poco azucar, hay un pedido pendiente de Juan, la impresora falla..."
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00B4A6] resize-none"
            />
          </div>

          <button
            onClick={handleClose}
            disabled={!cashierName.trim()}
            className="w-full py-2.5 rounded-lg bg-[#00B4A6] hover:bg-[#235c43] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cerrar turno y guardar notas
          </button>
        </div>
      )}

      {/* Vista: Historial */}
      {view === "history" && (
        <div className="space-y-3">
          {handovers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              No hay cierres de turno registrados.
            </div>
          ) : (
            handovers.map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedId((prev) => (prev === h.id ? null : h.id))
                  }
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <History className="w-4 h-4 text-gray-400" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {h.cashierName}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(h.closedAt ?? "").toLocaleString("es-PE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#00B4A6] dark:text-[#2dd4bf]">
                      {fmt(h.totalSales)}
                    </span>
                    {expandedId === h.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>
                {expandedId === h.id && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-gray-50 dark:bg-gray-750 px-3 py-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Ventas</p>
                        <p className="font-medium">{fmt(h.totalSales)}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 dark:bg-gray-750 px-3 py-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Transacciones</p>
                        <p className="font-medium">{h.saleCount}</p>
                      </div>
                    </div>
                    {h.notes && (
                      <div className="rounded-lg bg-[#f97316]/5 border border-[#f97316]/20 px-3 py-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Notas</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {h.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
