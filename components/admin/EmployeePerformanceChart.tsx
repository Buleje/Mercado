"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { BarChart3, RefreshCw, ChevronDown, Users } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  payment: string;
  cashierId?: string;
  createdAt: string;
}

interface DayStats {
  date: string;         // "YYYY-MM-DD"
  dayLabel: string;     // "Lun 17"
  salesCount: number;
  revenue: number;
}

interface TopProduct {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

interface EmployeeStats {
  cashierId: string;
  displayName: string;
  thisPeriod: DayStats[];
  prevPeriod: DayStats[];
  topProducts: TopProduct[];
  totalThisWeek: number;
  totalPrevWeek: number;
  avgTicket: number;
  salesCount: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAYS_ES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toFixed(2)}`;
}

function fmtShort(n: number): string {
  if (n >= 1000) return `S/${(n / 1000).toFixed(1)}k`;
  return `S/${n.toFixed(0)}`;
}

function toDateKey(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function toDayLabel(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00"); // evitar timezone shift
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
}

function getWeekRange(offsetWeeks: number): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Dom
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function buildDisplayName(cashierId: string): string {
  if (cashierId === "sin-asignar") return "Sin asignar";
  if (cashierId.length > 20) return `Cajero ${cashierId.substring(0, 6).toUpperCase()}`;
  return cashierId;
}

function computeEmployeeStats(sales: Sale[]): EmployeeStats[] {
  const thisWeek = getWeekRange(0);
  const prevWeek = getWeekRange(-1);

  // Generar keys de dias para ambas semanas (lun-dom)
  const generateDayKeys = (range: { start: Date; end: Date }): string[] => {
    const keys: string[] = [];
    const d = new Date(range.start);
    while (d <= range.end) {
      keys.push(toDateKey(d));
      d.setDate(d.getDate() + 1);
    }
    return keys;
  };
  const thisWeekDays = generateDayKeys(thisWeek);
  const prevWeekDays = generateDayKeys(prevWeek);

  // Agrupar ventas por cajero
  const byEmployee = new Map<string, { thisPeriod: Map<string, { sales: number; rev: number }>; prevPeriod: Map<string, { sales: number; rev: number }>; products: Map<string, { qty: number; rev: number }> }>();

  for (const sale of sales) {
    const cashierId = sale.cashierId ?? "sin-asignar";
    if (!byEmployee.has(cashierId)) {
      byEmployee.set(cashierId, {
        thisPeriod: new Map(),
        prevPeriod: new Map(),
        products: new Map(),
      });
    }
    const emp = byEmployee.get(cashierId)!;
    const saleDate = new Date(sale.createdAt);
    const dateKey = toDateKey(saleDate);

    if (thisWeekDays.includes(dateKey)) {
      const day = emp.thisPeriod.get(dateKey) ?? { sales: 0, rev: 0 };
      day.sales += 1;
      day.rev += sale.total;
      emp.thisPeriod.set(dateKey, day);

      // Productos
      for (const item of sale.items) {
        const prod = emp.products.get(item.name) ?? { qty: 0, rev: 0 };
        prod.qty += item.quantity;
        prod.rev += item.price * item.quantity;
        emp.products.set(item.name, prod);
      }
    } else if (prevWeekDays.includes(dateKey)) {
      const day = emp.prevPeriod.get(dateKey) ?? { sales: 0, rev: 0 };
      day.sales += 1;
      day.rev += sale.total;
      emp.prevPeriod.set(dateKey, day);
    }
  }

  // Convertir a EmployeeStats
  return Array.from(byEmployee.entries()).map(([cashierId, data]) => {
    const thisPeriod: DayStats[] = thisWeekDays.map((dk) => {
      const d = data.thisPeriod.get(dk) ?? { sales: 0, rev: 0 };
      return { date: dk, dayLabel: toDayLabel(dk), salesCount: d.sales, revenue: d.rev };
    });
    const prevPeriod: DayStats[] = prevWeekDays.map((dk) => {
      const d = data.prevPeriod.get(dk) ?? { sales: 0, rev: 0 };
      return { date: dk, dayLabel: toDayLabel(dk), salesCount: d.sales, revenue: d.rev };
    });

    const topProducts: TopProduct[] = Array.from(data.products.entries())
      .map(([name, p]) => ({ name, totalQty: p.qty, totalRevenue: p.rev }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    const totalThisWeek = thisPeriod.reduce((s, d) => s + d.revenue, 0);
    const totalPrevWeek = prevPeriod.reduce((s, d) => s + d.revenue, 0);
    const salesCount = thisPeriod.reduce((s, d) => s + d.salesCount, 0);
    const avgTicket = salesCount > 0 ? totalThisWeek / salesCount : 0;

    return {
      cashierId,
      displayName: buildDisplayName(cashierId),
      thisPeriod,
      prevPeriod,
      topProducts,
      totalThisWeek,
      totalPrevWeek,
      avgTicket,
      salesCount,
    };
  }).sort((a, b) => b.totalThisWeek - a.totalThisWeek);
}

// ─── Subcomponente: Barras comparativas ───────────────────────────────────────

function ComparisonBars({
  thisPeriod,
  prevPeriod,
}: {
  thisPeriod: DayStats[];
  prevPeriod: DayStats[];
}) {
  const allRevs = [...thisPeriod, ...prevPeriod].map((d) => d.revenue);
  const maxRev = Math.max(...allRevs, 1);

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#00B4A6]" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Esta semana</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Semana anterior</span>
        </div>
      </div>

      <div className="flex items-end gap-1.5" style={{ height: 100 }}>
        {thisPeriod.map((day, idx) => {
          const prevDay = prevPeriod[idx];
          const thisH = Math.max((day.revenue / maxRev) * 80, day.revenue > 0 ? 4 : 0);
          const prevH = Math.max((prevDay.revenue / maxRev) * 80, prevDay.revenue > 0 ? 4 : 0);

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center group">
              {/* Tooltip */}
              {(day.revenue > 0 || prevDay.revenue > 0) && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] rounded px-1.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 space-y-0.5">
                  <div>Esta: {fmt(day.revenue)}</div>
                  {prevDay.revenue > 0 && <div>Ant: {fmt(prevDay.revenue)}</div>}
                </div>
              )}

              {/* Par de barras */}
              <div className="w-full flex items-end gap-0.5" style={{ height: 80 }}>
                <div
                  className="flex-1 bg-[#00B4A6] dark:bg-[#2dd4bf] rounded-t transition-all duration-500"
                  style={{ height: `${thisH}px` }}
                />
                <div
                  className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-t transition-all duration-500"
                  style={{ height: `${prevH}px` }}
                />
              </div>

              {/* Etiqueta dia */}
              <span className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 leading-none">
                {day.dayLabel.split(" ")[0]}
                <br />
                {day.dayLabel.split(" ")[1]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Subcomponente: Tabla top productos ───────────────────────────────────────

function TopProductsTable({ products }: { products: TopProduct[] }) {
  if (products.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Sin ventas esta semana</p>;
  }
  const maxRev = Math.max(...products.map((p) => p.totalRevenue), 1);

  return (
    <div className="space-y-2">
      {products.map((p, i) => {
        const barPct = (p.totalRevenue / maxRev) * 100;
        return (
          <div key={p.name} className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-4 text-right flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-700 dark:text-gray-300 truncate font-medium">{p.name}</span>
                <span className="text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">{fmt(p.totalRevenue)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#f97316] rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
              {p.totalQty} uds
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EmployeePerformanceChart() {
  const [allStats, setAllStats] = useState<EmployeeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/sales?limit=500", { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: Sale[] = await res.json();
      const stats = computeEmployeeStats(Array.isArray(data) ? data : []);
      setAllStats(stats);
      if (stats.length > 0 && !selectedId) {
        setSelectedId(stats[0].cashierId);
      }
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selected = useMemo(
    () => allStats.find((s) => s.cashierId === selectedId) ?? null,
    [allStats, selectedId]
  );

  const weekChange =
    selected && selected.totalPrevWeek > 0
      ? ((selected.totalThisWeek - selected.totalPrevWeek) / selected.totalPrevWeek) * 100
      : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#00B4A6] dark:text-green-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Rendimiento por empleado
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {lastUpdated
                ? `Actualizado ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
                : "Cargando..."}
            </p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            "text-[#00B4A6] dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Selector de empleado */}
      {!loading && allStats.length > 0 && (
        <div className="relative">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={cn(
              "w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700",
              "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
              "px-4 py-3 pr-10 text-sm font-medium",
              "focus:outline-none focus:ring-2 focus:ring-[#00B4A6] dark:focus:ring-green-500"
            )}
          >
            {allStats.map((s) => (
              <option key={s.cashierId} value={s.cashierId}>
                {s.displayName} — {fmt(s.totalThisWeek)} esta semana
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      )}

      {/* Estado de carga/error */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}
      {!loading && error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-2 text-xs text-red-500 underline">
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && allStats.length === 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No hay datos de ventas disponibles
          </p>
        </div>
      )}

      {/* Contenido del empleado seleccionado */}
      {!loading && selected && (
        <>
          {/* KPIs del empleado */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Esta semana",
                value: fmtShort(selected.totalThisWeek),
                sub: weekChange != null
                  ? `${weekChange >= 0 ? "+" : ""}${weekChange.toFixed(1)}% vs ant.`
                  : "primera semana",
                subColor: weekChange != null
                  ? weekChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                  : "text-gray-400",
              },
              {
                label: "Ventas",
                value: selected.salesCount,
                sub: "esta semana",
                subColor: "text-gray-400 dark:text-gray-500",
              },
              {
                label: "Ticket prom.",
                value: fmtShort(selected.avgTicket),
                sub: "por venta",
                subColor: "text-gray-400 dark:text-gray-500",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-center"
              >
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{kpi.label}</p>
                <p className="font-bold text-lg text-gray-900 dark:text-gray-100">{kpi.value}</p>
                <p className={cn("text-xs", kpi.subColor)}>{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Grafico de barras comparativo */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Ventas por dia (esta semana vs anterior)
            </h3>
            <ComparisonBars
              thisPeriod={selected.thisPeriod}
              prevPeriod={selected.prevPeriod}
            />
          </div>

          {/* Top 5 productos */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Productos mas vendidos (esta semana)
            </h3>
            <TopProductsTable products={selected.topProducts} />
          </div>

          {/* Comparativa semanas */}
          {selected.totalPrevWeek > 0 && (
            <div className={cn(
              "rounded-xl p-3 flex items-center justify-between",
              weekChange != null && weekChange >= 0
                ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            )}>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Semana anterior: <strong>{fmt(selected.totalPrevWeek)}</strong>
              </span>
              {weekChange != null && (
                <span className={cn(
                  "text-sm font-bold",
                  weekChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                )}>
                  {weekChange >= 0 ? "+" : ""}{weekChange.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
