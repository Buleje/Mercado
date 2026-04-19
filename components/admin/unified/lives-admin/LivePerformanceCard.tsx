"use client";

/**
 * LivePerformanceCard — Card compacto con stats de una transmisión pasada.
 *
 * Muestra views, engagement, conversión y revenue de cada live.
 */

import { Radio, Eye, ShoppingBag, DollarSign, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface PastLive {
  id: string;
  title: string;
  date: string;
  durationMin: number;
  peakViewers: number;
  totalViews: number;
  ordersGenerated: number;
  revenue: number;
  engagement: number;
}

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

interface Props {
  live: PastLive;
  onClick?: () => void;
}

export function LivePerformanceCard({ live, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-white border border-gray-200 rounded-2xl p-4 shadow-sm",
        onClick && "hover:border-[#00B4A6]/40 hover:shadow-md transition-all"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
            <p className="text-xs text-[var(--text-secondary)]">{fmtDate(live.date)} · {live.durationMin} min</p>
          </div>
          <h4 className="font-bold text-[var(--text-primary)] truncate">{live.title}</h4>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-100">
        <div>
          <div className="flex items-center gap-1 text-[var(--text-tertiary)] mb-0.5">
            <Eye className="h-3 w-3" />
            <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide font-bold">Views</span>
          </div>
          <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">{live.totalViews}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[var(--text-tertiary)] mb-0.5">
            <Clock className="h-3 w-3" />
            <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide font-bold">Engage</span>
          </div>
          <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">{live.engagement}%</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[var(--text-tertiary)] mb-0.5">
            <ShoppingBag className="h-3 w-3" />
            <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide font-bold">Pedidos</span>
          </div>
          <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">{live.ordersGenerated}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[var(--text-tertiary)] mb-0.5">
            <DollarSign className="h-3 w-3" />
            <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide font-bold">Ventas</span>
          </div>
          <p className="text-sm font-extrabold text-[#00B4A6] tabular-nums">{fmt(live.revenue)}</p>
        </div>
      </div>
    </button>
  );
}
