"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, TrendingUp, ShoppingCart, DollarSign, Users } from "@buleje/design-system/icons";

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

interface CashierStats {
  cashierId: string;
  displayName: string;
  salesCount: number;
  totalRevenue: number;
  avgTicket: number;
  lastSaleAt: string | null;
}

interface RankedCashier extends CashierStats {
  rank: number;
  prevRank?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toFixed(2)}`;
}

function buildDisplayName(cashierId: string): string {
  // Si el ID es un UUID o string largo, acortar para mostrar
  if (cashierId.length > 20) {
    return `Cajero ${cashierId.substring(0, 6).toUpperCase()}`;
  }
  return cashierId;
}

function groupSalesByCashier(sales: Sale[]): CashierStats[] {
  const map = new Map<string, { totalRevenue: number; salesCount: number; lastSaleAt: string }>();

  for (const sale of sales) {
    const key = sale.cashierId ?? "sin-asignar";
    const existing = map.get(key);
    const saleDate = sale.createdAt;
    if (!existing) {
      map.set(key, { totalRevenue: sale.total, salesCount: 1, lastSaleAt: saleDate });
    } else {
      existing.totalRevenue += sale.total;
      existing.salesCount += 1;
      if (saleDate > existing.lastSaleAt) existing.lastSaleAt = saleDate;
    }
  }

  return Array.from(map.entries()).map(([cashierId, stats]) => ({
    cashierId,
    displayName: buildDisplayName(cashierId),
    salesCount: stats.salesCount,
    totalRevenue: stats.totalRevenue,
    avgTicket: stats.salesCount > 0 ? stats.totalRevenue / stats.salesCount : 0,
    lastSaleAt: stats.lastSaleAt,
  }));
}

// ─── Subcomponente: Medalla/Corona ────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-10 h-10 rounded-full bg-[var(--text-primary)] flex items-center justify-center flex-shrink-0">
        <span className="text-lg" role="img" aria-label="primer lugar">&#x1F451;</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-10 h-10 rounded-full bg-[var(--text-tertiary)] flex items-center justify-center flex-shrink-0">
        <span className="text-lg" role="img" aria-label="segundo lugar">&#x1F948;</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-10 h-10 rounded-full bg-[var(--text-primary)] flex items-center justify-center flex-shrink-0">
        <span className="text-lg" role="img" aria-label="tercer lugar">&#x1F949;</span>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-[var(--text-tertiary)]">{rank}</span>
    </div>
  );
}

// ─── Subcomponente: Fila de ranking ──────────────────────────────────────────

function RankRow({
  cashier,
  isAnimating,
}: {
  cashier: RankedCashier;
  isAnimating: boolean;
}) {
  const isTop3 = cashier.rank <= 3;
  const movedUp = cashier.prevRank != null && cashier.rank < cashier.prevRank;
  const movedDown = cashier.prevRank != null && cashier.rank > cashier.prevRank;

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all duration-[var(--dur-slow)]",
        isAnimating && "animate-pulse",
        cashier.rank === 1
          ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 dark:border-[var(--data-warning-500)]"
          : cashier.rank === 2
          ? "border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 dark:border-gray-600"
          : cashier.rank === 3
          ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 dark:border-[var(--data-warning-500)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      )}
    >
      <RankBadge rank={cashier.rank} />

      {/* Nombre + cambio de posicion */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            "font-semibold truncate",
            isTop3 ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          )}>
            {cashier.displayName}
          </p>
          {movedUp && (
            <span className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium flex-shrink-0">
              &#9650; subi
            </span>
          )}
          {movedDown && (
            <span className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium flex-shrink-0">
              &#9660; bajo
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          {cashier.salesCount} venta{cashier.salesCount !== 1 ? "s" : ""} &bull; ticket prom. {fmt(cashier.avgTicket)}
        </p>
      </div>

      {/* Total */}
      <div className="text-right flex-shrink-0">
        <p className={cn(
          "font-bold text-lg",
          cashier.rank === 1
            ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
            : "text-primary dark:text-[var(--data-success-500)]"
        )}>
          {fmt(cashier.totalRevenue)}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">total vendido</p>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos

export default function CashierRanking() {
  const [ranking, setRanking] = useState<RankedCashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevRankingRef = useRef<Map<string, number>>(new Map());

  const fetchRanking = useCallback(async () => {
    try {
      const res = await fetch("/api/sales?today=1", { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data: Sale[] = await res.json();

      // Filtrar ventas de hoy
      const today = new Date().toDateString();
      const todaySales = Array.isArray(data)
        ? data.filter((s) => new Date(s.createdAt).toDateString() === today)
        : [];

      const stats = groupSalesByCashier(todaySales);
      stats.sort((a, b) => b.totalRevenue - a.totalRevenue);

      const prevMap = prevRankingRef.current;
      const ranked: RankedCashier[] = stats.map((c, idx) => ({
        ...c,
        rank: idx + 1,
        prevRank: prevMap.get(c.cashierId),
      }));

      // Detectar cambios de posicion para animar
      const hasChanges = ranked.some((r) => r.prevRank != null && r.prevRank !== r.rank);
      if (hasChanges) {
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 1000);
      }

      // Guardar ranking nuevo como referencia
      const newMap = new Map<string, number>();
      ranked.forEach((r) => newMap.set(r.cashierId, r.rank));
      prevRankingRef.current = newMap;

      setRanking(ranked);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ventas");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial + auto-refresh — pausa si la pestaña está oculta para
  // ahorrar cuota de DB cuando el admin abre otra tab. (BUG-FIX audit 2026-05-05)
  useEffect(() => {
    fetchRanking();
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(fetchRanking, REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchRanking();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchRanking]);

  // ── Estadisticas globales del dia
  const totalVentas = ranking.reduce((s, c) => s + c.salesCount, 0);
  const totalIngresos = ranking.reduce((s, c) => s + c.totalRevenue, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary dark:text-[var(--data-success-500)]" />
          <div>
            <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
              Ranking del dia
            </SectionTitle>
            <p className="text-xs text-[var(--text-tertiary)]">
              {lastUpdated
                ? `Actualizado ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
                : "Cargando..."}
            </p>
          </div>
        </div>

        <button
          onClick={fetchRanking}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            "text-primary dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Estadisticas del dia */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Cajeros activos", value: ranking.length, icon: <Users className="w-4 h-4" /> },
          { label: "Ventas totales", value: totalVentas, icon: <ShoppingCart className="w-4 h-4" /> },
          { label: "Ingresos del dia", value: `S/${totalIngresos.toFixed(0)}`, icon: <DollarSign className="w-4 h-4" /> },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-center"
          >
            <div className="flex justify-center text-primary dark:text-[var(--data-success-500)] mb-1">
              {stat.icon}
            </div>
            <p className="font-bold text-lg text-[var(--text-primary)]">{stat.value}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Lista de ranking */}
      {loading && ranking.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 p-4 text-center">
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
          <button
            onClick={fetchRanking}
            className="mt-2 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] underline"
          >
            Reintentar
          </button>
        </div>
      ) : ranking.length === 0 ? (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
          <TrendingUp className="w-8 h-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-tertiary)]">
            No hay ventas registradas hoy
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ranking.map((cashier) => (
            <RankRow
              key={cashier.cashierId}
              cashier={cashier}
              isAnimating={isAnimating}
            />
          ))}
        </div>
      )}

      {/* Footer auto-refresh info */}
      <p className="text-xs text-center text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
        Se actualiza automaticamente cada 2 minutos
      </p>
    </div>
  );
}
