"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingUp, Clock, CheckCircle2, DollarSign } from "lucide-react";

type ScorecardData = {
  score: number | null;
  grade: string | null;
  metrics: {
    onTimeDelivery: number;
    avgDeliveryDays: number;
    completionRate: number;
    priceVariance: number;
    speedScore: number;
  } | null;
  totalOC: number;
  lastDelivery: string | null;
  insufficient: boolean;
};

interface SupplierScorecardProps {
  supplierId: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  B: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  C: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  D: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function MetricBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const color = value > 70 ? "bg-emerald-500" : value > 55 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-gray-600 dark:text-muted font-medium">
          <Icon className="h-3 w-3" /> {label}
        </span>
        <span className="font-bold text-gray-900 dark:text-foreground">{value}%</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-2 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

export default function SupplierScorecard({ supplierId }: SupplierScorecardProps) {
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/proveedores/${supplierId}/scorecard`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!cancelled && res) setData(res);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supplierId]);

  if (loading) return <SkeletonCard />;
  if (!data) return null;

  if (data.insufficient) {
    return (
      <div className="bg-gray-50 dark:bg-accent/50 border border-gray-200 dark:border-card-border rounded-xl p-4 text-center">
        <AlertTriangle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-muted">
          Sin historial suficiente para evaluar (min. 3 OC)
        </p>
        <p className="text-xs text-gray-400 dark:text-muted mt-1">
          Actualmente: {data.totalOC} orden{data.totalOC !== 1 ? "es" : ""}
        </p>
      </div>
    );
  }

  const score = data.score ?? 0;
  const scoreColor = score > 70 ? "text-emerald-600" : score > 55 ? "text-amber-600" : "text-red-600";
  const ringColor = score > 70 ? "stroke-emerald-500" : score > 55 ? "stroke-amber-500" : "stroke-red-500";

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 space-y-4">
      {/* Score + Grade */}
      <div className="flex items-center gap-4">
        {/* Circular score */}
        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className="stroke-gray-200 dark:stroke-gray-700" />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className={ringColor}
              strokeDasharray={`${(score / 100) * 175.93} 175.93`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("text-sm font-extrabold", scoreColor)}>{score}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className={cn("text-2xl font-extrabold px-2.5 py-0.5 rounded-lg", GRADE_COLORS[data.grade ?? "D"])}>
              {data.grade}
            </span>
            {score > 70 ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Proveedor confiable
              </span>
            ) : score <= 55 ? (
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Revisa condiciones
              </span>
            ) : null}
          </div>
          <p className="text-xs text-gray-500 dark:text-muted mt-1">
            Basado en {data.totalOC} ordenes de compra
          </p>
        </div>
      </div>

      {/* Metric bars */}
      {data.metrics && (
        <div className="space-y-3">
          <MetricBar label="Entregas a tiempo" value={data.metrics.onTimeDelivery} icon={Clock} />
          <MetricBar label="Tasa completado" value={data.metrics.completionRate} icon={CheckCircle2} />
          <MetricBar label="Consistencia precios" value={data.metrics.priceVariance} icon={DollarSign} />
          <MetricBar label="Velocidad entrega" value={data.metrics.speedScore} icon={TrendingUp} />
        </div>
      )}
    </div>
  );
}
