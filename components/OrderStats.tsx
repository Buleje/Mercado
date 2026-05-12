import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, Package, Users, Clock, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface OrderStatsProps {
  totalOrders: number;
  totalRevenue: number;
  totalCogs?: number;
  pendingOrders: number;
  completedOrders: number;
  averageOrderValue: number;
  conversionRate?: number;
  periodLabel?: string;
  previousPeriodComparison?: {
    orders: number;
    revenue: number;
  };
  compact?: boolean;
}

export function OrderStats({
  totalOrders,
  totalRevenue,
  totalCogs,
  pendingOrders,
  completedOrders,
  averageOrderValue,
  conversionRate,
  periodLabel = "Este mes",
  previousPeriodComparison,
  compact = false,
}: OrderStatsProps) {
  const stats = [
    {
      label: "Total Pedidos",
      value: totalOrders.toString(),
      icon: ShoppingCart,
      color: "text-[var(--data-success-600)] dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
      change: previousPeriodComparison?.orders,
    },
    {
      label: "Ingresos",
      value: `S/${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "text-[var(--data-success-600)] dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
      change: previousPeriodComparison?.revenue,
    },
    {
      label: "Pendientes",
      value: pendingOrders.toString(),
      icon: Clock,
      color: "text-[var(--data-warning-600)] dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-950/20",
    },
    {
      label: "Completados",
      value: completedOrders.toString(),
      icon: CheckCircle2,
      color: "text-[var(--accent)] dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-950/20",
    },
  ];

  if (!compact) {
    stats.push(
      {
        label: "Ticket Promedio",
        value: `S/${averageOrderValue.toFixed(2)}`,
        icon: Package,
        color: "text-indigo-600 dark:text-indigo-400",
        bgColor: "bg-indigo-50 dark:bg-indigo-950/20",
      }
    );

    if (conversionRate !== undefined) {
      stats.push({
        label: "Tasa Conversión",
        value: `${conversionRate.toFixed(1)}%`,
        icon: Users,
        color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
        bgColor: "bg-rose-50 dark:bg-rose-950/20",
      });
    }
    if (totalCogs !== undefined && totalCogs > 0) {
      const profit = totalRevenue - totalCogs;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      stats.push({
        label: `Ganancia (${margin.toFixed(0)}%)`,
        value: `S/${profit.toFixed(2)}`,
        icon: TrendingUp,
        color: profit >= 0 ? "text-[var(--data-success-600)] dark:text-emerald-400" : "text-[var(--data-error-600)] dark:text-red-400",
        bgColor: profit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20",
      });
    }
  }

  return (
    <div className="space-y-3">
      {periodLabel && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700 dark:text-[var(--text-primary)]/80">{periodLabel}</h3>
        </div>
      )}
      
      <div className={cn(
        "grid gap-3",
        compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      )}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          const hasIncrease = stat.change !== undefined && stat.change > 0;
          const hasDecrease = stat.change !== undefined && stat.change < 0;
          
          return (
            <div
              key={stat.label}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3.5 sm:p-4 transition-all hover:shadow-[var(--shadow-md)] hover:border-primary/20 dark:hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                  <Icon className={cn("h-4 w-4", stat.color)} />
                </div>
                {stat.change !== undefined && (
                  <div className={cn(
                    "flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded",
                    hasIncrease && "text-[var(--data-success-600)] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20",
                    hasDecrease && "text-[var(--data-error-600)] dark:text-red-400 bg-red-50 dark:bg-red-950/20"
                  )}>
                    {hasIncrease && <TrendingUp className="h-3 w-3" />}
                    {hasDecrease && <TrendingDown className="h-3 w-3" />}
                    <span>{hasIncrease && "+"}{Number(stat.change).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-[var(--text-primary)] mb-0.5">
                {stat.value}
              </p>
              <p className="text-xs font-medium text-gray-500 dark:text-muted">
                {stat.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrderStatsLoading({ compact = false }: { compact?: boolean }) {
  const count = compact ? 4 : 6;
  
  return (
    <div className="space-y-3">
      <div className="h-5 w-24 bg-gray-200 dark:bg-surface rounded animate-pulse" />
      
      <div className={cn(
        "grid gap-3",
        compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      )}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3.5 sm:p-4 animate-pulse"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="h-8 w-8 bg-gray-200 dark:bg-surface rounded-lg" />
              <div className="h-5 w-12 bg-gray-200 dark:bg-surface rounded" />
            </div>
            <div className="h-7 w-20 bg-gray-200 dark:bg-surface rounded mb-2" />
            <div className="h-3 w-16 bg-gray-200 dark:bg-surface rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
