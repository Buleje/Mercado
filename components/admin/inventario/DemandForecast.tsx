'use client';

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

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-muted text-sm">
        Sin datos de ventas para este producto en los ultimos 30 dias
      </div>
    );
  }

  const trendIcon = data.trend === 'SUBIENDO' ? '\u2191' : data.trend === 'BAJANDO' ? '\u2193' : '\u2192';
  const trendColor = data.trend === 'SUBIENDO' ? 'text-green-600' : data.trend === 'BAJANDO' ? 'text-red-600' : 'text-gray-600';

  const stockColor = data.daysOfStock < 3 ? 'text-red-600' : data.daysOfStock < 7 ? 'text-amber-600' : 'text-green-600';
  const stockBg = data.daysOfStock < 3 ? 'bg-red-50 dark:bg-red-900/20' : data.daysOfStock < 7 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-green-50 dark:bg-green-900/20';

  // Format chart data
  const chartData = data.historicalSales.map(s => ({
    date: new Date(s.date).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }),
    qty: s.qty,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">
          Pronostico: {data.product.name}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-muted mb-3">Ventas diarias (ultimos 30 dias)</h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
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
                stroke="#f97316"
                strokeDasharray="4 4"
                label={{
                  value: `Prom: ${data.dailyAvg}`,
                  position: 'right',
                  fontSize: 10,
                  fill: '#f97316',
                }}
              />
              <Bar dataKey="qty" fill="#00B4A6" radius={[2, 2, 0, 0]} name="Vendidos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
          <div className="text-xs text-gray-500 dark:text-muted mb-1">Venta promedio</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-gray-900 dark:text-foreground">{data.dailyAvg}</span>
            <span className="text-xs text-gray-500">und/dia</span>
          </div>
          <div className={`text-xs font-medium ${trendColor} mt-1`}>
            {trendIcon} {data.trend}
          </div>
        </div>

        <div className={`rounded-xl border border-gray-200 dark:border-card-border p-4 ${stockBg}`}>
          <div className="text-xs text-gray-500 dark:text-muted mb-1">Stock alcanza para</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${stockColor}`}>
              {data.daysOfStock > 90 ? '90+' : data.daysOfStock}
            </span>
            <span className="text-xs text-gray-500">dias</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Stock actual: {data.product.stock}
          </div>
        </div>

        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
          <div className="text-xs text-gray-500 dark:text-muted mb-1">Comprar cuando llegues a</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-[#f97316]">{data.reorderPoint}</span>
            <span className="text-xs text-gray-500">unidades</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Buffer de 1 semana</div>
        </div>

        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
          <div className="text-xs text-gray-500 dark:text-muted mb-1">Pronostico proximos 7 dias</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-[#00B4A6]">~{data.forecastNext7}</span>
            <span className="text-xs text-gray-500">unidades</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Semanal: {data.weeklyAvg}</div>
        </div>
      </div>

      {/* Seasonal note */}
      {data.seasonalNote && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-sm text-amber-800 dark:text-amber-400 font-medium">
            {data.seasonalNote}
          </p>
        </div>
      )}
    </div>
  );
}
