'use client';

import { CardTitle } from "@buleje/design-system";

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

type ForecastData = {
  historicalSales: { date: string; qty: number }[];
  dailyAvg: number;
  weeklyAvg: number;
  trend: 'SUBIENDO' | 'ESTABLE' | 'BAJANDO';
  forecastNext7: number;
  daysOfStock: number;
  reorderPoint: number;
  seasonalNote: string | null;
  product: { id: number; name: string; stock: number; stockMin: number };
};

interface DemandForecastProps {
  productId: number;
  onClose?: () => void;
}

export default function DemandForecast({ productId, onClose }: DemandForecastProps) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

   
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/inventory/forecast?productId=${productId}&days=30`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);
   

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-[var(--text-secondary)] dark:text-muted text-sm">
        Sin datos de ventas para este producto en los últimos 30 días
      </div>
    );
  }

  const trendIcon = data.trend === 'SUBIENDO' ? '\u2191' : data.trend === 'BAJANDO' ? '\u2193' : '\u2192';
  const trendColor = data.trend === 'SUBIENDO' ? 'text-[var(--data-success-500)]' : data.trend === 'BAJANDO' ? "text-[var(--data-error-500)]" : 'text-[var(--text-secondary)]';

  const stockColor = data.daysOfStock < 3 ? "text-[var(--data-error-500)]" : data.daysOfStock < 7 ? "text-[var(--data-warning-500)]" : 'text-[var(--data-success-500)]';
  const stockBg = data.daysOfStock < 3 ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20" : data.daysOfStock < 7 ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" : 'bg-primary/10 dark:bg-primary/15';

  // Format chart data
  const chartData = data.historicalSales.map(s => ({
    date: new Date(s.date).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }),
    qty: s.qty,
  }));

  // Guard: sin historial de ventas no hay nada que graficar
  const hasChartData = chartData.some(d => d.qty > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          Pronostico: {data.product.name}
        </CardTitle>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Chart — se oculta si no hay ventas registradas en los últimos 30 días */}
      {hasChartData && (<div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)] dark:text-muted mb-3">Ventas diarias (últimos 30 días)</h4>
        <div className="h-48">
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                interval={Math.floor(chartData.length / 7)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <ReferenceLine
                y={data.dailyAvg}
                stroke="#ff6b5b"
                strokeDasharray="4 4"
                label={{
                  value: `Prom: ${data.dailyAvg}`,
                  position: 'right',
                  fontSize: 10,
                  fill: '#ff6b5b',
                }}
              />
              <Bar dataKey="qty" fill="var(--accent)" radius={[2, 2, 0, 0]} name="Vendidos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>)}

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
          <div className="text-xs text-[var(--text-secondary)] dark:text-muted mb-1">Venta promedio</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{data.dailyAvg}</span>
            <span className="text-xs text-[var(--text-secondary)]">und/dia</span>
          </div>
          <div className={`text-xs font-medium ${trendColor} mt-1`}>
            {trendIcon} {data.trend}
          </div>
        </div>

        <div className={`rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 ${stockBg}`}>
          <div className="text-xs text-[var(--text-secondary)] dark:text-muted mb-1">Stock alcanza para</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${stockColor}`}>
              {data.daysOfStock > 90 ? '90+' : data.daysOfStock}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">dias</span>
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Stock actual: {data.product.stock}
          </div>
        </div>

        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
          <div className="text-xs text-[var(--text-secondary)] dark:text-muted mb-1">Comprar cuando llegues a</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-[var(--data-warning-500)]">{data.reorderPoint}</span>
            <span className="text-xs text-[var(--text-secondary)]">unidades</span>
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">Buffer de 1 semana</div>
        </div>

        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
          <div className="text-xs text-[var(--text-secondary)] dark:text-muted mb-1">Pronostico proximos 7 dias</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-primary">~{data.forecastNext7}</span>
            <span className="text-xs text-[var(--text-secondary)]">unidades</span>
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">Semanal: {data.weeklyAvg}</div>
        </div>
      </div>

      {/* Seasonal note */}
      {data.seasonalNote && (
        <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-4">
          <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">
            {data.seasonalNote}
          </p>
        </div>
      )}
    </div>
  );
}
